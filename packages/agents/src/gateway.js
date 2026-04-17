/**
 * Secure Agent Gateway
 *
 * Wraps the OpenClaw gateway client with security checks.
 * Every agent interaction passes through here — this is the SINGLE entry point.
 *
 * Security pipeline on every call:
 *   1. Check consent (consentManager.requireConsent)
 *   2. Check permissions (permissionEnforcer.canAccess)
 *   3. Classify outgoing data (dataClassifier.classifyContent)
 *   4. Redact if needed (dataClassifier.redactPII)
 *   5. Forward to OpenClaw gateway
 *   6. Log the interaction (auditLogger)
 *
 * Usage:
 *   const gateway = createSecureGateway({
 *     openclawClient,
 *     permissionEnforcer,
 *     auditLogger,
 *     consentManager,
 *     dataClassifier
 *   });
 *   const response = await gateway.sendMessage(agentId, userId, 'How do I do X?');
 *
 * Reusable across any project — inject all dependencies.
 */

// ============================================================
// Factory
// ============================================================

/**
 * Create a secure gateway wrapper.
 *
 * @param {object} deps - All dependencies injected
 * @param {object} deps.openclawClient - Raw OpenClaw gateway client (from lib/openclaw-client.js or equivalent)
 * @param {object} deps.permissionEnforcer - From shared/security/tool-permissions.js
 * @param {object} deps.auditLogger - From shared/security/audit-logger.js
 * @param {object} deps.consentManager - From shared/security/consent-manager.js
 * @param {object} deps.dataClassifier - From shared/security/data-classifier.js
 * @param {object} [deps.agentStore] - Supabase client or object with getAgent(agentId) method
 * @returns {SecureGateway}
 */
function createSecureGateway(deps) {
  const {
    openclawClient,
    permissionEnforcer,
    auditLogger,
    consentManager,
    dataClassifier,
    agentStore
  } = deps;

  if (!openclawClient) throw new Error('[secure-gateway] openclawClient is required');
  if (!permissionEnforcer) throw new Error('[secure-gateway] permissionEnforcer is required');
  if (!auditLogger) throw new Error('[secure-gateway] auditLogger is required');
  if (!consentManager) throw new Error('[secure-gateway] consentManager is required');
  if (!dataClassifier) throw new Error('[secure-gateway] dataClassifier is required');

  /**
   * Run the security pipeline before any data leaves the system.
   *
   * @param {string} agentId
   * @param {string} userId
   * @param {string} text - The content to send
   * @param {string[]} [resourcesAccessed] - Data sources being included
   * @returns {{ allowed: boolean, processedText: string, reason?: string }}
   */
  async function securityPipeline(agentId, userId, text, resourcesAccessed = []) {
    // 1. Check consent for all data sources being accessed
    for (const resource of resourcesAccessed) {
      const requiredConsents = consentManager.getRequiredConsents(resource);
      if (requiredConsents.length > 0) {
        try {
          await consentManager.requireConsent(userId, requiredConsents);
        } catch (err) {
          await auditLogger.logAccess(agentId, userId, resource, 'read', {
            blocked: true,
            reason: 'consent_missing',
            missing: err.missingConsents
          });
          return {
            allowed: false,
            processedText: '',
            reason: `Consent not granted for: ${err.missingConsents.join(', ')}`
          };
        }
      }
    }

    // 2. Check permissions for all data sources
    for (const resource of resourcesAccessed) {
      if (!permissionEnforcer.checkAndAudit(agentId, resource, 'read')) {
        return {
          allowed: false,
          processedText: '',
          reason: `Agent does not have permission to access: ${resource}`
        };
      }
    }

    // 3. Classify and process the text for LLM safety
    const processed = dataClassifier.processForLLM(text);

    if (processed.blocked) {
      await auditLogger.logAccess(agentId, userId, 'llm_input', 'write', {
        blocked: true,
        reason: processed.blockReason,
        classifications: processed.classifications.map(c => c.category)
      });
      return {
        allowed: false,
        processedText: '',
        reason: processed.blockReason
      };
    }

    // 4. Check token limit
    const maxTokens = permissionEnforcer.getMaxContextTokens();
    const estimatedTokens = Math.ceil(processed.text.length / 4); // rough estimate
    if (estimatedTokens > maxTokens) {
      return {
        allowed: false,
        processedText: '',
        reason: `Content exceeds token limit (${estimatedTokens} estimated > ${maxTokens} max)`
      };
    }

    return {
      allowed: true,
      processedText: processed.text,
      redactions: processed.redactions
    };
  }

  return {
    /**
     * Send a message to an agent with full security checks.
     *
     * @param {string} agentId - Agent UUID or OpenClaw agent ID
     * @param {string} userId - The employee's user ID
     * @param {string} message - The message content
     * @param {object} [options]
     * @param {string[]} [options.resourcesAccessed] - Data sources included in context
     * @param {string} [options.sessionId] - Chat session ID
     * @returns {AsyncGenerator<string>} Yields response chunks
     */
    async *sendMessage(agentId, userId, message, options = {}) {
      const { resourcesAccessed = [], sessionId } = options;

      // Run security pipeline on the outgoing message
      const check = await securityPipeline(agentId, userId, message, resourcesAccessed);

      if (!check.allowed) {
        yield `[Security] ${check.reason}`;
        return;
      }

      // Log the LLM call
      const callStart = Date.now();

      try {
        // Forward to OpenClaw gateway
        const stream = await openclawClient.sendMessage(agentId, check.processedText, {
          sessionId
        });

        let fullResponse = '';

        // Stream the response
        if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
          for await (const chunk of stream) {
            fullResponse += chunk;
            yield chunk;
          }
        } else if (typeof stream === 'string') {
          fullResponse = stream;
          yield stream;
        } else if (stream && stream.text) {
          fullResponse = stream.text;
          yield stream.text;
        }

        // Log completion
        const duration = Date.now() - callStart;
        await auditLogger.logLLMCall(
          agentId,
          userId,
          'openrouter', // default provider — could be made configurable
          Math.ceil(check.processedText.length / 4),
          Math.ceil(fullResponse.length / 4),
          `chat_message (${duration}ms)`
        );

      } catch (err) {
        await auditLogger.logAccess(agentId, userId, 'llm_call', 'write', {
          error: err.message,
          duration_ms: Date.now() - callStart
        });
        yield `[Error] Failed to communicate with agent: ${err.message}`;
      }
    },

    /**
     * Invoke a function/tool through an agent with security checks.
     *
     * @param {string} agentId
     * @param {string} userId
     * @param {string} functionName - The tool/function to invoke
     * @param {object} inputs - Function inputs
     * @returns {Promise<{ result?: any, error?: string, allowed: boolean }>}
     */
    async invokeFunction(agentId, userId, functionName, inputs) {
      // Check tool permission
      const allowed = permissionEnforcer.checkAndAudit(agentId, `tool:${functionName}`, 'write');

      if (!allowed) {
        return {
          allowed: false,
          error: `Agent does not have permission to invoke: ${functionName}`
        };
      }

      // Check consent for any data the function accesses
      const resource = functionName.replace(/^tool:/, '');
      const requiredConsents = consentManager.getRequiredConsents(resource);
      if (requiredConsents.length > 0) {
        try {
          await consentManager.requireConsent(userId, requiredConsents);
        } catch (err) {
          await auditLogger.logToolInvoke(agentId, userId, functionName, inputs, null, false);
          return {
            allowed: false,
            error: `Consent not granted for: ${err.missingConsents.join(', ')}`
          };
        }
      }

      // Classify inputs
      const inputStr = JSON.stringify(inputs);
      const processed = dataClassifier.processForLLM(inputStr);
      if (processed.blocked) {
        await auditLogger.logToolInvoke(agentId, userId, functionName, inputs, null, false);
        return {
          allowed: false,
          error: processed.blockReason
        };
      }

      try {
        // Forward to OpenClaw gateway
        const result = await openclawClient.invokeFunction(agentId, functionName, inputs);

        await auditLogger.logToolInvoke(agentId, userId, functionName, inputs, result, true);

        return { allowed: true, result };
      } catch (err) {
        await auditLogger.logToolInvoke(agentId, userId, functionName, inputs, { error: err.message }, true);
        return { allowed: true, error: err.message };
      }
    },

    /**
     * Read agent memory with security checks.
     *
     * @param {string} agentId
     * @param {string} userId
     * @returns {Promise<object[]>}
     */
    async readMemory(agentId, userId) {
      // Memory is always readable by the employee (their own agent)
      const allowed = permissionEnforcer.checkAndAudit(agentId, 'agent_memory', 'read');

      if (!allowed) {
        throw new Error('Agent does not have permission to read memory');
      }

      await auditLogger.logAccess(agentId, userId, 'agent_memory', 'read');

      try {
        return await openclawClient.getMemory(agentId);
      } catch (err) {
        console.error(`[secure-gateway] Memory read failed for ${agentId}:`, err.message);
        return [];
      }
    },

    /**
     * Get the security pipeline result without sending anything.
     * Useful for UI — show the user what would be redacted/blocked.
     *
     * @param {string} agentId
     * @param {string} userId
     * @param {string} text
     * @param {string[]} resourcesAccessed
     * @returns {Promise<object>}
     */
    async dryRun(agentId, userId, text, resourcesAccessed = []) {
      return securityPipeline(agentId, userId, text, resourcesAccessed);
    }
  };
}

module.exports = { createSecureGateway };
