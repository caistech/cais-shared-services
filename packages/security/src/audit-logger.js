/**
 * Audit Logger
 *
 * Centralised audit logging for all agent actions.
 * Writes to the agent_audit_log table via Supabase.
 * All methods are fire-and-forget (non-blocking).
 *
 * Usage:
 *   const logger = createAuditLogger(supabaseServiceClient, orgId);
 *   logger.logAccess(agentId, userId, 'crm_contacts', 'read');
 *   logger.logLLMCall(agentId, userId, 'anthropic', 1200, 800, 'task_analysis');
 *
 * Reusable across any Node.js/Next.js project — inject your own Supabase client.
 */

// ============================================================
// Action Types (for consistent labelling)
// ============================================================

const ACTIONS = {
  DATA_READ: 'data_read',
  DATA_WRITE: 'data_write',
  LLM_CALL: 'llm_call',
  TOOL_INVOKE: 'tool_invoke',
  RECOMMENDATION: 'recommendation',
  CONSENT_CHANGE: 'consent_change',
  PERMISSION_CHECK: 'permission_check',
  DATA_RETENTION_PURGE: 'data_retention_purge',
  AGENT_PROVISION: 'agent_provision',
  AGENT_DEPROVISION: 'agent_deprovision',
  ACCESS_DENIED: 'access_denied'
};

// ============================================================
// Factory
// ============================================================

/**
 * Create an audit logger bound to a specific org.
 *
 * @param {object} supabaseClient - Supabase client with service role (bypasses RLS for writes)
 * @param {string} orgId - Organisation UUID to scope all logs
 * @returns {AuditLogger}
 */
function createAuditLogger(supabaseClient, orgId) {
  if (!supabaseClient) {
    throw new Error('[audit-logger] supabaseClient is required');
  }
  if (!orgId) {
    throw new Error('[audit-logger] orgId is required');
  }

  /**
   * Internal: write a row to agent_audit_log.
   * Non-blocking — catches and logs errors, never throws.
   */
  async function writeLog(entry) {
    try {
      const { error } = await supabaseClient
        .from('agent_audit_log')
        .insert({
          org_id: orgId,
          agent_id: entry.agentId || null,
          user_id: entry.userId || null,
          action: entry.action,
          resource: entry.resource || null,
          detail: entry.detail || {},
          llm_provider: entry.llmProvider || null,
          tokens_sent: entry.tokensSent || null,
          tokens_received: entry.tokensReceived || null
        });

      if (error) {
        console.error('[audit-logger] Write failed:', error.message);
      }
    } catch (err) {
      console.error('[audit-logger] Write exception:', err.message);
    }
  }

  return {
    /**
     * Log a data access event (read or write to a resource).
     *
     * @param {string} agentId - Agent UUID or null for system actions
     * @param {string} userId - Target user whose data was accessed
     * @param {string} resource - Table name, API endpoint, or data category
     * @param {'read'|'write'} action - Access type
     * @param {object} [detail] - Additional context (keep small, avoid PII)
     */
    async logAccess(agentId, userId, resource, action, detail) {
      return writeLog({
        agentId,
        userId,
        action: action === 'write' ? ACTIONS.DATA_WRITE : ACTIONS.DATA_READ,
        resource,
        detail
      });
    },

    /**
     * Log an LLM API call.
     *
     * @param {string} agentId
     * @param {string} userId
     * @param {string} provider - 'anthropic', 'openai', 'openrouter', 'self_hosted'
     * @param {number} tokensSent
     * @param {number} tokensReceived
     * @param {string} purpose - Brief description of why the call was made
     */
    async logLLMCall(agentId, userId, provider, tokensSent, tokensReceived, purpose) {
      return writeLog({
        agentId,
        userId,
        action: ACTIONS.LLM_CALL,
        resource: `llm:${provider}`,
        llmProvider: provider,
        tokensSent,
        tokensReceived,
        detail: { purpose }
      });
    },

    /**
     * Log a tool/function invocation by an agent.
     *
     * @param {string} agentId
     * @param {string} userId
     * @param {string} toolName
     * @param {object} inputs - Sanitised inputs (no secrets/PII)
     * @param {object} outputs - Sanitised outputs summary
     * @param {boolean} allowed - Whether the permission check passed
     */
    async logToolInvoke(agentId, userId, toolName, inputs, outputs, allowed) {
      return writeLog({
        agentId,
        userId,
        action: allowed ? ACTIONS.TOOL_INVOKE : ACTIONS.ACCESS_DENIED,
        resource: `tool:${toolName}`,
        detail: {
          inputs: sanitizeForLog(inputs),
          outputs: sanitizeForLog(outputs),
          allowed
        }
      });
    },

    /**
     * Log a recommendation made by an agent (task suggestion, coaching insight).
     *
     * @param {string} agentId
     * @param {string} userId
     * @param {string} recommendationType - 'task_takeover', 'delegation', 'coaching_insight', etc.
     * @param {string} content - Brief summary of the recommendation
     */
    async logRecommendation(agentId, userId, recommendationType, content) {
      return writeLog({
        agentId,
        userId,
        action: ACTIONS.RECOMMENDATION,
        resource: `recommendation:${recommendationType}`,
        detail: { content: truncate(content, 500) }
      });
    },

    /**
     * Log a consent change event.
     *
     * @param {string} userId
     * @param {string} consentType
     * @param {boolean} granted
     */
    async logConsentChange(userId, consentType, granted) {
      return writeLog({
        agentId: null,
        userId,
        action: ACTIONS.CONSENT_CHANGE,
        resource: `consent:${consentType}`,
        detail: { granted }
      });
    },

    /**
     * Log an agent provisioning or deprovisioning event.
     *
     * @param {string} agentId
     * @param {string} userId - Employee the agent is assigned to
     * @param {'provision'|'deprovision'} action
     * @param {string} agentRole - 'assistant' or 'coach'
     */
    async logAgentLifecycle(agentId, userId, action, agentRole) {
      return writeLog({
        agentId,
        userId,
        action: action === 'provision' ? ACTIONS.AGENT_PROVISION : ACTIONS.AGENT_DEPROVISION,
        resource: `agent:${agentRole}`,
        detail: { agent_role: agentRole }
      });
    },

    /**
     * Log a data retention purge event.
     *
     * @param {string} table - Table that was purged
     * @param {number} count - Number of rows deleted
     * @param {number} retentionDays - The retention policy that triggered it
     */
    async logRetentionPurge(table, count, retentionDays) {
      return writeLog({
        agentId: null,
        userId: null,
        action: ACTIONS.DATA_RETENTION_PURGE,
        resource: table,
        detail: { rows_deleted: count, retention_days: retentionDays }
      });
    },

    /**
     * Query audit log entries with filters.
     *
     * @param {AuditFilters} filters
     * @returns {Promise<AuditEntry[]>}
     */
    async query(filters = {}) {
      let q = supabaseClient
        .from('agent_audit_log')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (filters.agentId) q = q.eq('agent_id', filters.agentId);
      if (filters.userId) q = q.eq('user_id', filters.userId);
      if (filters.action) q = q.eq('action', filters.action);
      if (filters.resource) q = q.ilike('resource', `%${filters.resource}%`);
      if (filters.from) q = q.gte('created_at', filters.from);
      if (filters.to) q = q.lte('created_at', filters.to);
      if (filters.limit) q = q.limit(filters.limit);
      else q = q.limit(100);

      const { data, error } = await q;

      if (error) {
        throw new Error(`[audit-logger] Query failed: ${error.message}`);
      }

      return data || [];
    }
  };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Sanitize an object for audit logging — remove potential secrets and truncate large values.
 */
function sanitizeForLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = {};
  const sensitiveKeys = /(?:password|secret|token|key|credential|auth)/i;

  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.test(k)) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 200) {
      sanitized[k] = v.substring(0, 200) + '...[truncated]';
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = '[object]';
    } else {
      sanitized[k] = v;
    }
  }

  return sanitized;
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/**
 * @typedef {object} AuditFilters
 * @property {string} [agentId]
 * @property {string} [userId]
 * @property {string} [action]
 * @property {string} [resource]
 * @property {string} [from] - ISO date string
 * @property {string} [to] - ISO date string
 * @property {number} [limit]
 */

/**
 * @typedef {object} AuditLogger
 * @property {Function} logAccess
 * @property {Function} logLLMCall
 * @property {Function} logToolInvoke
 * @property {Function} logRecommendation
 * @property {Function} logConsentChange
 * @property {Function} logAgentLifecycle
 * @property {Function} logRetentionPurge
 * @property {Function} query
 */

module.exports = { createAuditLogger, ACTIONS };
