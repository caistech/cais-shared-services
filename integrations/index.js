/**
 * Integrations — shared/integrations
 *
 * Barrel export for all third-party integration clients.
 */

const { createGHLClient, GHLError } = require('./ghl');

module.exports = {
  createGHLClient,
  GHLError,
};
