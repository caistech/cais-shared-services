/**
 * Tool Permission Enforcer
 *
 * Server-side enforcement of what tools/data each agent can access.
 * Prompt-level restrictions are NOT security — this is the real gate.
 *
 * Usage:
 *   const enforcer = createPermissionEnforcer(ASSISTANT_DEFAULT, auditLogger);
 *   if (enforcer.canAccess('crm_contacts', 'read')) { ... }
 *
 * Reusable across any Node.js/Next.js project — no project-specific imports.
 */

// ============================================================
// Default Permission Sets
// ============================================================

/** @type {ToolPermissions} */
const ASSISTANT_DEFAULT = {
  can_read: [
    'activity_log',
    'crm_contacts',
    'email_summaries',
    'task_registry',
    'calendar_events',
    'chat_messages',
    'agent_memory'
  ],
  can_write: [
    'task_suggestions',
    'chat_messages',
    'agent_memory'
  ],
  cannot_access: [
    'financial_data',
    'hr_records',
    'salary_data',
    'auth_tokens',
    'raw_credentials',
    'vault_secrets'
  ],
  max_context_tokens: 8000
};

/** @type {ToolPermissions} */
const COACH_DEFAULT = {
  can_read: [
    'activity_log',
    'delegation_history',
    'role_descriptions',
    'coaching_notes',
    'task_registry',
    'chat_messages',
    'agent_memory'
  ],
  can_write: [
    'coaching_notes',
    'chat_messages',
    'agent_memory',
    'delegation_suggestions'
  ],
  cannot_access: [
    'raw_emails',
    'crm_deals',
    'financial_data',
    'hr_records',
    'salary_data',
    'auth_tokens',
    'raw_credentials',
    'vault_secrets'
  ],
  max_context_tokens: 8000
};

// ============================================================
// Enforcer
// ============================================================

/**
 * Create a permission enforcer for a specific agent.
 *
 * @param {ToolPermissions} permissions - The agent's permission set
 * @param {object} [auditLogger] - Optional audit logger instance (from audit-logger.js)
 * @returns {Enforcer}
 */
function createPermissionEnforcer(permissions, auditLogger) {
  const {
    can_read = [],
    can_write = [],
    cannot_access = [],
    max_context_tokens = Infinity
  } = permissions;

  // Build lookup sets for O(1) checks
  const denySet = new Set(cannot_access.map(r => r.toLowerCase()));
  const readSet = new Set(can_read.map(r => r.toLowerCase()));
  const writeSet = new Set(can_write.map(r => r.toLowerCase()));

  return {
    /**
     * Check if the agent can access a resource with the given action.
     * Deny list always wins over allow list.
     *
     * @param {string} resource - Table name, API endpoint, or data category
     * @param {'read'|'write'} action
     * @returns {boolean}
     */
    canAccess(resource, action) {
      const key = resource.toLowerCase();

      // Explicit deny always overrides
      if (denySet.has(key)) {
        return false;
      }

      if (action === 'read') {
        return readSet.has(key);
      }

      if (action === 'write') {
        return writeSet.has(key);
      }

      return false;
    },

    /**
     * Filter a list of resources to only those the agent can read.
     *
     * @param {string[]} resources
     * @returns {string[]}
     */
    filterAllowed(resources) {
      return resources.filter(r => this.canAccess(r, 'read'));
    },

    /**
     * Filter resources by a specific action.
     *
     * @param {string[]} resources
     * @param {'read'|'write'} action
     * @returns {string[]}
     */
    filterAllowedByAction(resources, action) {
      return resources.filter(r => this.canAccess(r, action));
    },

    /**
     * Log an access check to the audit log (fire-and-forget).
     *
     * @param {string} agentId
     * @param {string} resource
     * @param {'read'|'write'} action
     * @param {boolean} allowed - Whether access was granted
     */
    audit(agentId, resource, action, allowed) {
      if (!auditLogger) return;

      // Fire and forget — never block on audit logging
      auditLogger.logAccess(agentId, null, resource, action, {
        allowed,
        denied_reason: allowed ? null : (denySet.has(resource.toLowerCase()) ? 'explicit_deny' : 'not_in_allow_list')
      }).catch(err => {
        console.error('[tool-permissions] Audit log failed:', err.message);
      });
    },

    /**
     * Check access AND log the result in one call.
     * This is the preferred method for production use.
     *
     * @param {string} agentId
     * @param {string} resource
     * @param {'read'|'write'} action
     * @returns {boolean}
     */
    checkAndAudit(agentId, resource, action) {
      const allowed = this.canAccess(resource, action);
      this.audit(agentId, resource, action, allowed);
      return allowed;
    },

    /**
     * Get the max context tokens this agent is allowed per request.
     * @returns {number}
     */
    getMaxContextTokens() {
      return max_context_tokens;
    },

    /**
     * Get the raw permissions object (for serialisation/inspection).
     * @returns {ToolPermissions}
     */
    getPermissions() {
      return { can_read, can_write, cannot_access, max_context_tokens };
    }
  };
}

/**
 * Merge a base permission set with overrides.
 * Useful for per-org customisation on top of defaults.
 *
 * @param {ToolPermissions} base
 * @param {Partial<ToolPermissions>} overrides
 * @returns {ToolPermissions}
 */
function mergePermissions(base, overrides) {
  return {
    can_read: overrides.can_read || base.can_read,
    can_write: overrides.can_write || base.can_write,
    cannot_access: [
      ...new Set([
        ...(base.cannot_access || []),
        ...(overrides.cannot_access || [])
      ])
    ],
    max_context_tokens: overrides.max_context_tokens ?? base.max_context_tokens
  };
}

/**
 * @typedef {object} ToolPermissions
 * @property {string[]} can_read - Resources the agent can read
 * @property {string[]} can_write - Resources the agent can write
 * @property {string[]} cannot_access - Explicit deny list (overrides allow)
 * @property {number} [max_context_tokens] - Max tokens per request
 */

/**
 * @typedef {object} Enforcer
 * @property {(resource: string, action: 'read'|'write') => boolean} canAccess
 * @property {(resources: string[]) => string[]} filterAllowed
 * @property {(resources: string[], action: 'read'|'write') => string[]} filterAllowedByAction
 * @property {(agentId: string, resource: string, action: string, allowed: boolean) => void} audit
 * @property {(agentId: string, resource: string, action: 'read'|'write') => boolean} checkAndAudit
 * @property {() => number} getMaxContextTokens
 * @property {() => ToolPermissions} getPermissions
 */

module.exports = {
  createPermissionEnforcer,
  mergePermissions,
  ASSISTANT_DEFAULT,
  COACH_DEFAULT
};
