/**
 * Agent Provisioner
 *
 * Creates and manages Coach + Assistant agent pairs per employee.
 * Handles both the database records (Supabase) and the OpenClaw gateway agents (VPS).
 *
 * Usage:
 *   const provisioner = createAgentProvisioner(supabaseClient, vpsAdminUrl, vpsAdminToken);
 *   const { assistant, coach } = await provisioner.provisionPair(orgId, employeeUserId);
 *
 * Reusable across any project — inject your own Supabase client and VPS config.
 */

const { ASSISTANT_SYSTEM_PROMPT, COACH_SYSTEM_PROMPT } = require('./prompt-templates');

// ============================================================
// Factory
// ============================================================

/**
 * Create an agent provisioner.
 *
 * @param {object} supabaseClient - Supabase client with service role
 * @param {string} vpsAdminUrl - VPS admin API base URL (e.g., 'http://1.2.3.4:18790')
 * @param {string} vpsAdminToken - Bearer token for VPS admin API
 * @param {object} [options]
 * @param {object} [options.auditLogger] - Audit logger instance
 * @param {object} [options.defaultAssistantPermissions] - Override default assistant permissions
 * @param {object} [options.defaultCoachPermissions] - Override default coach permissions
 * @returns {Provisioner}
 */
function createAgentProvisioner(supabaseClient, vpsAdminUrl, vpsAdminToken, options = {}) {
  if (!supabaseClient) throw new Error('[provisioner] supabaseClient is required');
  if (!vpsAdminUrl) throw new Error('[provisioner] vpsAdminUrl is required');
  if (!vpsAdminToken) throw new Error('[provisioner] vpsAdminToken is required');

  const { auditLogger } = options;

  // Default permissions — can be overridden per instance
  const defaultAssistantPerms = options.defaultAssistantPermissions || {
    can_read: ['activity_log', 'crm_contacts', 'email_summaries', 'task_registry', 'calendar_events', 'chat_messages', 'agent_memory'],
    can_write: ['task_suggestions', 'chat_messages', 'agent_memory'],
    cannot_access: ['financial_data', 'hr_records', 'salary_data', 'auth_tokens', 'raw_credentials', 'vault_secrets'],
    max_context_tokens: 8000
  };

  const defaultCoachPerms = options.defaultCoachPermissions || {
    can_read: ['activity_log', 'delegation_history', 'role_descriptions', 'coaching_notes', 'task_registry', 'chat_messages', 'agent_memory'],
    can_write: ['coaching_notes', 'chat_messages', 'agent_memory', 'delegation_suggestions'],
    cannot_access: ['raw_emails', 'crm_deals', 'financial_data', 'hr_records', 'salary_data', 'auth_tokens', 'raw_credentials', 'vault_secrets'],
    max_context_tokens: 8000
  };

  /**
   * Call the VPS admin API.
   */
  async function vpsRequest(method, path, body) {
    const url = `${vpsAdminUrl.replace(/\/$/, '')}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vpsAdminToken}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`VPS API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json().catch(() => ({}));
  }

  /**
   * Get employee and org info for prompt generation.
   */
  async function getEmployeeContext(orgId, employeeUserId) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('id, org_id')
      .eq('id', employeeUserId)
      .single();

    const { data: org } = await supabaseClient
      .from('organisations')
      .select('id, name, slug')
      .eq('id', orgId)
      .single();

    if (!profile) throw new Error(`Employee ${employeeUserId} not found`);
    if (!org) throw new Error(`Organisation ${orgId} not found`);
    if (profile.org_id && profile.org_id !== orgId) {
      throw new Error(`Employee ${employeeUserId} does not belong to org ${orgId}`);
    }

    return { profile, org };
  }

  return {
    /**
     * Provision both an assistant and coach agent for an employee.
     *
     * @param {string} orgId - Organisation UUID
     * @param {string} employeeUserId - Employee's profile UUID
     * @param {object} [employeeInfo] - Optional employee info for prompts
     * @param {string} [employeeInfo.name] - Employee's display name
     * @param {string} [employeeInfo.roleDescription] - Brief role description
     * @returns {Promise<{ assistant: Agent, coach: Agent }>}
     */
    async provisionPair(orgId, employeeUserId, employeeInfo = {}) {
      const { org } = await getEmployeeContext(orgId, employeeUserId);

      const employeeName = employeeInfo.name || 'the employee';
      const roleDesc = employeeInfo.roleDescription || '';

      // Generate agent IDs
      const assistantAgentId = `${org.slug}-${employeeUserId.slice(0, 8)}-assistant`;
      const coachAgentId = `${org.slug}-${employeeUserId.slice(0, 8)}-coach`;

      // Generate system prompts
      const assistantPrompt = ASSISTANT_SYSTEM_PROMPT(employeeName, org.name, roleDesc);
      const coachPrompt = COACH_SYSTEM_PROMPT(employeeName, org.name, roleDesc);

      // Create OpenClaw agents on VPS
      try {
        await vpsRequest('POST', '/agents/create', {
          agentId: assistantAgentId,
          systemPrompt: assistantPrompt
        });
      } catch (err) {
        console.warn(`[provisioner] VPS assistant creation failed (may already exist): ${err.message}`);
      }

      try {
        await vpsRequest('POST', '/agents/create', {
          agentId: coachAgentId,
          systemPrompt: coachPrompt
        });
      } catch (err) {
        console.warn(`[provisioner] VPS coach creation failed (may already exist): ${err.message}`);
      }

      // Create database records
      const assistantRecord = {
        org_id: orgId,
        employee_user_id: employeeUserId,
        agent_role: 'assistant',
        openclaw_agent_id: assistantAgentId,
        system_prompt: assistantPrompt,
        tool_permissions: defaultAssistantPerms,
        active: true
      };

      const coachRecord = {
        org_id: orgId,
        employee_user_id: employeeUserId,
        agent_role: 'coach',
        openclaw_agent_id: coachAgentId,
        system_prompt: coachPrompt,
        tool_permissions: defaultCoachPerms,
        active: true
      };

      const { data: assistant, error: aErr } = await supabaseClient
        .from('org_agents')
        .upsert(assistantRecord, { onConflict: 'org_id,employee_user_id,agent_role' })
        .select()
        .single();

      if (aErr) throw new Error(`[provisioner] Failed to create assistant record: ${aErr.message}`);

      const { data: coach, error: cErr } = await supabaseClient
        .from('org_agents')
        .upsert(coachRecord, { onConflict: 'org_id,employee_user_id,agent_role' })
        .select()
        .single();

      if (cErr) throw new Error(`[provisioner] Failed to create coach record: ${cErr.message}`);

      // Audit log
      if (auditLogger) {
        await auditLogger.logAgentLifecycle(assistant.id, employeeUserId, 'provision', 'assistant');
        await auditLogger.logAgentLifecycle(coach.id, employeeUserId, 'provision', 'coach');
      }

      return { assistant, coach };
    },

    /**
     * Deprovision (deactivate) an employee's agent pair.
     * Does not delete data — marks agents as inactive.
     *
     * @param {string} orgId
     * @param {string} employeeUserId
     */
    async deprovision(orgId, employeeUserId) {
      // Get existing agents
      const { data: agents } = await supabaseClient
        .from('org_agents')
        .select('id, agent_role, openclaw_agent_id')
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeUserId);

      if (!agents || agents.length === 0) return;

      // Deactivate in database
      await supabaseClient
        .from('org_agents')
        .update({ active: false })
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeUserId);

      // Audit log
      if (auditLogger) {
        for (const agent of agents) {
          await auditLogger.logAgentLifecycle(agent.id, employeeUserId, 'deprovision', agent.agent_role);
        }
      }
    },

    /**
     * Get an employee's agent pair.
     *
     * @param {string} orgId
     * @param {string} employeeUserId
     * @returns {Promise<{ assistant?: Agent, coach?: Agent }>}
     */
    async getAgents(orgId, employeeUserId) {
      const { data: agents } = await supabaseClient
        .from('org_agents')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeUserId)
        .eq('active', true);

      const result = {};
      for (const agent of (agents || [])) {
        result[agent.agent_role] = agent;
      }
      return result;
    },

    /**
     * List all agents in an organisation.
     *
     * @param {string} orgId
     * @param {object} [filters]
     * @param {boolean} [filters.activeOnly] - Only return active agents (default: true)
     * @param {string} [filters.agentRole] - Filter by 'assistant' or 'coach'
     * @returns {Promise<Agent[]>}
     */
    async listAgents(orgId, filters = {}) {
      let q = supabaseClient
        .from('org_agents')
        .select('*')
        .eq('org_id', orgId);

      if (filters.activeOnly !== false) {
        q = q.eq('active', true);
      }
      if (filters.agentRole) {
        q = q.eq('agent_role', filters.agentRole);
      }

      const { data } = await q.order('created_at', { ascending: false });
      return data || [];
    },

    /**
     * Update an agent's system prompt.
     *
     * @param {string} agentId - Agent UUID (database ID)
     * @param {string} newPrompt
     */
    async updateSystemPrompt(agentId, newPrompt) {
      const { data: agent } = await supabaseClient
        .from('org_agents')
        .select('openclaw_agent_id')
        .eq('id', agentId)
        .single();

      if (!agent) throw new Error(`Agent ${agentId} not found`);

      // Update database
      await supabaseClient
        .from('org_agents')
        .update({ system_prompt: newPrompt })
        .eq('id', agentId);

      // Update VPS agent (best effort)
      try {
        await vpsRequest('POST', `/agents/${agent.openclaw_agent_id}/update`, {
          systemPrompt: newPrompt
        });
      } catch (err) {
        console.warn(`[provisioner] VPS prompt update failed: ${err.message}`);
      }
    },

    /**
     * Update an agent's tool permissions.
     *
     * @param {string} agentId - Agent UUID (database ID)
     * @param {object} permissions - New ToolPermissions object
     */
    async updatePermissions(agentId, permissions) {
      await supabaseClient
        .from('org_agents')
        .update({ tool_permissions: permissions })
        .eq('id', agentId);
    }
  };
}

module.exports = { createAgentProvisioner };
