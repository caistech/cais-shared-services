# Driplet template — "Just Ship It. It'll be Fine."

> The locked shape for every post in the series. Derived from №1 (the account takeover),
> which went through six drafts to get here — so the rules below are things that were
> *found*, not things that were decided in advance. Voice lives in
> `foundation/_portfolio/dennis-voice.md`; this is the format.
>
> **Locked 2026-08-08.**

---

## The rendered shape

```
Just Ship It. It'll be Fine. №N        <- masthead, injected by render(), never typed

[the thump — one sentence, no hubris in it]

[the confidence — what I believed, and why it was reasonable]

[the giveaway line — "If you'd asked me, I'd have told you so. Confidently."]

Here's what I found instead.

[the incident, one step per line-group]

[the stakes — who is hurt, and the number]

And yet [the paradox or the person]                 <- ≤ half the posts in a set

The obvious fix is [X].

But you can't. / We had. They did.

[why the obvious fix fails — CONCEPTUALLY technical, never implementation technical]

[what actually changed]

[how it was verified — the specific act, not "we tested it"]

[the pivot: "But here's the part that actually keeps me up."]

[the unsolved thing]

[the open question — LAST LINE, always]

—
Just Ship It. It'll be Fine. №N        <- footer, injected by render()
What we were sure of, what happened next, and what we changed so it can't go the same way twice.
```

`masthead: true` on the post; `render()` supplies both masthead and footer. **Never type
the series name into a body** — it lives in `SERIES` in `driplet-publish.mjs` so a rename
propagates instead of drifting.

---

## The rules, and what each one cost to learn

**1 · The lead line is PURE THUMP. No hubris in it.**
The first draft carried the confidence and the failure in one sentence and diluted both.
The confidence belongs at position two and three, where it hits harder because it arrives
*after* the reveal. ✅ *"For fifteen days, our payment path would hand a paying customer's
account to anyone who asked for it."* ❌ *"The paid path was finished. I could have taken
your account with it."*

**2 · Put a verified number in the first breath.**
"Fifteen days" was established with `git log -S`, not estimated. A reader who stops at
line one still has the whole story, and a number they cannot argue with does more work
than any adjective.

**3 · One idea per line-group, blank line between.**
This is read on a phone in a feed. A dense paragraph is a wall; a short line is a beat.

**4 · Beat 2 names the WRONG BELIEF, not the emotion.**
"I didn't believe him — I'd wired that myself" beats "I was frustrated." Misplaced
confidence is specific and true; feeling-words are generic.

**5 · Beat 4 is conceptually technical, never implementation technical.**
The reader is the diligence audience — an advisor or broker checking whether this operator
will embarrass them in front of a client. ✅ *"We tested the tools worked. We never tested
whether she believed she had them."* ❌ *"The query filtered on agent_id, which excludes
NULL."* If a lesson can only be told at implementation depth, it goes in the newsletter,
not the feed.

**6 · Say how it was verified, specifically.**
*"I confirmed it by running the attack against our own account, before and after. Then
reverted the fix to watch the test go red again."* That sentence is the whole credibility
of the series. "We tested it" is worth nothing.

**7 · The open question is the LAST LINE. Nothing follows it.**
It is the call to comment. An observation placed after it deflates it — tried once,
moved back. If you have something to add, fold it in *before* the question as the reason
for asking.

**8 · The question must be answerable from the reader's own product tonight.**
✅ *"Where's the path through your product that nobody has yet had a reason to walk?"*
✅ *"What's your test that memory works, as opposed to storage?"*
❌ *"What else does 'no payment today' quietly unlock?"* — a billing quirk nobody else
has. Clever, not useful. Three endings were rewritten for exactly this.

**9 · "And yet" appears in no more than HALF the posts in a set.**
Sits at the seam between what happened and why the obvious fix fails. It fits anywhere,
which is exactly how a signature becomes a tic. Currently 4 of 8 — at the cap, so the next
post written does not get one.

**10 · No generic advice, anywhere.**
A find-it/define-it/fix-it/test-again cadence was drafted and cut: it was the only place
in the post that sounded like advice rather than confession. If a process beat is wanted,
make it concrete and short — *"That part we're good at."*

**11 · Not every post ends in a question.**
№6 closes on an admission — *"we're getting caught out in new places rather than the same
ones, which is progress and isn't the same thing."* A set where every post ends in a
question reads as a device.

**12 · The series must not claim to be solved.**
The promise is narrow on purpose: *so it can't go the same way twice*. It will go a
different way. Say so.

---

## Hard limits (enforced by `preflight`)

| | |
|---|---|
| **Max length** | 3,000 chars — LinkedIn rejects longer. Target 1,300–2,500. |
| **Above the fold** | ~210 chars. Masthead (~31) + the thump must both fit. |
| **Sanitisation** | Runs against the FINAL rendered string. Any client, partner or non-owned product name is a hard block. Kira is ours and may be named. |
| **Markdown** | Stripped at render. LinkedIn renders none of it; asterisks print literally. |
| **Unicode bold** | Never. Looks like spam and breaks screen readers. |
| **Hashtags** | None. They do not fit the register and this audience does not need them. |
| **Links in body** | None. LinkedIn suppresses reach on them; the footer plus a pinned intro puts a curious reader one click away. First comment if a link is genuinely needed. |

---

## Publishing

- **Order is not the series number.** The intro carries no number, goes out **second**, and
  gets **pinned** — an intro does not earn attention on its own, and the strongest post
  does.
- **Verify before publishing anything that claims a fix is live.** №1 was checked against
  the deployed commit SHA before it was cleared. Publishing "now fixed" over a stale
  production would be its own driplet.
- **Cadence via LinkedIn's native scheduler**, not an API. Consistency is what a diligence
  reader is checking for; the send is not the bottleneck.

---

## Worked example

`driplets/posts.json` → `takeover-in-the-paid-path`. Rendered with
`node scripts/driplet-publish.mjs --render takeover-in-the-paid-path`.
2,419 chars, preflight clean. Every rule above is visible in it.
