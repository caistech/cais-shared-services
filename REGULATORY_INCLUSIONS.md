# REGULATORY INCLUSIONS — the legal surfaces every product must carry (canonical)

> **What this is.** The single ruleset for the **legal and consent surfaces a product must show its
> users** — privacy policy, terms, voice/recording consent, content/IP acknowledgment, cookies, and
> sender identity — with a **portfolio default for each** and a **per-repo hard gate** that fails
> until the repo has either accepted that default or recorded a deliberate customisation.
>
> **Why it exists.** We already solved this once, for email: `@caistech/email-compliance` ships a
> default footer, `assertCompliant()` **throws** on a non-compliant send, and a white-label product
> overrides the identity per send. That shape works. It was never generalised to the other five
> inclusions, so each product improvises — and the same finding keeps recurring across unrelated
> repos (see §7). This doc is that generalisation.
>
> **The failure it exists to stop** is not a missing page. It is a **page that exists and is
> wrong**: a `REPLACE — operator entity, ABN, registered address` skeleton published to production
> under a tickbox that says *"I agree to the Privacy Policy."* That is worse than no page, because
> the user has now agreed to something, and what they agreed to is a placeholder.
>
> **Severity: auth-pattern.** A missing or unreviewed inclusion is a **bug, not a polish item**. On
> REGULATED-tier products it is release-blocking.
>
> **Home & loading.** Lives in `cais-shared-services` so it is portable and teammate-readable.
> Referenced from `PRODUCT_STANDARDS.md` §9. **Last updated:** 2026-07-27.

---

## 0. The decider (two questions, in this order)

Every inclusion decision reduces to two questions. Answer them in order — the second one is the
one that gets skipped, and it is the one that produces the expensive mistake.

> **Q1 — Which inclusions does this surface trigger?** (§1)
>
> **Q2 — WHOSE legal identity is behind this surface?** (§2)

Q1 is mechanical: what the product does determines what it must disclose. Q2 is the judgement, and
it has exactly one wrong answer that recurs — **assuming the operator's identity is ours.** For a
white-label or distributor product it is the DISTRIBUTOR's entity, ABN and contact that must appear,
and putting Corporate AI Solutions' details on a product a distributor resells is the specific
failure this rule exists to prevent. It is the same gate `PRODUCT_STANDARDS` §9 already applies to
email sender identity, extended to every legal surface.

---

## 1. The inclusion set

Six inclusions. "Applies when" is Q1; "default" is what a repo gets for free; "customise trigger" is
what forces a repo off the default and into a written decision.

| # | Inclusion | Applies when | Portfolio default | Customise trigger |
|---|---|---|---|---|
| **I1** | **Privacy policy** (`/privacy`) | ANY collection of personal information — including an email address. In practice: every product with auth or a form. | `templates/cais-build-template-v2/app/privacy/page.tsx` — the 8-section Australian Privacy Act skeleton (who we are + ABN + address · what we collect · why · who we share with incl. subprocessors and overseas transfers · retention · rights + OAIC pathway · security · contact). | **Always** — the default is a skeleton, not a policy. Every section is a `REPLACE` marker. Accepting it unedited is never valid (see §3, the REPLACE rule). |
| **I2** | **Terms of use** (`/terms`) | Any product with accounts, payment, or user-generated content. | `templates/cais-build-template-v2/app/terms/page.tsx`. | Payment terms, cancellation, refunds, IP ownership of user content, liability cap — all product-specific. |
| **I3** | **Voice / recording consent** | Any product with a voice agent (i.e. anything consuming `@caistech/elevenlabs-convai`). | **NONE TODAY — this is the live gap.** ElevenLabs displays its own vendor-default modal before every call: *"I consent to the recording, storage, and sharing of my communications with third-party service providers… as described in the Privacy Policy."* The package never configures consent text, so **every product in the portfolio shows the vendor default**, and it links a privacy policy that must therefore exist. | The vendor default is not *wrong* — ElevenLabs genuinely is a third-party processor. It becomes wrong when product copy contradicts it (e.g. "what you tell her stays between you and your business"). Either reconcile the copy or override the consent text at agent level. **Both is the right answer.** |
| **I4** | **Content / IP acknowledgment** | Users create or share content built on third-party IP — karaoke backing, stock samples, someone's likeness, voice cloning. | `PRODUCT_STANDARDS` §9 codicil: a `/terms` page (own-performance vs licensed material, personal-use-only, takedown path) **plus** an acknowledgment gate before save/share, recorded on the account at signup. | Children's data, biometric/voice cloning, or third-party likeness raise the bar sharply (see §2). |
| **I5** | **Cookies / tracking** | Any analytics, session, or advertising cookie beyond strictly-necessary. | None yet. Strictly-necessary-only products need disclosure in I1, not a banner. | Any non-essential cookie, or any EU/UK visitor, triggers a consent mechanism — not merely a notice. |
| **I6** | **Sender identity** (email footer) | Every commercial electronic message. | **SOLVED — the reference implementation.** `@caistech/email-compliance` `senderFromEnv()` reads the canonical identity from `portfolio-manifest.yaml` `shared:`; `assertCompliant()` throws without ABN + unsubscribe; `assertJurisdictionAllowed()` hard-blocks non-AU. | White-label: pass the DISTRIBUTOR's identity via `compliance.sender` (`@caistech/email-send`). |

**I6 is the proof the pattern works.** It is the only inclusion with a real default *and* a real
gate, and it is the only one that stopped recurring as a finding. Copy its shape for the rest.

---

## 2. When the default is wrong — the two customise triggers

### Trigger A — whose brand travels (the one that gets missed)

The operator entity behind a surface is **not** automatically Corporate AI Solutions.

- **CAS-branded product** → the canonical identity (`portfolio-manifest.yaml` `shared:` —
  Global Buildtech Australia Pty Ltd, ABN 54 672 395 685).
- **White-label / distributor product** → the **DISTRIBUTOR's** entity, ABN and contact, in every
  inclusion, not just the email footer. Their privacy policy names *them* as the collector, because
  legally they are.
- **A product built for a founder who owns it** (the BucketLyst shape) → **their** entity. Worked
  example: BucketLyst's inclusions must carry Trinh's ABN 59 816 800 564. Note the live subtlety —
  the registered entity is *"The Trustee for Ly and Truong Family Trust"*, but a registered business
  name (*"Bucket Lyst"*) exists on the same ABN, and which one is published is the founder's call,
  not ours. **Ask; never assume.** Publishing someone's family trust name to every recipient is a
  decision they are entitled to make themselves.

### Trigger B — domain triggers that raise the bar

Any of these forces a customised inclusion set and, on REGULATED tier, legal review:

| Trigger | Raises |
|---|---|
| Children's data | COPPA + GDPR-K; parental consent surfaces. StoryVerse is the worked example (`/privacy` `/terms` `/parents` `/safety` `/cookies`). |
| Biometrics / voice cloning / likeness | Consent must be explicit and specific; I3 + I4 both apply. |
| Health, financial, immigration, identity | REGULATED tier. Retention and breach-notification commitments become load-bearing. |
| Overseas data transfer | Must be named in I1 §4 — subprocessors and where they process. Nearly always true (Supabase, Vercel, Resend, ElevenLabs, Anthropic). |
| Donations / deductibility claims | Who issues the receipt, and on whose authority. Never assert deductibility without written advice. |

---

## 3. The hard gate

A default that nobody is forced to review is a default that ships as a placeholder. The gate has
three parts, in increasing order of how much they actually catch.

### 3.1 The declaration — `regulatory.config.json` in every repo root

The repo must declare, per inclusion, one of exactly three states, with a reason for the last two:

```jsonc
{
  "operator": {
    // Trigger A, answered explicitly rather than assumed.
    "entity": "Bucket Lyst",
    "abn": "59816800564",
    "postal": "…",
    "brand_owner": "founder",          // "cais" | "distributor" | "founder"
    "confirmed_by": "Trinh, 2026-07-__" // who signed off, and when
  },
  "inclusions": {
    "privacy":  { "state": "customised",     "url": "/privacy" },
    "terms":    { "state": "customised",     "url": "/terms" },
    "voice":    { "state": "default",        "note": "vendor modal; copy reconciled 2026-07-__" },
    "ip_ack":   { "state": "not-applicable", "reason": "no third-party IP in user content" },
    "cookies":  { "state": "not-applicable", "reason": "strictly-necessary only" },
    "sender":   { "state": "customised",     "note": "distributor identity via compliance.sender" }
  }
}
```

- **`default`** — the portfolio default is genuinely fine here. Valid for I3/I5/I6; **never valid
  for I1** (see 3.2).
- **`customised`** — written for this product. Must point at a live URL.
- **`not-applicable`** — with a reason. A reason, not a shrug: *"strictly-necessary cookies only"*
  is a reason; *"n/a"* is not.

Missing file, or any inclusion undeclared → **fail**. Silence is not acceptance.

### 3.2 The REPLACE rule — the check that catches the real failure

**A published legal page containing a `REPLACE` marker is a hard failure, always.**

This is the cheapest and highest-value check in this document. The template ships skeletons on
purpose; the failure mode is shipping the skeleton. And it is not hypothetical — it has been found
in production, under a tickbox:

> *"Terms of Service and Privacy Policy links both go to `#`, and `/terms` returns a 404. You're
> making me tick a box agreeing to documents that don't exist."*
> — naive-tester, DealFindrs, 2026-05-26

Mechanically: fetch each declared inclusion URL on the deployed preview and fail if it 404s, is a
dead `#` anchor, or contains `REPLACE`. No judgement required, so no judgement can be skipped.

### 3.3 Runtime enforcement, where the inclusion has a runtime

I6 already does this: `assertCompliant()` throws inside the send path, so a non-compliant email
cannot leave. Prefer this shape wherever an inclusion gates an action — it survives a forgetful
consumer in a way a CI check does not, because CI checks the repo and the throw checks the event.

---

## 4. Proposed gate-readiness checks (#44–#46)

`gate-readiness/criteria.json` is **generated** from the signed-off workbook by
`extract_workbook.py` and must never be hand-edited (`THIN_MVP_RUBRIC` §8). These are therefore
**proposals**, filed as `gate-readiness/criteria-PROPOSAL-regulatory.json` following the same
convention as `promise-attributes-PROPOSAL.json`, pending ratification into the workbook.

| # | Check | Tier | Applies when | Method |
|---|---|---|---|---|
| **44** | `regulatory.config.json` present, every inclusion declared, operator identity confirmed by a named person | CONDITIONAL-HARD | any product collecting personal information | AUTO |
| **45** | Every declared inclusion URL resolves 200, is not a dead `#`, and contains no `REPLACE` marker | HARD | always (vacuous when #44 declares all `not-applicable`) | AUTO |
| **46** | Voice consent reconciled — product privacy copy does not contradict the vendor consent modal, and the policy it links to exists | CONDITIONAL-HARD | `applies_when: voice` | NAIVE / live pass |

Rationale for the tiers: **45 is HARD** because it is the "agreed to a placeholder" failure and is
purely mechanical, so a waiver would only ever be an excuse. **44 and 46 are CONDITIONAL-HARD** —
genuinely inapplicable to a product with no personal data or no voice agent, and blocking when they
do apply. None are WEIGHTED: a legal surface is not a thing you score 7/10.

---

## 5. Rollout — the current state this is written against

Not theoretical. Every one of these is open right now, which is why the generalisation is worth
writing rather than fixing three times:

| Product | State |
|---|---|
| **Kira** | Release-blocker ❌1 in its own `docs/NEXT_SESSION.md`: no ABN, no entity, no privacy policy anywhere on the site; footer "Privacy" → `#`. Its voice consent modal links a policy that 404s. Decision #1 in that same doc is I3. |
| **BucketLyst** | Same gap, and Trigger A applies — inclusions must carry the founder's entity, not ours. The entity question is asked in `docs/EMAIL_TO_TRINH.md`; the business-name-vs-trust choice is hers. Voice is now live in production, so I3 is active. |
| **DealFindrs** | `/privacy` and `/terms` dead under an agreement tickbox (naive-tester 2026-05-26). |
| **StoryVerse** | The worked example of doing it properly, retroactively, under pressure — children's-data product, closed Privacy Act + COPPA + GDPR-K exposure by publishing five pages at once. |
| **Portfolio-wide** | I3 has no default at all: `@caistech/elevenlabs-convai` never configures consent text, so every voice product shows the vendor modal. |

---

## 6. What this unifies

These already-existing rails are **instances** of this standard, not separate one-offs:

- **`@caistech/email-compliance` + `email-send`** → I6, and the reference implementation of §3.3.
- **`PRODUCT_STANDARDS` §9** — canonical sender identity, the white-label "whose brand travels"
  gate, the content/IP acknowledgment codicil → Trigger A and I4.
- **`templates/cais-build-template-v2`** `/privacy` + `/terms` → the I1/I2 defaults.
- **`PORTFOLIO_STANDARD` R15** — trust scaffolding on REGULATED products → Trigger B.
- **`DATA_STANDARD`** governs where data *lives*; this governs what users are *told* about it. They
  meet at I1 §4 (subprocessors and overseas transfer), which must describe the stores
  `DATA_STANDARD` §1 actually uses — including Mnemo, which is an external processor.

Where any of those disagrees with this doc on what a user must be shown, **this doc wins** —
re-sync the instance.
