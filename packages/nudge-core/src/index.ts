// Types
export type {
  NudgeChannel,
  NudgeTarget,
  NudgeResult,
  EvaluatorFn,
  NudgeDefinition,
  NudgeLogRow,
  NudgeEmailParams,
  NudgeEmailConfig,
  EmailTransport,
  NudgeEmailContentFn,
  CronHandlerConfig,
  CronResult,
} from "./types.js";

// Registry
export {
  createEvaluatorRegistry,
  stubEvaluator,
} from "./registry.js";
export type { EvaluatorRegistryConfig } from "./registry.js";

// Frequency cap
export {
  buildFrequencyCapIndex,
} from "./frequency-cap.js";
export type { FrequencyCapIndex } from "./frequency-cap.js";

// Email builder
export {
  buildNudgeEmailHtml,
  createEmailSender,
  appUrl,
} from "./email-builder.js";

// Cron handler
export { runNudgeCron } from "./cron-handler.js";
