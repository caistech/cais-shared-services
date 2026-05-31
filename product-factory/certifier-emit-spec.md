# Certifier Emit Spec — readiness verdicts → `gate-check.mjs record-readiness`

The last-mile contract connecting the certifiers (naive-tester, qa, voice-auditor) to
the scorer. Replaces the stale "Recording readiness verdicts" section in
`naive-tester/SKILL.md` (which pointed at a local `gate-readiness/criteria.json` file
and an old `gate-check.mjs record-readiness` call against a stale catalogue).

**Catalogue is now the `readiness_criteria` table** (63 rows). **Writer is
`recordReadiness()` in `scripts/gate-check.mjs`** — append-only, deployment-binding.
**Scorer is `compute_readiness()`** — tier-aware, deployment-scoped, emits a blocker list.

**What does NOT change:** the markdown letter, the persona voice, the Standards Check
block, the calibration bar. The letter is the inspector's written report. The verdicts
file is the numbered defects schedule filed alongside it.

---

## 1. The verdicts file

One JSON array per certifier run, written next to the report:
`./naive-tester-reports/{timestamp}/{persona-slug}.verdicts.json`

```json
[
  { "code": "2",  "status": "pass", "evidence": "reflows clean at 375 + 1440, no h-scroll" },
  { "code": "7",  "status": "fail", "evidence": "tab title still 'Create Next App'" },
  { "code": "32", "status": "fail", "evidence": "/features nav link 404s on production" },
  { "code": "33", "status": "fail", "evidence": "ToS + Privacy links are href='#', dead" },
  { "code": "9",  "status": "fail", "evidence": "promise stated but unsubstantiated -- can't tell if real spatial data or a GPT wrapper" },
  { "code": "22", "status": "na",   "evidence": "reset flow not reachable pre-account" }
]
```

Field rules:
- **`code`** — MUST be a `code` in `readiness_criteria`. The naive-method codes are
  P1-P4 and 1-41; the VT_* codes belong to the validation-test harness; VMS/voice codes
  to voice-auditor. Never invent a code.
- **`status`** — `pass` | `fail` | `na` ONLY. `na` = the surface/feature isn't in this
  product (no auth -> 22-25 = `na`). **Emit `na` explicitly** — an omitted HARD code
  reads as "never inspected" and blocks the gate as `hard gate never verified`.
- **`evidence`** — one observable line: what was seen + where. Not the prose; the prose
  is the letter. Evidence is what the builder and the re-inspection read.

The same shape serves QA (`"source": "qa"` at submit time) and voice-auditor.

---

## 2. The mapping rule (prose finding -> `code`)

1. **Start from the Standards Check.** The persona already marked the catalogue checks
   in the letter. Each is a row: pass/fail/na, with the one-line evidence.

2. **Match by the check's intent**, not keywords. Common naive-observable codes:
   - dead link / 404 / no next action -> **32** (zero dead ends)
   - tab title / favicon / OG -> **7** / **8**
   - can't read on phone / tap targets -> **3**; nav won't collapse -> **4**
   - landing doesn't sell / dull shell -> **5** / **6**
   - eye-toggle / forgot-pw / magic-link -> **23** / **22** / **24**
   - placeholder / wrong-market content -> **5**, evidence names the placeholder
   - address/company not validated -> **34**
   - the "I want that" reaction itself -> **41**

3. **The judgment (THIN-sourced) findings:**
   - "promise stated but I can't tell if the product DELIVERS it" -> **9**
     (PROMISE ATTRIBUTES at quality bar), status `fail`. This is the DealFindrs
     "$99 vs $29" killer. compute_readiness routes code 9 to founder-decision and a
     re-run does NOT auto-close it -- only a recorded decision does.
   - "bounced / not converted" -> **41**, status `fail`.

4. **If a finding maps to NO code,** do not force it. Note it in the letter and raise it
   as a candidate new `readiness_criteria` row. Recurring unmapped findings are how the
   rubric grows. (The "does the product substantiate its promise" gap is the current
   open candidate -- see AS_BUILT.)

Invariant: **a `fail` verdict without a sentence in the letter is a fabrication; a
letter finding without a verdict is a leak.** Every fail is in both places or neither.

---

## 3. The emit step (the real call)

Last action of the run, after the report is saved. `recordReadiness` resolves and binds
the LIVE production deployment automatically (Delta 2) unless `--no-deployment`:

```bash
node scripts/gate-check.mjs record-readiness <slug> \
  --source naive-tester \
  --file ./naive-tester-reports/{timestamp}/{persona-slug}.verdicts.json \
  --by "{persona-name}"
```

- `--source` is one of `naive-tester | voice-auditor | auto | judge`.
- Verdicts bind to whatever production is serving NOW; the scorer marks anything bound
  to an older deployment `stale` (re-audit needed) and anything unbound `provisional`.
- After recording, read back the gate state:
  ```bash
  # what production is serving:
  node scripts/gate-check.mjs prod-deployment <slug>
  # then, in SQL or via the cockpit:
  #   select compute_readiness('<slug>', '<that deployment id>');
  ```
  The `blockers` array tells the builder exactly what's open, why, and in which lane.

**Re-inspection close:** after a fix is deployed, re-run the certifier and record again.
A check that now passes overrides the prior fail (latest-per-code wins). A pass bound to
the new deployment flips `stale`/`unbound` to `verified`. Close happens because the
certifier re-ran and verified -- never a button.

---

## 4. QA + the validation-test harness

QA emits the same array shape with `--source` set appropriately; its issues map to the
catalogue (most -> 2,3,32,7,38,39,40). The Parts A-D validation harness goes through
`scripts/submit-validation-results.mjs --record-readiness`, which maps its check names to
VT_* codes and calls `recordReadiness` with faithful pass/fail/na (warning/unknown are
skipped, never recorded as a fabricated pass).

---

## What this closes

idea -> build -> certifier walks the live URL -> writes the letter (human) AND the
verdicts (machine) -> `gate-check.mjs record-readiness` binds them to the live deployment
-> compute_readiness scores by tier, deployment-scoped, and emits the blocker list ->
blockers route by lane (opencode / founder-decision / backlog) -> fixes deploy ->
certifier re-runs -> passing checks flip to verified -> at GO (no blockers, >=80%) the
product clears. The prose finding that used to fall on the floor is now a verdict that
either flips to pass on re-inspection or stays a named, explained blocker.
