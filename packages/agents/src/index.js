/**
 * Agents Module — shared/agents
 *
 * Reusable agent provisioning, prompt templates, and secure gateway.
 * All modules use dependency injection — no project-specific imports.
 */

const { createAgentProvisioner } = require('./provisioner');
const { ASSISTANT_SYSTEM_PROMPT, COACH_SYSTEM_PROMPT, PROMPT_VERSION } = require('./prompt-templates');
const { createSecureGateway } = require('./gateway');

module.exports = {
  createAgentProvisioner,
  ASSISTANT_SYSTEM_PROMPT,
  COACH_SYSTEM_PROMPT,
  PROMPT_VERSION,
  createSecureGateway
};
