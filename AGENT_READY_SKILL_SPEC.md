# `/agent-ready` — skill spec (for a build session to implement)

> **What this is.** The build spec for a Claude Code skill that **audits a target for agent-readiness
> and then applies the fixes** — the remediation analog of the read-only auditors (`/gtm-auditor`,
> `/voice-auditor`, `/naive-tester`). It enforces gate-check **#42** + `PRODUCT_STANDARDS.md` **§11**
> (the three agent-readiness layers) and is the engine behind both halves of the
> `storefront-mcp → @caistech/webmcp-kit` plan (`storefront-mcp/SHARED_SERVICES_READINESS_SCOPE.md`
> §1A): the **§11 rollout tool** for our own 38 repos *and* the remediation engine of a sellable
> **Agent-Readiness Audit + Remediation** product.
>
> **Status:** SPEC ONLY — not yet built. Written 2026-06-09.
> **Hard dependency:** `@caistech/webmcp-kit` (also unbuilt — see the scope doc). This skill *consumes*
> the kit's generators; it must not hand-roll them, **except** the explicit bootstrap path in §7.
> **Pattern parents:** `gtm-auditor`/`voice-auditor` (two-phase audit), `/qa`+`/design-review`
> (iterative fix → atomic commit → re-verify), `/ship` (the PR hand-off).

---

## 1. Identity (SKILL.md frontmatter)

```yaml
---
name: agent-ready
version: 0.1.0
description: |
  Audit a website or repo for AGENT-READINESS (can AI search + browser agents find, read,
  and drive it?) and then APPLY the fixes. Enforces gate-check #42 / PRODUCT_STANDARDS §11's
  three layers — Discoverable (llms.txt + schema.org/JSON-LD + /.well-known manifest),
  Operable (WebMCP tool defs on the money actions), Integratable (remote MCP). The remediation
  analog of /gtm-auditor: where that scores agent-distribution as D3 evidence, this one fixes it.
  Two modes: (A) internal rollout — full audit → auto-remediate → PR on one of our repos;
  (B) product — audit any URL (the free wedge), remediate only where code access exists, else
  emit an installable drop-in bundle. Lane-aware: a white-label site gets the DISTRIBUTOR's
  agent surface, never CAS branding. Writes a #42 verdict back to the cockpit readiness_results.
  Use when asked to "make this agent-ready", "agent readiness audit", "webmcp audit/wire",
  "fix agent readiness", or to roll #42 across the portfolio.
allowed-tools: [Skill, Bash, Read, Glob, Grep, Edit, Write, Agent, AskUserQuestion, WebFetch]
triggers:
  - agent-ready
  - agent readiness
  - make this agent-ready
  - webmcp audit
  - audit agent readiness
  - wire webmcp
---
```

---

## 2. The three layers it audits + remediates (the source of truth)

Maps 1:1 to `PRODUCT_STANDARDS.md` §11 and gate-check #42. Keep them distinct — they have different
maturity and different remediation:

| Layer | What | Remediation | Maturity |
|---|---|---|---|
| **1 — Discoverable** | `/llms.txt` + schema.org/JSON-LD on the landing + `/.well-known/` agent manifest | `webmcp-kit` Layer-1 generators → files/routes | **Deployable today.** The default. |
| **2 — Operable** | the 3–4 money actions (book / quote / start-trial) exposed as **WebMCP** tools an agent can complete | `webmcp-kit` `registerWebMcpTools` → scaffold defs + stub handlers | **Frontier** (Chrome origin trial) — scaffold + flag, don't fake handlers |
| **3 — Integratable** | optional remote MCP server (product-as-a-tool-in-other-agents) | `webmcp-kit` `createMcpServer` factory | Only on `--layers 3` / when asked |

Default run = **Layer 1 only** (the leverage + the only thing that fully ships today). Layers 2–3 are opt-in.

---

## 3. Modes

- **Mode A — Internal rollout** (`target` = a local repo path, one of our 38): full audit → auto-remediate
  → atomic commits → **PR**. This is the §11 portfolio sweep + the product's first proof artifact.
- **Mode B — Product / external** (`target` = a URL): **audit-only by default** (the free wedge that runs
  on any public site). Remediate **only** when code access is supplied (`--repo <path>` or a granted
  clone); otherwise emit an **installable drop-in bundle** (§6) + instructions. No PR without code access.

Auto-detect mode from the target (path on disk → A; `http(s)://` → B). `--audit-only` forces audit.

---

## 4. Phase 0 — Scope & brand gate (RUN FIRST, borrow `/gtm-auditor` Step 0)

1. **Classify the brand-mode** (lane-aware, the load-bearing gate): `cas-attribution` (lane-4 / CAS funnel)
   · `distributor-attribution` (lane-1 white-label → the **distributor's** llms.txt / manifest / persona,
   **never CAS**) · `client-owned/out-of-scope` (paying-client build → audit only, no public artifact, R3
   sanitise) · `lane-unconfirmed` (default conservative, surface it). Derive from `portfolio-manifest.yaml`
   lane comment → `BUSINESS_MODEL.md` §2 → memory. **If ambiguous, do NOT stamp CAS branding.**
2. **Detect the stack** (sets insertion points): Next.js App Router / Pages / Vite / Astro / static /
   Vercel-Functions (storefront-mcp is Functions, *not* Next — don't assume Next). Find: the landing
   route, the `public/` (or equivalent static) dir, the `<head>`/metadata sink, the framework's config.
3. **Identify the money actions** (Layer-2 candidates): the 3–4 CTAs/forms/routes that make money
   (signup, get-quote, book, start-trial, the core verb). These become WebMCP tool candidates.

---

## 5. Phase 1 — Audit (always)

Static repo scan (Mode A) or headless read of the rendered URL (Mode B), optional live `/browse` pass.
Score each layer **present / partial / absent**:

- **Layer 1:** `curl -s <url>/llms.txt` returns content? landing HTML has `<script type="application/ld+json">`
  with valid schema.org? `/.well-known/` agent manifest resolves? (repo equivalents: `public/llms.txt`,
  JSON-LD in the metadata/head, `.well-known/` file).
- **Layer 2:** any WebMCP / `window.mcp` / tool registration present? map the money actions found in Phase 0
  to "exposed vs not".
- **Layer 3:** any remote MCP server route / `@modelcontextprotocol/sdk` usage?

**Output — the audit report** (`./agent-ready/{YYYY-MM-DD-HHMM}/{slug}.md`): per-layer score, the money
actions found, the specific gaps, and the planned remediation per gap. **Also emit the #42 cockpit feed
line** (see §8) so the rubric loop closes. Mode B audit-only stops here (the free-wedge deliverable).

---

## 6. Phase 2 — Remediate (Mode A, or Mode B with code access)

Iterative fix → atomic commit → re-verify (the `/qa` + `/design-review` discipline). Steps:

1. **Install the kit:** `npm i @caistech/webmcp-kit` (GitHub Packages; `@caistech:registry`,
   `NODE_AUTH_TOKEN`). Bootstrap exception in §7 if the kit isn't published yet.
2. **Generate `agent-readiness.config.ts`** (hybrid: derive product name / key URLs / money actions /
   **brand-owner** from Phase 0, then operator confirms via `AskUserQuestion` when interactive). The
   brand-owner field is what makes a white-label site emit the distributor's surface.
3. **Layer 1 (default):** wire the kit's generators into the detected stack — a route/build step for
   `/llms.txt`, inject the JSON-LD `<script>` into the landing `<head>`/metadata, write the
   `/.well-known/` manifest. **Idempotent** — re-running edits in place, never duplicates.
4. **Layer 2 (`--layers …,2`):** scaffold WebMCP tool defs for the money actions via the kit, with
   **stubbed handlers + explicit `// TODO(agent-ready): wire business logic` + a flag in the report.**
   **Never fabricate handler logic** (the degrade-don't-fake rule).
5. **Layer 3 (`--layers …,3`):** stand up the `createMcpServer` factory only when asked.
6. **Atomic commit per layer** (descriptive technical messages, not chat). Stay **scoped to
   agent-readiness surfaces** — do not touch unrelated code (treat like an implicit `/freeze` on the
   files you create/edit).
7. **Re-verify:** build/typecheck clean; `curl`/headless the generated outputs actually resolve + JSON-LD
   validates.
8. **PR** via `/ship` (or inline `gh pr create`). **Never push straight to main / force-push.** The diff
   lands through human review.

**Mode B without code access — the installable bundle instead of a PR:** emit the literal `llms.txt`
content, the JSON-LD `<script>` block, the `.well-known` manifest file, and a paste-in `INSTALL.md`
(or, for no-code Wix/Squarespace sites, an injectable `<script>` snippet). No repo edits, no PR.

---

## 7. Build order + the bootstrap exception

1. **Kit-first is ideal** but blocking. If `@caistech/webmcp-kit` isn't published yet, ship a **v0.1
   bootstrap**: the Layer-1 generators (llms.txt / JSON-LD / manifest) live *inline in the skill* so it's
   useful on day one — **clearly marked `// BOOTSTRAP: migrate to @caistech/webmcp-kit when published`.**
   When the kit ships, refactor the skill to consume it and delete the inline copies (the fork-check will
   flag them — that's the reminder).
2. Layer 2/3 **require** the kit (WebMCP client helper + MCP server factory) — gate them behind a
   "kit present?" check; if absent, the skill audits Layer 2/3 but reports "remediation needs
   `@caistech/webmcp-kit`" rather than half-building.
3. First real run = **dogfood across our own repos** (Mode A) → portfolio-wide #42 compliance + the
   product proof. Idempotency must hold across the sweep.

---

## 8. Cockpit loop — write the #42 verdict back

The rubric work (2026-06-09) added check `42` to `readiness_criteria` + a `readiness_results` table
(`product_slug`, `check_code`, `status pass|fail|na`, bound to the live deployment). After an audit,
**write a `readiness_results` row for `check_code = '42'`** (`pass` when all in-scope Layer-1 artifacts
resolve; `na` when the product has no public web surface — the `public-web` applicability tag is absent;
`fail` otherwise). This makes `/agent-ready` a *producer* the cockpit scorer reads — closing the loop the
rubric change opened. (Source precedence, per the locked engine policy: a live `/agent-ready` pass
outranks a static auto-probe.)

---

## 9. Hard rules (the guardrails section of the SKILL)

- **Brand gate first, always** — never CAS branding/manifest on a white-label distributor or client site
  (Phase 0). A distributor site emits the distributor's agent surface.
- **`@caistech`-first** — consume `webmcp-kit`; the only permitted inline generators are the §7 bootstrap,
  and they carry the migration marker. Run the fork-check after the kit exists.
- **Degrade, don't fake** — WebMCP handlers are scaffolded + TODO-flagged, never fabricated.
- **Scope discipline** — touch only the agent-readiness surfaces you create/edit; never "drive-by fix"
  unrelated code. Idempotent re-runs.
- **PR-gated** — changes land via PR/human review; no force-push, no direct-to-main.
- **Verify before done** — generated outputs must actually resolve + validate; "wrote the file" ≠ "works".
- **Audit needs no permission; remediation needs code access** — don't claim you can "make the changes"
  on a URL you can only read.

---

## 10. Invocation + outputs

```
/agent-ready <repo-path | URL> [--audit-only] [--layers 1,2,3] [--pr] [--bundle]
```

- **Outputs:** the audit report (`./agent-ready/{ts}/{slug}.md`) + the #42 cockpit feed line; Mode-A → the
  applied diff + a PR; Mode-B-no-access → the installable bundle dir.
- **Relationship to siblings:** `/gtm-auditor`'s Agent-Readiness dimension *scores* (non-blocking) → it can
  recommend `/agent-ready` as the *fix* step. `/naive-tester` + `/voice-auditor` are the human/voice
  analogs; this is the agent-channel fixer. `/ship` takes the PR.

---

## 11. Acceptance criteria (Definition of Done for the build session)

- [ ] Run on a repo with **none** of the three artifacts → produces `llms.txt` + JSON-LD + `/.well-known`
      manifest that **resolve + validate** on the next deploy; gate-check **#42 flips to pass** in the cockpit.
- [ ] **Idempotent** across the 38-repo sweep (second run = no-op diff).
- [ ] **White-label test:** on a `distributor-attribution` target, every generated artifact carries the
      **distributor's** brand, zero CAS strings.
- [ ] **Audit-only on a URL** produces a report + a bundle without mutating anything.
- [ ] **Layer-2 scaffold** emits WebMCP defs with TODO-flagged handlers, never fabricated logic.
- [ ] Writes a valid `readiness_results` row for `check_code='42'`.
- [ ] PR-gated end-to-end; build/typecheck green before the PR.

---

*Cross-refs: `storefront-mcp/SHARED_SERVICES_READINESS_SCOPE.md` (§1A — the product/substrate framing +
the access split), `PRODUCT_STANDARDS.md §11`, `THIN_MVP_RUBRIC.md §6` (#42 + the locked engine policy:
live-pass > judge > auto-probe), `BUSINESS_MODEL.md §5` (D3) + §6 (two build types), `SHARED_SERVICES.md`
(register `@caistech/webmcp-kit` on build), memories `project_agent_readiness_rubric` +
`project_io2026_commoditisation_map`.*
