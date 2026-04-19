/**
 * Probe Library — all probes organized by category.
 */

import { PROMPT_INJECTION_PROBES } from "./prompt-injection";
import { ENCODING_BYPASS_PROBES } from "./encoding-bypass";
import { TOOL_MANIPULATION_PROBES } from "./tool-manipulation";
import { DATA_EXFILTRATION_PROBES } from "./data-exfiltration";
import { CONSTRUCTION_SPECIFIC_PROBES } from "./construction-specific";
import type { Probe, ProbeCategory } from "../types";

/** All probes in the library */
export const ALL_PROBES: Probe[] = [
  ...PROMPT_INJECTION_PROBES,
  ...ENCODING_BYPASS_PROBES,
  ...TOOL_MANIPULATION_PROBES,
  ...DATA_EXFILTRATION_PROBES,
  ...CONSTRUCTION_SPECIFIC_PROBES,
];

/** Probes by category */
export const PROBES_BY_CATEGORY: Record<ProbeCategory, Probe[]> = {
  prompt_injection: [
    ...PROMPT_INJECTION_PROBES,
    ...CONSTRUCTION_SPECIFIC_PROBES.filter(
      (p) => p.category === "prompt_injection"
    ),
  ],
  encoding_bypass: ENCODING_BYPASS_PROBES,
  tool_manipulation: [
    ...TOOL_MANIPULATION_PROBES,
    ...CONSTRUCTION_SPECIFIC_PROBES.filter(
      (p) => p.category === "tool_manipulation"
    ),
  ],
  data_exfiltration: DATA_EXFILTRATION_PROBES,
  role_hijack: [], // future expansion
  instruction_override: [], // future expansion
  context_window_abuse: [], // future expansion
};

/** Get probes filtered by category */
export function getProbes(categories?: ProbeCategory[]): Probe[] {
  if (!categories || categories.length === 0) return ALL_PROBES;
  return ALL_PROBES.filter((p) => categories.includes(p.category));
}

/** Get probe by ID */
export function getProbe(id: string): Probe | undefined {
  return ALL_PROBES.find((p) => p.id === id);
}

/** Get probe count by category */
export function getProbeCounts(): Record<string, number> {
  const counts: Record<string, number> = { total: ALL_PROBES.length };
  for (const probe of ALL_PROBES) {
    counts[probe.category] = (counts[probe.category] ?? 0) + 1;
  }
  return counts;
}

// Re-export individual sets
export { PROMPT_INJECTION_PROBES } from "./prompt-injection";
export { ENCODING_BYPASS_PROBES } from "./encoding-bypass";
export { TOOL_MANIPULATION_PROBES } from "./tool-manipulation";
export { DATA_EXFILTRATION_PROBES } from "./data-exfiltration";
export { CONSTRUCTION_SPECIFIC_PROBES } from "./construction-specific";
