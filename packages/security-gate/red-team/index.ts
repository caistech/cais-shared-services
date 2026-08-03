// Red Team — @caistech/security-gate/red-team

export { createRedTeamRunner } from "./runner.js";
export type { RedTeamRunner, RedTeamRunnerConfig } from "./runner.js";

export { EndpointRegistry } from "./registry.js";
export { RedTeamReporter } from "./reporter.js";

export { ALL_PROBES, getProbes, getProbe, getProbeCounts } from "./probes/index.js";
export { PROMPT_INJECTION_PROBES } from "./probes/prompt-injection.js";
export { ENCODING_BYPASS_PROBES } from "./probes/encoding-bypass.js";
export { TOOL_MANIPULATION_PROBES } from "./probes/tool-manipulation.js";
export { DATA_EXFILTRATION_PROBES } from "./probes/data-exfiltration.js";
export { CONSTRUCTION_SPECIFIC_PROBES } from "./probes/construction-specific.js";

export type {
  Probe,
  ProbeCategory,
  ProbeSeverity,
  ProbeResult,
  ProbeVerdict,
  RedTeamRun,
  RedTeamReport,
  RegisteredEndpoint,
} from "./types.js";

// Effect-asserted probes — the sibling of `Probe` for boundaries with no conversation, and the
// `Subject` synthetic-identity contract the runner refuses to proceed without.
// See RED_TEAM_CANONICAL.md §1.3: this contract was the most important missing piece.
export {
  assertEffectProbe,
  formatEffectRun,
  runEffectProbes,
} from './effect.js'
export type {
  EffectProbe,
  EffectProbeContext,
  EffectProbeResult,
  EffectRunResult,
  EffectVerdict,
  Subject,
} from './effect.js'
