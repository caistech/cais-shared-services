# Factory Floor #1 — The 90-second workaround

*By Dennis McMahon · BYOK Factory*

---

I had a Unipile 401 bug on Tuesday.

The auth callback was returning 401 on a webhook route I'd just shipped.
Signature was valid. Headers were right. The code was correct. The vendor's
community Slack queue was, charitably, backed up — bug reports from the
week before were still unanswered. I needed the workaround now, not next
month.

So I pointed a tool at the problem.

The tool is called CQR — Community Question Responder. It watches dev-tool
community channels, drafts replies against a vendor-specific knowledge
base, queues each draft for one-click human approval before anything posts.
I built it for a different reason — to be visibly present in vendor
communities where my product depends on the vendor's API — but it turned
out to have a second use that matters more.

For my 401 bug, I didn't wait for the vendor.

I ingested Unipile's public docs, their SDK source, the open GitHub issues
mentioning similar symptoms, and the original symptom thread in their
Slack. Total time: about three minutes of `curl` and an `npm install`.

Then I asked the drafter — pretending I was someone else in the community
hitting the same bug — what the answer was.

It produced this in 90 seconds:

> Almost certain this is your Supabase auth middleware running before the
> route handler. Same class of bug has bitten me twice in production.
> Quick check + the fix.
>
> If you're using the standard `@supabase/ssr` middleware pattern (the
> one in Supabase's Next.js auth docs), the middleware gate checks for
> a valid Supabase auth cookie on every `/api/*` request. No cookie →
> 401, *before* your route handler runs. Webhooks from Resend, Stripe,
> Unipile, Slack don't carry your Supabase cookie — they carry a
> signature header instead. Cron requests from Vercel don't either;
> they carry a `CRON_SECRET` header. Both get rejected at the middleware
> gate before they ever reach your signature-verifying code.
>
> Diagnosis: response body is the exact string `{"error": "Unauthorized"}`
> — that's the middleware's shape, not a typical route handler. Curl
> with a valid signature header still returns 401. The route's own auth
> logic never logs anything.
>
> Fix: add the route prefix to the middleware allowlist. (...)

It was right. The fix worked. I shipped.

---

## Why this matters

The interesting part of this story isn't that an LLM produced a good
answer. LLMs produce decent answers to bounded technical questions all
the time. The interesting part is the **operator-doesn't-wait** beat.

The vendor's community queue is the bottleneck. Their docs are the source
of truth. The answer to my bug existed across both — but it took *me*
40 seconds to type the query into one place, *the LLM* 90 seconds to
synthesize the answer, and zero minutes of any vendor employee's attention.

If I'd posted my question into Unipile's queue and waited, I'd have
shipped on Friday. Maybe.

When you build a tool whose job is "answer questions thoughtfully against
a vendor's public surface," the operator's own bug becomes the smallest
possible test case for the tool. CQR's job description was originally:
*"help me be a thoughtful technical voice in the vendor's community."*
After Tuesday, the job description is also: *"help me not get blocked
when the vendor's community queue can't help me fast enough."*

Same product. Same code. Same KB ingestion shape. Different mode of use.

So I made the mode a config switch.

---

## Two ways to run this

CQR ships with two deployment modes, one codebase:

**customer-self-serve** — you (the operator) deploy CQR into your own
infra. You point it at vendor docs you depend on. When you have a bug,
you query the KB. Drafts queue for you only. Nothing posts anywhere.
This is the mode I used on Tuesday.

**vendor-self-deploy** — you (the vendor / community admin) deploy CQR
into your own infra. You point it at *your* docs, *your* GitHub issues,
*your* community archive. When community members ask questions, CQR
drafts replies. You approve before anything posts. Your community queue
clears faster without scaling headcount.

The mode is a setup-time configuration switch. Same release, same BYOK
keys, just whether approved drafts post anywhere or stay as drafts.

---

## Here's the repo

[github.com/dennissolver/community-question-responder](https://github.com/dennissolver/community-question-responder)

Clone it, deploy your own, run it in whichever mode fits.

- **BYOK** — you bring your own Anthropic / OpenAI / Supabase / Resend /
  ElevenLabs keys. I never touch them. You pay your own vendor bills.
- **MIT-licensed** — fork it, modify it, redistribute it.
- **One-click deploy** to Vercel — README has the button. Target time
  from "never heard of CQR" to "live in your own infra": under five
  minutes, zero terminal commands.
- **No strings** — there is no CQR SaaS. There is no "upgrade to Pro."
  There is no upsell. CQR is the second tool from BYOK Factory — a
  portfolio of small, sharp tools built to the same methodology and
  released the same way: free, BYOK, your infra.

If you operate in vendor communities and the queues are slow, deploy CQR
in customer-self-serve mode. Type the bug, get the workaround, ship.

If you run a vendor community and the queue is overflowing, deploy CQR
in vendor-self-deploy mode. Approve drafts. Clear the queue.

If neither describes you but you're curious about how a small BYOK
product gets shipped end-to-end — repo's open. The setup wizard, the
voice agent integration, the bot-token migration story, the Rule 10
classification — it's all there.

— Dennis

*BYOK Factory ships small tools, free, source-first. See the marketplace
for siblings: [corporate-ai-solutions.vercel.app/marketplace](https://corporate-ai-solutions.vercel.app/marketplace)*
