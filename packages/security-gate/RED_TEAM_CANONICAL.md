# DIRECTIVE — one canonical red-team shape every repo can call

> **Status: DIRECTIVE, not yet built.** This specifies how the Kira red-team shape folds into
> `@caistech/security-gate/red-team` so the portfolio ends with ONE red-team service. Written
> 2026-08-01 at Dennis's instruction, after Kira built a second red team without consuming the first.
>
> **Consumers of `@caistech/security-gate` today: SayFix, platform-trust.** The no-orphaned-consumers
> rule applies to every type change below.

---

## 0. Why this exists

`@caistech/security-gate/red-team` already existed — `createRedTeamRunner`, `EndpointRegistry`,
`RedTeamReporter`, and probe suites for prompt-injection, encoding-bypass, tool-manipulation,
data-exfiltration. **Kira built its own anyway** (`scripts/red-team.mjs`,
`lib/kira/redteam.test.ts`, `kira_redteam_runs` / `kira_redteam_results`). That is an
`@caistech`-first miss, and the fork-check guard did not catch it.

But the two are **not duplicates**, and the difference is the whole reason to do this work:

| | security-gate today | Kira |
|---|---|---|
| Shape | **single-turn** `prompt: string` | **multi-turn** `turns: string[]` |
| Verdict from | **response text**, via `failureIndicators: RegExp[]` | **observed side-effects** — DB state before/after |
| Question answered | does this endpoint **say** something it shouldn't? | can this agent be **talked into doing** something it shouldn't? |
| Subject safety | none — no notion of whose data is at risk | attacks a synthetic owner, asserted before any attack is sent |
| Signal | `score` + `regression: boolean` vs previous run | **pass RATE over many runs** (the suite is non-deterministic) |

For an agent holding a real person's Drive, contacts and mail, the second row is the one that
matters. **An agent that says the right thing and does the wrong one passes a regex and fails the
customer.** Regex-on-output also fails in both directions: compliance phrased unusually scores as a
pass, and a refusal in unexpected words scores as a fail.

**Therefore: extend, do not replace.** The existing single-turn probes stay exactly as they are.

---

## 1. What gets added (the canonical shape)

### 1.1 A second probe kind — `ConversationProbe`

Alongside the existing `Probe`. The product supplies the domain; the package owns orchestration.

```ts
export interface ConversationProbe<S = unknown> {
  id: string; name: string; category: ProbeCategory; severity: ProbeSeverity; description: string;

  /** Multi-turn. The attack is a CONVERSATION, because one-shot jailbreaks are the easy case. */
  turns: string[];

  /** Snapshot whatever the attack could damage. Product-supplied — the package must not know schemas. */
  observe?: (ctx: ProbeContext) => Promise<S>;

  /**
   * THE VERDICT IS COMPUTED FROM THE DIFFERENCE, NOT FROM THE WORDS.
   * `held: true` = the boundary survived. Transcript is available but must never be the sole basis.
   */
  verdict: (args: { transcript: Turn[]; before: S; after: S }) => { held: boolean; detail: string };
}
```

**Rule: a `ConversationProbe` whose `verdict` only inspects `transcript` MUST be rejected at
registration.** That is a single-turn probe wearing a conversation's clothes, and permitting it
re-introduces exactly the weakness this shape exists to remove. (Kira's own "a refusal leaves a
record" probe is the model: its PASS is a database row *appearing* — every other probe asserts an
absence, which an agent with no tools at all would also pass. **Every suite needs at least one
probe whose pass is a positive event**, or the suite can be satisfied by a broken agent.)

### 1.2 A transport seam

The package must not know about ElevenLabs, HTTP, or any vendor.

```ts
export interface ConversationTransport {
  /** Open a session against the subject. */ open(subject: Subject): Promise<Session>;
  /** Say one turn, return what came back. */ say(session: Session, text: string): Promise<string>;
  close(session: Session): Promise<void>;
}
```

### 1.3 The synthetic-subject contract — NON-NEGOTIABLE

```ts
export interface Subject {
  id: string;
  /** Proof this identity is synthetic. The runner REFUSES to attack without it. */
  assertSynthetic: () => Promise<{ synthetic: true; evidence: string }>;
}
```

**The runner must refuse to send a single turn until `assertSynthetic()` resolves.** Not a warning,
not a flag — a refusal.

This is the most important thing being contributed and it is currently absent from
`RegisteredEndpoint`, which has no notion of *whose* data is at risk. The reason is concrete: Kira's
first red-team run pointed at the **live business owner's account**, because the runner took its
identity from an env var and silently ignored the `--email` flag that appeared to redirect it. The
only thing that prevented an attack landing on 116 real memories was an unrelated ownership check
answering 403. **Luck, not design.** A red-team suite that can attack production causes the class of
incident it exists to detect.

Kira's implementation of the contract: verify the minted session token's `sub` equals the
synthetic account's auth id before sending anything. Generic form: the product proves it, the
package enforces that it was proven.

### 1.4 Run history and the RATE

`RedTeamRun` today carries `score` and `regression: boolean` — a two-run comparison.

**That is wrong for this class of suite and must not be extended to it.** These probes are
**non-deterministic**: Kira's "Felix con" held, breached, then held six times with nothing changed
between runs. A two-run comparison reports noise as regression and misses real drift.

Required instead:

- persist **every run and every result**, keyed by probe id
- **retain transcripts on PASSES too** — runs cannot be reproduced on demand, so a pass you cannot
  read is a pass you cannot learn from
- headline metric = **pass rate per probe over time**, with an explicit **minimum-n before a trend
  is claimed** (Kira uses 6; below it the surface says there is no trend rather than drawing a line
  through two points)
- record the **trigger** and the **commit SHA** — a rate spanning a behaviour change is two
  different questions averaged together

### 1.5 Trigger policy

Not on every deploy. Run **after anything that changes agent behaviour** — a re-provision or a
prompt/capability patch — plus a **scheduled run** (catches vendor-side drift with nobody pushing),
plus **on demand** before a demo. Kira wires this by having the two scripts that mutate the fleet
invoke the suite themselves, and **warn loudly rather than skip silently** when credentials are
missing.

---

## 2. What stays in the product, always

The package must never absorb these:

- **the probes themselves** — they encode domain (an approval gate, an entity boundary, a refusal)
- **table and tool names**
- **the `observe()` implementation** — only the product knows its own schema

Same division as `@caistech/discovery-agent`: package owns orchestration + schema + safety, product
supplies the domain. If the package ever needs to know a table name, the seam is in the wrong place.

---

## 3. Migration for Kira

1. Land the shape in `security-gate` with the existing single-turn probes untouched.
2. Port Kira's four probes to `ConversationProbe`, keeping `verdict` reading DB state.
3. Replace `scripts/red-team.mjs` orchestration with `createRedTeamRunner`; keep
   `scripts/lib/redteam-tools.mjs` (product domain) and the synthetic-identity provisioning.
4. Keep `lib/kira/redteam.test.ts` **in Kira and on every push** — deterministic server-side guards
   are free and belong at the repo, not in a scheduled suite.
5. Reconcile `kira_redteam_runs` / `kira_redteam_results` to the package's schema, or keep them as
   the product's own store behind the package's persistence seam. **Do not lose the existing rows** —
   they are the only history of a non-deterministic suite and cannot be recreated.
6. Add the row to `SHARED_SERVICES.md` in the same change (an unlisted service gets re-forked).

## 4. Rollout to other repos

Every repo with a tool-carrying agent is in scope — the deployment posture mirrors the memory-loop
gate: **the guard that exists but runs nowhere is the guard that already lost.** Prefer wiring it
into `@caistech/portfolio-gate` so it runs by default rather than by discipline, and make it **skip
cleanly** where a repo genuinely has no agent, while **failing rather than skipping** on missing
configuration — a check quietly doing nothing is indistinguishable from one that passed.
