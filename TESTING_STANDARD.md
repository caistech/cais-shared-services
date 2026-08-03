# TESTING STANDARD — how to verify, and what a tester run is for (canonical)

> **What this is.** The portfolio's ruleset for **verification**: what to check before you claim
> something is done, what to do before spending a `/naive-tester` run, and how to report what you
> checked. It is written from a single day in the Kira repo (2026-08-03) in which a tester found
> **eight defects, four of which had been shipped that morning by a session that verified every one
> of its own changes and reported truthfully that it had.**
>
> That is the failure this doc exists to stop. Not laziness, not missing rules — a session doing
> real verification of the wrong scope, then reporting a conclusion broader than the check.
>
> **Severity: auth-pattern.** A "done" claim that skips §3 is a defect in the same class as a bug.
> **Home:** `cais-shared-services`, so every repo and every teammate gets it.
> **Last updated:** 2026-08-03.

---

## 0. The one-paragraph version

A tester run is **expensive and finite**. Spend it on judgement — friction, tone, trust, "would I
buy this" — not on things a script finds for free. Before the run: prove production is serving the
code you think it is, and walk the user's whole path yourself. During your own work: verify the
**journey**, not the **edit**; prove **function**, not **presence**; fix the **class**, not the
**instance**. When reporting: state the assertion you actually made, and list what you did not check.

---

## 1. Before you spend a tester run

A run that reports defects a five-minute script would have caught has been half wasted, and the
findings that matter get buried under them.

- [ ] **Gate zero — is production serving the code you think it is?**
      `npx portfolio-gate-deploy-status --public-url <prod> --app-marker "<Product>"`.
      A stale production is *healthy*: it returns 200 all day. Only comparing the deployed commit
      SHA to your ref exposes it. Testing a build that is not the one you changed produces findings
      nobody can act on and "repeats" that were never fixed because they were never deployed.
- [ ] **Walk the whole user path yourself, once, end to end.** Landing → the primary action → the
      result → the paywall/gate → the first authenticated screen. At **375px and 1440px**. Submit
      one real input at every step, including any text box.
- [ ] **Open every page behind a primary CTA and count the seconds to first content.** Blank-then-
      appear is indistinguishable from broken, and a tester will (correctly) report it as broken.
- [ ] **Grep for the class of anything you changed.** Changed a price? Grep every price string.
      Changed a tax label? Grep every tax label. Changed a policy? Grep every statement of it.
- [ ] **Re-read the diff's surrounding screen, not just the diff.** The defects cluster at the joins
      between what you changed and what you did not.

---

## 2. The five verification failures, with evidence

Each is a real 2026-08-03 finding. They generalise.

### 2.1 Verifying the EDIT instead of the JOURNEY

Every check run that day was *"did my change take effect"* — DOM assertions on specific elements,
screenshots of specific components. Not one was *"walk the path a buyer walks."* Six of the eight
findings lived at the joins: a header added without checking the layout already rendered one; a
price string corrected on the checkout page while the page *before* it still doubled the tax label.

> **Rule.** The unit of verification is the user's path, not your diff.

### 2.2 Proving PRESENCE and reporting FUNCTION

A voice widget was added and reported as *"launcher × 2, panel × 1 — the voice agent is live."* Both
numbers were true. The widget's text fallback then **swallowed every question typed into it** —
input cleared, zero network requests, no answer, no error — because the package hands the text to an
optional `onTextFallbackSubmit` callback and clears the box regardless, and no handler had been
supplied.

`PRODUCT_STANDARDS` §6 already says the voice gate is *"behavioural, not presence-only."* The rule
was known, quoted that same day, and applied as presence-only anyway.

> **Rule.** Rendering is not working. If a control accepts input, submit input and assert the
> **response**. If it makes a network call, assert the call happened.

### 2.3 Fixing the INSTANCE, not the CLASS

Three times in one day, a defect was fixed at exactly the string a report named, and recurred
elsewhere within hours:

| Fixed where reported | Recurred |
|---|---|
| tax suffix on the checkout page | `+ GST + GST` on the page before it |
| pricing basis in the FAQ | the pricing block four inches above it |
| unrounded figure in the JSON export | unrounded gap on the result screen |

> **Rule.** After fixing, grep for siblings. A report names one instance because a tester saw one
> screen; you can see all of them.

### 2.4 Treating "unverifiable from source" as a VERDICT

One finding — *"the page paints late"* — was correctly categorised as needing a browser, recorded as
unverified, and left there for a day while the same session used a browser repeatedly for other
things. It came back in the next run as three pages blank for 8–15 seconds, the single most
expensive finding in the report.

> **Rule.** "Needs a browser" is a queue, not a conclusion. If you have the tool, it is not
> unverifiable — it is unverified, and that is a different word.

### 2.5 Trusting a measurement from a page that never loaded

Headless browsers reset. Twice in one day a screenshot came back blank and an extraction returned
`about:blank` data that would have been reported as fact.

> **Rule.** Assert `location.hostname` **in the same call** as any extraction or screenshot. Never
> report a measurement without proving which page produced it.

---

## 3. Claims discipline — the part a non-technical reader can police

Report **the assertion, in the words of the check.** Never the conclusion it suggests.

| Say this | Not this |
|---|---|
| "`.convai-launch` renders on `/`" | "voice works" |
| "37 unit tests pass" | "it works" |
| "the string is in the SSR'd HTML" | "the page shows it" |
| "deployed SHA matches `main`" | "it's live" |

**Every "done" message must carry an explicit `Not verified:` list.** If it has no such list, it is
incomplete — and that is checkable by someone who cannot read the code, which is the point.

---

## 4. Know what your persona structurally CANNOT reach

A persona has a contract, and the contract bounds coverage. Kira's ICP persona *"will not create a
second account to try it"* and *"gives up quietly rather than complaining"* — so **every run ends at
the paywall.** After two full rounds, the funnel had been tested twice and the authenticated product
— the thing being charged for — **zero times.** Roughly 8 of 42 routes.

- [ ] Before the run, write down **which surfaces this persona cannot reach** and say so in the report.
- [ ] Pair a conversion persona with an **authenticated** one. Never substitute.
- [ ] Authenticated runs use the canonical QA identities (`PRODUCT_STANDARDS` §9.5) —
      `QA_TEST_USER_EMAIL` and `QA_TEST_ADMIN_EMAIL`, Mode A typing the real login form.
      **No route or flag may skip authentication.**
- [ ] Dual-portal products (§8.5) get **both portals in one report**, with cross-access checked.
- [ ] The destructive admin checks (sign-out-everywhere, delete-account) are **operator-run, never
      agent-run**, and must be recorded rather than left unknown.

---

## 5. After the run

- [ ] **Record the verdicts machine-readably**, bound to the live deployment:
      `gate-check.mjs record-readiness <slug> --source naive-tester --file <json>`.
- [ ] **A finding leaves the register when it is done AND OBSERVED**, not when it is built. Keep
      "shipped" and "working" as separate columns.
- [ ] **Fix the class** (§2.3), then re-grep.
- [ ] **A finding that recurs after being found once is a process failure, not a code failure.**
      Write the mechanised check instead of the fix, or it returns a third time.

---

## 6. Mechanise what recurs

Directives decay; checks do not. The portfolio's own precedent: `check-app-chrome.mjs` exists
because the same defect shipped twice in six days *with the rule known and followed everywhere else*
— *"a rule enforced by remembering holds until someone adds a route at 1am."*

Worth building once per repo, wired into `portfolio-gate` beside the existing static checks:

| Check | Catches |
|---|---|
| `<header>` / `<footer>` count === 1 per public page | duplicated chrome from a layout you did not read |
| First paint of every primary-CTA target contains body text < 2s | blank-then-appear |
| Submit to every text input → assert a response or a network call | swallowed input |
| Every rendered price matches the tax-suffix pattern exactly once | doubled or missing tax labels |
| One statement of any policy/basis across the codebase | copy contradicting copy |
| Displayed derived figures tie against displayed inputs | arithmetic that does not add up on screen |
| Distinct font families across public pages ≤ 2 | the product looking like four products |

**None of these needs a tester.** That is the point: the run is then spent on the things only a human
notices — jargon, tone, whether a suspicious 66-year-old believes you.

---

## 7. A note on tone in the report itself

The calibration bar is *one experienced operator giving the founder candid feedback over a glass of
wine* — not a click log. Praise-padding is a defect: it hides the findings. So is a report with no
`Opportunity:` lines, because a list of complaints without a route forward gets read once and filed.

**One line, if you remember nothing else:** *verify the journey, prove function, fix the class, and
say exactly what you checked.*
