/**
 * @caistech/cais-au-compliance-mcp — MCP server entrypoint.
 *
 * Exposes 8 AU compliance tools as thin adapters over @caistech/* packages:
 *   - validate_abn, lookup_abn, search_business_by_name      (abn-lookup)
 *   - validate_registration_number, lookup_business          (business-registry)
 *   - screen_subject                                          (sanctions-screen)
 *   - extract_cert, list_supported_cert_types                 (cert-extractor)
 *
 * Zero domain logic lives here. All behaviour lives in the backing packages —
 * republish a package, redeploy the MCP, every install sees the new behaviour.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAbnTools } from "./tools/abn.js";
import { registerRegistryTools } from "./tools/registry.js";
import { registerSanctionsTools } from "./tools/sanctions.js";
import { registerCertTools } from "./tools/cert.js";
import { loadConfig } from "./config.js";
import { createTelemetry } from "./telemetry.js";

export const SERVER_NAME = "cais-au-compliance";
export const SERVER_VERSION = "0.1.0";

export async function buildServer(): Promise<McpServer> {
  const config = loadConfig();
  const telemetry = createTelemetry(config.telemetry);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAbnTools(server, { config, telemetry });
  registerRegistryTools(server, { config, telemetry });
  registerSanctionsTools(server, { config, telemetry });
  registerCertTools(server, { config, telemetry });

  return server;
}
