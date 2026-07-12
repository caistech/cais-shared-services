import { z } from "zod";
import type { ReportCapability, ReportSpec } from "./types.js";

/**
 * Build the ReportSpec Zod schema for a product's report-type set. The *shape* is
 * generic (reportType / title / topic / sections / format); the enum values are
 * the product's catalogue keys. Tier is deliberately NOT part of the spec — the
 * run route derives allowed tiers server-side so a client can never widen scope.
 */
export function makeReportSpecSchema<T extends string>(reportTypes: readonly [T, ...T[]]) {
  return z.object({
    reportType: z.enum(reportTypes),
    title: z.string().min(2).max(200).nullable().default(null),
    topic: z.string().max(300).nullable().default(null),
    sections: z.array(z.string().min(2).max(140)).min(1).max(12),
    format: z.enum(["pdf", "markdown"]).default("pdf"),
  });
}

/** Find a capability by key, falling back to the first (so a title always resolves). */
export function capabilityFor(
  capabilities: ReportCapability[],
  key: string
): ReportCapability {
  return capabilities.find((c) => c.key === key) ?? capabilities[0];
}

/**
 * A title strategy: `<brandPrefix> <label>` (+ `: <topic>` when present), unless
 * the spec carries an explicit title. Returns a `titleFor` for {@link ReportConfig}.
 *
 * @example makeDefaultTitleFor(caps, "Acme —")
 */
export function makeDefaultTitleFor(
  capabilities: ReportCapability[],
  brandPrefix: string
): (spec: ReportSpec) => string {
  return (spec) => {
    if (spec.title) return spec.title;
    const cap = capabilityFor(capabilities, spec.reportType);
    const base = `${brandPrefix} ${cap.label}`.trim();
    return spec.topic ? `${base}: ${spec.topic}` : base;
  };
}

/** Compact capability manifest an LLM (e.g. a discovery agent) reads to compose a spec. */
export function capabilityManifestForLLM(
  capabilities: ReportCapability[],
  closingNote?: string
): string {
  const lines = ["REPORT TYPES (compose within these; default sections shown, editable):"];
  for (const c of capabilities) {
    lines.push(`- ${c.key}: ${c.label} — sections: ${c.defaultSections.join(" / ")} — draws on ${c.draws}.`);
  }
  if (closingNote) lines.push(closingNote);
  return lines.join("\n");
}
