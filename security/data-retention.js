/**
 * Data Retention Job
 *
 * Auto-purges expired data per org retention settings.
 * Designed to run as a cron job (Inngest, Vercel Cron, node-cron, etc.).
 *
 * Usage:
 *   const job = createRetentionJob(supabaseServiceClient);
 *   const result = await job.run();
 *   // result = { deleted: [{ table: 'activity_log', org: 'acme', count: 142 }, ...] }
 *
 * Reusable across any Node.js/Next.js project.
 */

// ============================================================
// Tables subject to retention purge
// ============================================================

const PURGEABLE_TABLES = [
  {
    table: 'activity_log',
    timestamp_column: 'created_at',
    description: 'Employee activity tracking data'
  },
  {
    table: 'agent_audit_log',
    timestamp_column: 'created_at',
    description: 'Agent action audit trail (detail only — aggregates preserved)'
  },
  {
    table: 'chat_messages',
    timestamp_column: 'created_at',
    description: 'Agent conversation history'
  }
];

// Tables that must NEVER be purged (legal/compliance requirement)
const NEVER_PURGE = new Set([
  'consent_records',    // Legal requirement to retain consent history
  'organisations',      // Core entity
  'profiles'            // Core entity
]);

// ============================================================
// Factory
// ============================================================

/**
 * Create a data retention job.
 *
 * @param {object} supabaseClient - Supabase client with service role (bypasses RLS)
 * @param {object} [auditLogger] - Optional audit logger to record purge events
 * @returns {RetentionJob}
 */
function createRetentionJob(supabaseClient, auditLogger) {
  if (!supabaseClient) {
    throw new Error('[data-retention] supabaseClient is required');
  }

  return {
    /**
     * Run the retention job across all organisations.
     * Deletes rows older than each org's data_retention_days setting.
     *
     * @returns {Promise<RetentionResult>}
     */
    async run() {
      const startTime = Date.now();
      const deleted = [];
      const errors = [];

      // Fetch all orgs with their retention settings
      const { data: orgs, error: orgError } = await supabaseClient
        .from('organisations')
        .select('id, name, slug, data_retention_days');

      if (orgError) {
        throw new Error(`[data-retention] Failed to fetch orgs: ${orgError.message}`);
      }

      if (!orgs || orgs.length === 0) {
        return { deleted: [], errors: [], duration_ms: Date.now() - startTime };
      }

      for (const org of orgs) {
        const retentionDays = org.data_retention_days || 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoff = cutoffDate.toISOString();

        for (const { table, timestamp_column } of PURGEABLE_TABLES) {
          try {
            // Count rows to be deleted (for logging)
            const { count, error: countError } = await supabaseClient
              .from(table)
              .select('id', { count: 'exact', head: true })
              .eq('org_id', org.id)
              .lt(timestamp_column, cutoff);

            if (countError) {
              errors.push({
                table,
                org: org.slug,
                error: `Count failed: ${countError.message}`
              });
              continue;
            }

            if (!count || count === 0) continue;

            // Delete expired rows
            const { error: deleteError } = await supabaseClient
              .from(table)
              .delete()
              .eq('org_id', org.id)
              .lt(timestamp_column, cutoff);

            if (deleteError) {
              errors.push({
                table,
                org: org.slug,
                error: `Delete failed: ${deleteError.message}`
              });
              continue;
            }

            deleted.push({
              table,
              org: org.slug,
              org_id: org.id,
              count,
              retention_days: retentionDays,
              cutoff_date: cutoff
            });

            // Log the purge to audit
            if (auditLogger) {
              await auditLogger.logRetentionPurge(table, count, retentionDays);
            }

          } catch (err) {
            errors.push({
              table,
              org: org.slug,
              error: err.message
            });
          }
        }
      }

      const result = {
        deleted,
        errors,
        duration_ms: Date.now() - startTime,
        total_rows_deleted: deleted.reduce((sum, d) => sum + d.count, 0)
      };

      if (errors.length > 0) {
        console.error('[data-retention] Completed with errors:', JSON.stringify(errors));
      }

      return result;
    },

    /**
     * Dry-run: show what would be deleted without actually deleting.
     *
     * @returns {Promise<RetentionPreview[]>}
     */
    async preview() {
      const previews = [];

      const { data: orgs } = await supabaseClient
        .from('organisations')
        .select('id, name, slug, data_retention_days');

      if (!orgs) return previews;

      for (const org of orgs) {
        const retentionDays = org.data_retention_days || 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoff = cutoffDate.toISOString();

        for (const { table, timestamp_column, description } of PURGEABLE_TABLES) {
          const { count } = await supabaseClient
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('org_id', org.id)
            .lt(timestamp_column, cutoff);

          previews.push({
            org: org.slug,
            table,
            description,
            rows_to_delete: count || 0,
            retention_days: retentionDays,
            cutoff_date: cutoff
          });
        }
      }

      return previews;
    },

    /**
     * Purge all data for a specific user (e.g., when an employee leaves).
     * Respects NEVER_PURGE list — consent_records are retained.
     *
     * @param {string} userId
     * @param {string} orgId
     * @returns {Promise<{ deleted: { table: string, count: number }[] }>}
     */
    async purgeUser(userId, orgId) {
      const deleted = [];

      for (const { table } of PURGEABLE_TABLES) {
        if (NEVER_PURGE.has(table)) continue;

        const { count } = await supabaseClient
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('user_id', userId);

        if (!count || count === 0) continue;

        const { error } = await supabaseClient
          .from(table)
          .delete()
          .eq('org_id', orgId)
          .eq('user_id', userId);

        if (error) {
          console.error(`[data-retention] Failed to purge ${table} for user ${userId}:`, error.message);
          continue;
        }

        deleted.push({ table, count });
      }

      // Also deactivate their agents (don't delete — keep record)
      await supabaseClient
        .from('org_agents')
        .update({ active: false })
        .eq('org_id', orgId)
        .eq('employee_user_id', userId);

      return { deleted };
    }
  };
}

/**
 * @typedef {object} RetentionResult
 * @property {{ table: string, org: string, org_id: string, count: number, retention_days: number, cutoff_date: string }[]} deleted
 * @property {{ table: string, org: string, error: string }[]} errors
 * @property {number} duration_ms
 * @property {number} total_rows_deleted
 */

/**
 * @typedef {object} RetentionPreview
 * @property {string} org
 * @property {string} table
 * @property {string} description
 * @property {number} rows_to_delete
 * @property {number} retention_days
 * @property {string} cutoff_date
 */

module.exports = { createRetentionJob, PURGEABLE_TABLES, NEVER_PURGE };
