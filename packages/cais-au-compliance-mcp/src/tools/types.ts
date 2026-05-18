/**
 * Shared tool context — passed to every tool registrar.
 */

import type { ServerConfig } from "../config.js";
import type { Telemetry } from "../telemetry.js";

export interface ToolContext {
  config: ServerConfig;
  telemetry: Telemetry;
}
