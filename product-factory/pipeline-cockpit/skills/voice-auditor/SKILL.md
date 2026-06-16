---
name: voice-auditor
version: 1.0.0
description: |
  Voice-agent placement auditor — the voice analog of naive-tester. Scans a
  build's UI surfaces, workflows, and core value proposition to map WHERE and
  WHY a voice agent is required or would add value, classified into the two
  canonical functions: guide/clarifier (help users through nuanced processes)
  vs coaching (the product-native value). Produces a voice placement map that
  feeds voice_agent_status and the MVP voice-wiring step. Two phases: a repo
  scan (static, pre-deploy) + an optional live /browse pass that validates the
  map against the rendered UI. Enforces the VOICE AI STANDARD RULE.
  Use when asked to "voice audit", "where does voice help", "voice placement",
  "audit voice agent", or before signing off a UI build's voice wiring.
allowed-tools:
  - Skill
  - Bash
  - Read
  - Glob
  - Grep
  - Write
  - Agent
  - AskUserQuestion
  - WebFetch
triggers:
  - voice audit
  - voice placement
  - where does voice help
  - audit voice agent
  - voice-needed test
---

# Voice Auditor — voice-agent placement auditor

## What this skill does

The voice analog of `/naive-tester`. Where naive-tester runs human UAT over a
build, the voice auditor maps **where and why a voice agent is required or could
add value** across a product's surfaces — so the proven `@caistech/elevenlabs-convai`
service is *designed in* during the MVP build, not bolted on ad hoc later. It is
the surfacing + enforcement mechanism for the **VOICE AI STANDARD RULE**
(`~/.claude/CLAUDE.md`) and **`PRODUCT_STANDARDS.md` §6**.

Read these once at the start (the canonical voice context):
- **`~/PycharmProjects/cais-shared-services/VOICE_MEMORY_STANDARD.md`** — the canonical persistent-memory rule set (rules 1–20). **This is the rubric you audit against** (the analog of how `/naive-tester` loads `PRODUCT_STANDARDS.md`).
- `~/PycharmProjects/cais-shared-services/PRODUCT_STANDARDS.md` §6 — the condensed gate + pointer.
- `~/.claude/CLAUDE.md` → "VOICE AI STANDARD RULE" — the mandate, integration shapes, known failure modes.
- memory `project_voice_placement_auditor` — the spec this skill implements.

## The two canonical voice functions

Every candidate surface is classified into exactly one — do not invent a third:

1. **Guide / clarifier** — helps the user move through a **nuanced or multi-step
   process** (forms, setup wizards, methodology steps, intake, admin decisions)
   where a label/tooltip can't carry the nuance. *(= point 8 of the VOICE AI rule.)*
   Integration shape: always-on chrome FAB (`<elevenlabs-convai>` CDN embed) for
   general help, OR the in-context `useConversation` SDK (`sendContextualUpdate`
   + client tools) for surface-specific clarification.
2. **Coaching** — the **product-native use-case where the voice agent IS the
   value** (Singify vocal coach, RaiseReady pitch coach, Connexions interviewer,
   lingo pronunciation coach). Integration shape: the lane-1 coaching loop
   (Engine-1 core), proactive + stage-aware per §6.

## Verdict per surface

- **Required** — the VOICE AI rule mandates it here, or the surface's nuance/value cannot be delivered without voice.
- **Could-add-value** — voice would measurably help but isn't load-bearing; schedule it, don't block ship.
- **Not-needed** — a static label/flow fully serves it; adding voice would be noise. (Over-calling "Required" is itself a failure — voice noise is a defect.)

## Phase 1 — repo scan (always)

Static pass over the repo. No live URL needed; runs pre-deploy so voice is designed in.

1. **Enumerate surfaces.** Glob routes (`app/**/page.tsx`, `pages/**/*.tsx`, route handlers) and identify: forms, multi-step wizards, intake/onboarding flows, admin/decision screens, dashboards, the landing/value-prop, settings.
2. **Read the value-prop** (README, landing copy, `products/<slug>` config, the `portfolio-manifest.yaml` entry) — is the product's core value something a voice agent *is* (coaching / interview / practice / pronunciation)? → coaching candidate.
3. **Per surface, classify** guide/clarifier vs coaching vs none, assign a verdict, and name the concrete integration shape.
4. **Check current voice presence:** is `@caistech/elevenlabs-convai` in `package.json`? Is a `VoiceWidget` / chrome FAB rendered? Is the agent id wired via a scaffolded `voice.config.ts` (NOT a hand-set `NEXT_PUBLIC_*`)? Flag any drift from §6 (missing widget, per-project re-implementation, non-BYOK key, passive button instead of proactive).
5. Emit the **voice placement map** (below).

## Phase 2 — live pass (optional; run when a live/preview URL is given)

Spawn a `general-purpose` Agent that uses `/browse` to walk the deployed UI and
**validate the Phase-1 map against what's actually rendered**: a form that looked
trivial in code may be dense/confusing live (→ upgrade to Required); a
client-rendered surface the scan missed gets added; a voice surface that's
present in code but broken/hidden live gets flagged. Screenshot each candidate.

**Detection — what counts as "voice present" (do NOT false-negative an SDK widget).** Voice is present if ANY of these renders, not only the CDN element: a class CONTAINING `convai` (`.convai-launch`, `.convai-launch--inline`, `.convai-btn`, `.convai-panel`), a named-coach launcher (avatar + a "Begin"/"Start a conversation"/"Talk it through" button + a 🎙️/mic affordance — the `@caistech/elevenlabs-convai` React `VoiceWidget` shape, e.g. SayFix's "Morgan"), an "Ask about this"/"Talk to" control, OR the raw `<elevenlabs-convai>` element. Requiring the literal `<elevenlabs-convai>`/exact `.convai-launch` is the documented false-negative class (sayfix, 2026-05/06). **Also screenshot the surface where voice actually mounts** — if the coach is param-scoped (e.g. `/welcome?product=<slug>`) or behind a click, the bare landing shows no voice and reads as a false "absent." The CI probe takes `--voice-url <surface>` for exactly this; a human run must navigate there too before judging.

**Behavioural memory check (not presence-only).** For any coaching/memory agent, verify the
loop *works*, not just that routes/tables exist (the storage≠memory trap, one level up): start
a session, end it, return, and confirm the **"welcome-back" recall actually fires** (the agent
references prior state), and that a recall *failure* degrades to a clean first-meeting (rule 13)
rather than a fabricated "last time you…". Output: a short "live validation delta" + a
**memory-loop pass/fail** appended to the map.

## Output — the voice placement map

Write to `./voice-audit/{YYYY-MM-DD-HHMM}/{repo-slug}.md`:

```markdown
# Voice placement map — {Product} ({repo})
Current: `@caistech/elevenlabs-convai` consumed? {yes/no} · VoiceWidget present? {yes/no} · manifest voice_agent_status: {value}

| Surface / flow | Verdict | Function | Why | Integration shape |
|---|---|---|---|---|
| Onboarding wizard | Required | Guide/clarifier | 6-step intake; several fields need nuance a label can't carry | in-context `useConversation` + `sendContextualUpdate` |
| Practice screen | Required | Coaching | the product's core value IS the coach | lane-1 coaching loop (proactive, stage-aware) |
| Pricing page | Not-needed | — | static, self-explanatory | — |

## Recommended voice_agent_status: {present | absent | migrating | n/a-non-ui}

## Wiring checklist (Required + scheduled could-add-value)
- [ ] {surface} → {shape}; consume `@caistech/elevenlabs-convai` (`/react` VoiceWidget); BYOK key; canonical persona.

## Live validation delta (Phase 2, if run)
- {surface}: scan said X, live shows Y → {change}
```

Then propose the `voice_agent_status` value for the repo's `portfolio-manifest.yaml` entry (apply it if asked).

## Recording readiness verdicts (Pipeline Gate scorer)

The placement map + the **memory-loop pass/fail** are the human-readable form; the Gate-1
readiness scorer reads the voice verdicts from the `readiness_results` table. After the audit,
record them so the cockpit's readiness panel reflects the voice checks (the CONDITIONAL-* voice
checks are HARD when the product ships voice).

The voice checks `/voice-auditor` owns (catalogue:
`~/PycharmProjects/cais-shared-services/gate-readiness/criteria.json`):

| Code | Check | From |
|---|---|---|
| 10 | Voice agent reachable from chrome ≤3 clicks | live pass |
| 11 | Consumes @caistech/elevenlabs-convai + /react, BYOK, persona | repo scan |
| 12 | Voice proactive + stage-aware | live pass |
| 13 | Every Required surface voiced (the placement map's verdict) | map |
| 14 | Voice memory loop WORKS (welcome-back recall fires, observable) | live pass |
| 15 | Memory pull-not-push, distil-then-recall, works off results | repo scan |
| 16 | Identity server-derived (conversation_id, never user_id) | repo scan |
| 17 | Every convai webhook verifies HMAC, unverified→401 | repo scan |
| 18 | Allowlist on every public agent | repo scan / API |
| 19 | Workspace-bound webhook (not the deprecated per-agent shape) | repo scan |
| 20 | Cross-session authed-only (pre-auth = founder-hardcoded id) | repo scan |

**Status:** `pass` · `fail` · `na`. If the product ships no voice, the scorer N/As these
anyway (the card has no `voice` feature), so you can skip recording.

```bash
cat > /tmp/voice-readiness.json <<'JSON'
[{"code":"10","status":"pass","evidence":"FAB on chrome, 1 click"},
 {"code":"14","status":"fail","evidence":"welcome-back recall did not fire on the return session"}]
JSON
node ~/PycharmProjects/cais-shared-services/scripts/gate-check.mjs \
  record-readiness <product-slug> --source voice-auditor --file /tmp/voice-readiness.json
```

A `fail` on a CONDITIONAL-HARD voice check blocks the card's Gate-1 readiness when the product
has the `voice` feature.

## When it runs

- **During the MVP build** (at V1/V2, like naive-tester) so voice is designed in, not retrofitted.
- **As a portfolio sweep** over existing repos to populate/refresh `voice_agent_status` and schedule voice migrations (the CLAUDE.md voice-migration tracking).
- **Before sign-off** on any UI build's voice wiring (the `PRODUCT_STANDARDS.md` §6 voice-placement gate).

## Hard rules

- Classify into exactly the two functions (guide/clarifier · coaching) — never a third.
- Every Required / could-add-value item names a concrete `@caistech/elevenlabs-convai` integration shape — never "add voice somehow."
- Never recommend a per-project re-implementation of the voice client — always the hub package + its `/react` `VoiceWidget`.
- BYOK always: the agent runs on the user's ElevenLabs key, not the operator's.
- Don't over-call "Required." A static label that fully serves the user is Not-needed; recommending voice where it adds nothing is a failure, same as missing it where it's mandated.

## Output location

```
./voice-audit/{YYYY-MM-DD-HHMM}/
  ├── {repo-slug}.md
  └── screenshots/   ← Phase 2 only
```

Default to the current working directory. Multi-repo sweep → `~/voice-audit/{timestamp}/{repo-slug}.md` + a `summary.md` listing every Required gap across the portfolio.
