// Red Team — @caistech/security-gate/red-team

export { createRedTeamRunner } from "./runner";
export type { RedTeamRunner, RedTeamRunnerConfig } from "./runner";

export { EndpointRegistry } from "./registry";
export { RedTeamReporter } from "./reporter";

export { ALL_PROBES, getProbes, getProbe, getProbeCounts } from "./probes";
export { PROMPT_INJECTION_PROBES } from "./probes/prompt-injection";
export { ENCODING_BYPASS_PROBES } from "./probes/encoding-bypass";
export { TOOL_MANIPULATION_PROBES } from "./probes/tool-manipulation";
export { DATA_EXFILTRATION_PROBES } from "./probes/data-exfiltration";
export { CONSTRUCTION_SPECIFIC_PROBES } from "./probes/construction-specific";

export type {
  Probe,
  ProbeCategory,
  ProbeSeverity,
  ProbeResult,
  ProbeVerdict,
  RedTeamRun,
  RedTeamReport,
  RegisteredEndpoint,
} from "./types";
