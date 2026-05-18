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
}
