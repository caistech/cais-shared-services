/**
 * Shared tool context — passed to every tool registrar.
 */

import type { ServerConfig } from "../config.js";
import type { Telemetry } from "../telemetry.js";
import type { SessionCredentials } from "../byok.js";

export interface ToolContext {
  config: ServerConfig;
  telemetry: Telemetry;
  /**
   * Resolved per-request credentials (header source merged with env fallback).
   * Tools that need a BYOK key (e.g. extract_cert) read from here, never
   * from process.env directly.
   */
  credentials: SessionCredentials;
  /**
   * Stable install identifier supplied by the client via X-CAIS-Install-Id.
   * The handler generates a fresh UUID when the header is absent and echoes
   * it back so the client can persist it across calls. All telemetry rows
   * for this request are stamped with this id; funnel-threshold checks
   * count mcp_call rows for this id from the DB (not process-local state).
   */
  installId: string;
}
