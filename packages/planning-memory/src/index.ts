/**
 * @caistech/planning-memory — the experiential (MNEMO) leg of the planning-retrieval hybrid.
 *
 * DATA_STANDARD three-store composition: STRUCTURED (property-services derive) + OWNED RAG
 * (planning_chunks) + THIS. Mnemo holds DISTILLED, jurisdiction-general planning CONCLUSIONS
 * accumulated from resolved/approved findings, so per-state retrieval depth compounds with use —
 * it fills the thin spots a cold RAG lookup leaves.
 *
 * Hard guardrails (from DATA_STANDARD — not optional; enforced by how you CALL this):
 *  - D1/D2: this is NEVER the citation layer. A product's finding still cites the RAG Code
 *    passage; a recalled conclusion is SUPPORTING context ("prior resolved analysis — re-verify").
 *  - I4/S4: store only DISTILLED, jurisdiction-general interpretation — NEVER a site address,
 *    owner, project/client name, coordinates, or tenant-private commercial judgment. The CALLER
 *    must distil to a generic rule (e.g. via an LLM that strips identifiers) BEFORE calling
 *    rememberPlanningConclusion. This module refuses only obviously-empty input; it cannot see PII.
 *  - S2: scope is SHARED + jurisdiction-keyed (`caistech-planning-<state>`). Generic Code
 *    interpretation is public law, so every product's approved conclusion makes the next deal in
 *    that state smarter. NOT tenant-scoped (defeats compounding; holds no PII anyway).
 *  - S3: carry the instrument version in the stored string (use `formatPlanningMemory`) so a
 *    superseded reading is visible.
 *  - Fail-soft: no MNEMO_API_KEY => recall returns [] and remember no-ops; the consumer's planning
 *    flow behaves exactly as it does with STRUCTURED + RAG only.
 *
 * Env: MNEMO_API_KEY (required to activate), MNEMO_API_URL (optional, defaults api.mnemohq.com).
 * Read at CALL time — robust to serverless cold-start env injection and module init ordering.
 */

function apiUrl(): string {
  return process.env.MNEMO_API_URL ?? "https://api.mnemohq.com";
}
function apiKey(): string | undefined {
  return process.env.MNEMO_API_KEY?.trim() || undefined;
}

/** True when Mnemo is configured (a key is present). Checked at call time. */
export function planningMemoryEnabled(): boolean {
  return Boolean(apiKey());
}

/** The shared, jurisdiction-keyed Mnemo scope for a state. Returns null for an unknown/blank
 *  state (no scope => no I/O; we never read/write a catch-all bucket). Exported for tests. */
export function planningMemoryScope(state?: string | null): { type: "org"; id: string } | null {
  const st = (state ?? "").trim().toLowerCase();
  if (!st) return null;
  return { type: "org", id: `caistech-planning-${st}` };
}

/** Fields for a well-formed, self-describing memory string. */
export interface PlanningMemoryFormat {
  /** Dimension / finding label, e.g. "Constraints & Risks". */
  label: string;
  /** Zone name, e.g. "Hills Neighbourhood". */
  zone: string;
  /** State/territory, e.g. "SA". */
  state: string;
  /** Instrument version the conclusion was derived under, e.g. "2026-07-02" (S3 freshness). */
  version?: string | null;
  /** The DISTILLED, jurisdiction-general conclusion body (already PII-stripped by the caller). */
  body: string;
}

/**
 * Build the canonical stored string: a stable header (so recall context reads clearly and carries
 * the version) + the distilled body. Both consumers should format via this so memories are uniform.
 */
export function formatPlanningMemory(f: PlanningMemoryFormat): string {
  const version = f.version ? ` (as at ${f.version})` : "";
  return `[${f.label} · ${f.zone} zone · ${f.state}${version}] ${f.body.trim()}`;
}

/**
 * Recall distilled prior conclusions for a jurisdiction. Semantic search over the shared state
 * scope — returns the memory strings (already jurisdiction-general). Fail-soft: returns [].
 */
export async function recallPlanningConclusions(
  state: string | null | undefined,
  query: string,
  limit = 4,
): Promise<string[]> {
  const key = apiKey();
  const scope = planningMemoryScope(state);
  if (!key || !scope || !query?.trim()) return [];
  try {
    const res = await fetch(`${apiUrl()}/v1/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, scope, limit }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<{ content?: string }> };
    return (data.results ?? []).map((r) => r.content?.trim() ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Store ONE distilled, jurisdiction-general conclusion in the shared state scope. The caller MUST
 * pass content that is already generic (no site/owner/tenant detail) — enforce that upstream (an
 * LLM distil step). Fail-soft: returns false and no-ops on any error / missing key / missing scope.
 */
export async function rememberPlanningConclusion(
  state: string | null | undefined,
  content: string,
): Promise<boolean> {
  const key = apiKey();
  const scope = planningMemoryScope(state);
  const body = content?.trim();
  if (!key || !scope || !body) return false;
  try {
    const res = await fetch(`${apiUrl()}/v1/memories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope, items: [{ content: body }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
