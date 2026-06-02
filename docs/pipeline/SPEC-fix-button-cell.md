# Spec — the Fix-button cell (the real self-correcting validation cell)

Replaces today's fake "Fix Now" (which greened a check without touching the product). Every
validation/compliance check becomes a cell that can EXPLAIN its failure in plain language, OFFER a
real fix routed by class, EXECUTE it against the live product, and only go green by a REAL re-check.
Grounded in the plumbing that already exists (design-build kickoff/result + pipeline_gates ledger).

This is the `{ runner → verdict → fixer → advance }` cell from the Track B brief, made concrete.

---

## 0. What already exists (reuse, don't rebuild)
- **Class-B fixer path is built**: `design-build/kickoff` (dispatches design-build.yml with
  `{slug, verdict, url}`) → agent branches, builds, opens PR → `design-build/result` records to
  `pipeline_gates` (gate='design-build', PR url in artifact_ref, forks in result). The Fix-button's
  Class-B route is a THIN wrapper over kickoff with a single-finding brief instead of a full verdict.
- **Ledger**: `pipeline_gates` with `recordGate(...)`, `is_override`, `result` JSONB. Reuse for fix
  audit rows.
- **The card** reads newest gate rows (survey_gate, design_build) and renders them. The cell extends
  this read/render pattern per check.
- **Cache rule**: any new route the card reads from needs `dynamic='force-dynamic'` +
  `fetchCache='force-no-store'` (the bug we fixed today) or the cell will show stale state.

---

## 1. The data contract (the missing piece — do this FIRST)
Today a check emits a prose finding ("Missing OG image meta tag"). That's not actionable. Each check
must emit a machine-readable descriptor so the cell can route and explain:

```ts
type FixClass = 'A' | 'B' | 'C';   // A=config codemod, B=generative (design-build), C=human judgment

interface CheckResult {
  checkId: string;                 // 'metadata' | 'security-headers' | 'gtm-distribution-loop' | ...
  status: 'pass' | 'warn' | 'fail';
  // PLAIN-LANGUAGE layer (the content contract — required, no jargon):
  plain: {
    whatWeChecked: string;         // "how your site protects visitors from common web attacks"
    whatWeFound: string;           // "it's missing two standard safety settings…"
    implication: string;           // "…some partners/investors check for these; no visible change"
  };
  // The fix (absent when status==='pass'):
  fix?: {
    fixClass: FixClass;
    proposed: string;              // plain: "add the standard security settings to your config"
    options: FixOption[];          // the choices rendered as buttons (see §3)
    // TECHNICAL layer (behind an expander — never the primary text):
    technical?: { summary: string; diffPreview?: string; files?: string[] };
  };
  recurrence?: number;             // how many products have hit this check (feeds the promote suggestion)
}

interface FixOption {
  id: string;                      // 'apply' | 'skip' | 'rebuild-feature' | 'override' | ...
  label: string;                   // plain: "Apply the fix"
  consequence: string;             // plain: "passes the check; standard and safe; no downside"
  recommended?: boolean;
  route: 'codemod' | 'design-build' | 'human-ack';  // how the button acts (see §4)
  payload?: unknown;               // codemod id, or the single-finding brief for design-build
}
```

The check runners (in `pipeline-cockpit/.../run-test/route.ts` + `validation/route.ts`) are rewritten
to RETURN this shape instead of a prose string. The plain-language strings live WITH the check (the
detector author writes them), because only the detector knows what it actually looked at.

> Rule from the brief: if a check can't fill `plain` + `options[].consequence` in plain language,
> it isn't ready to surface. That's the quality bar.

---

## 2. Cell states (what the card renders)
Each check renders as a cell in one of these states. Exactly one live affordance per state
(one-page UX law):

| State        | Trigger                                  | Renders                                                        |
|--------------|------------------------------------------|----------------------------------------------------------------|
| `idle`       | not yet run                              | "Run Test" button                                              |
| `passed`     | status==='pass'                          | green check, no fix affordance                                 |
| `failed`     | status==='fail'/'warn' + fix present     | plain finding + "Fix" affordance with the options (§3)         |
| `no-fixer`   | status==='fail' + NO fix descriptor yet  | plain finding + "No automatic fix yet" + (later) manual path   |
| `fixing`     | a fix is running                         | progress ("Patching config…" / "Building share feature…")      |
| `rechecking` | fix done, re-test running                | progress ("Re-checking against the live site…")                |
| `fixed`      | re-check passed                          | green check + "fixed by [codemod/design-build] · [link]"       |
| `fix-failed` | re-check still fails after fix           | plain "the fix didn't resolve it" + escalate-to-human fork     |

**No state greens the check without a real re-check.** `fixed` is only reachable via `rechecking`
passing. This is the structural kill of the fake-green.

---

## 3. Plain-language rendering (the content contract on the card)
A `failed` cell renders, in this order:

```
[icon] Security Headers
"We checked how your site protects visitors from common web attacks. It's missing two standard
 safety settings that tell browsers how to handle your pages securely — most professional sites
 have these, and some partners check for them."

Proposed fix: add the standard security settings to your site's configuration (no visible change).

What this means: your site passes the security check and looks more credible to reviewers. No downside.

Your choices:
  [ Apply the fix ]   ← recommended · "passes the check; standard and safe"
  [ Skip for now ]    ← "check stays red; revisit anytime"

  ▸ see the technical detail        (expander: header names, the diff, the files touched)
```

`whatWeChecked` / `whatWeFound` / `implication` map to the three sentences. `options[]` become the
buttons, each with its `consequence` as helptext. `technical` sits behind the expander — never primary.

---

## 4. Button routing (how a choice acts)
The clicked `FixOption.route` decides what happens — the card never sends the user off-page:

**`route: 'codemod'` (Class A — deterministic config):**
1. POST `…/[slug]/fix/codemod` `{ checkId, codemodId, payload }`.
2. Server applies the known patch to the product repo (e.g. add `headers()` block / OG metadata),
   commits to a branch, opens a PR, **merges via GitHub API**, triggers redeploy.
3. Polls deploy → on Ready, **re-runs the check's runner against the live deploy** (the real re-check).
4. Records a `pipeline_gates` row (gate=`fix`, result={checkId, codemodId, pr_url, rechecked:true}).
5. Cell → `fixed` (green) only if the re-check passed; else `fix-failed`.
   - Codemod library is a SHARED chunk (every product hits the same config failures). Start with the
     two we know: `og-metadata`, `security-headers`. (These two should rarely fire now — they're in
     the template — but the codemod exists for existing products built before the promotion.)

**`route: 'design-build'` (Class B — generative feature):**
1. POST the EXISTING `…/[slug]/design-build/kickoff` but with a **single-finding brief** instead of a
   full survey verdict: `{ verdict: 'FIX', url, brief: plain.whatWeFound + fix.proposed }`.
   (Small addition to kickoff: accept an optional `brief` input and pass it to the workflow so the
   design phase scopes to ONE finding, e.g. "add a distribution loop", not a full rebuild.)
2. Agent builds the feature on a branch, opens a PR → `design-build/result` records it (already built).
3. **Auto-merge on green build** (CI typecheck passes) via GitHub API, redeploy, re-run the check.
4. Cell → `fixed` only if the re-check passed.
   - This reuses the entire agent-in-CI path. The only new code is the `brief` passthrough +
     auto-merge-on-green + re-check trigger.

**`route: 'human-ack'` (Class C — judgment / can't auto-fix):**
- Renders the fork as a decision (e.g. the P3 calibration, or "skip for now"). On choose, records the
  human's decision to the ledger (like the gate-override): `pipeline_gates` row with the reason. No
  code change to the product. This is the ONLY route that can mark a check resolved without a product
  change — and it's explicitly a logged human judgment, not a fake green.

---

## 5. The promote-upstream tail (closes the self-healing loop — §brief capstone)
After a `codemod` or `design-build` fix succeeds AND `recurrence > 1` (this check has failed on other
products), the cell surfaces the **classify-on-card** affordance from the brief:

```
"We've fixed this on N products now. Make it part of every future build?"
  [ Structural — add to template/standards ]   ← suggested (recurrence=N)
  [ Just this build ]
```
- **Structural** → opens a PR to the template (Class A: the codemod) or design-build standards
  (Class B: the requirement, not the implementation), shows the diff inline, **merges via API on
  confirm**. (For og-metadata + security-headers this is already done manually today; the mechanism
  generalises it.)
- **Just this build** → closes the PR; fix stays in the product.
- Never sends the user to GitHub. The PR is plumbing; the decision is on the card.

---

## 6. Build order (smallest first)
1. **Data contract (§1)** — rewrite the check runners to return `CheckResult` with `plain` + `fix`.
   Nothing renders differently yet, but the cell now has what it needs. (Highest leverage; unblocks all.)
2. **Cell render (§2,§3)** — replace the fake "Fix Now" with the stateful cell + plain-language layer.
   Wire the existing `idle`/`passed`/`failed` from real data.
3. **Class-A codemod route (§4)** — `fix/codemod` + the `og-metadata` and `security-headers` codemods
   + real re-check. First real fixer end-to-end.
4. **Class-B wrapper (§4)** — add `brief` passthrough to kickoff + auto-merge-on-green + re-check.
   Reuses the built agent path. Handles the distribution-loop class.
5. **Class-C human-ack (§4)** + the **gate-override button** (already spec'd) — judgment forks.
6. **Promote-upstream tail (§5)** — classify-on-card + template/standards PR via API. Closes self-healing.

Each step is shippable on its own; the cell gets progressively more autonomous. After step 3 you have
a real (non-fake) fixer for the config class; after step 4 the generative class; after step 6 the
system heals its own build inputs.

---

## 7. Invariants (the rules this cell must never break)
- A check goes green ONLY via a real re-check against the live deploy. No status-only greens.
- Every fork is plain-language-first; technical detail is an optional expander.
- Exactly one live affordance per cell state.
- The user never opens GitHub/terminal/DB/CI — the card acts on their behalf via API.
- Every autonomous action (fix, merge, promote) writes a logged, reviewable ledger row / PR.
- A stubbed fix (button that greens without changing the product) is a fake submission — forbidden,
  same as the design-build no-fake rule.
