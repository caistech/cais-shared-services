/**
 * Security Module — shared/security
 *
 * Reusable security primitives for AI agent systems.
 * All modules use dependency injection — no project-specific imports.
 *
 * Copy this entire directory into any Node.js/Next.js project that
 * deploys AI agents with access to organisational data.
 */

const { createPermissionEnforcer, mergePermissions, ASSISTANT_DEFAULT, COACH_DEFAULT } = require('./tool-permissions');
const { createDataClassifier, CATEGORIES, ALWAYS_BLOCK, BLOCK_BY_DEFAULT } = require('./data-classifier');
const { createAuditLogger, ACTIONS } = require('./audit-logger');
const { createConsentManager, ConsentError, CONSENT_TYPES, CONSENT_DESCRIPTIONS } = require('./consent-manager');
const { createVault, VaultError } = require('./credential-vault');
const { createRetentionJob, PURGEABLE_TABLES, NEVER_PURGE } = require('./data-retention');

module.exports = {
  // Tool Permissions
  createPermissionEnforcer,
  mergePermissions,
  ASSISTANT_DEFAULT,
  COACH_DEFAULT,

  // Data Classification
  createDataClassifier,
  CATEGORIES,
  ALWAYS_BLOCK,
  BLOCK_BY_DEFAULT,

  // Audit Logging
  createAuditLogger,
  ACTIONS,

  // Consent Management
  createConsentManager,
  ConsentError,
  CONSENT_TYPES,
  CONSENT_DESCRIPTIONS,

  // Credential Vault
  createVault,
  VaultError,

  // Data Retention
  createRetentionJob,
  PURGEABLE_TABLES,
  NEVER_PURGE
};
