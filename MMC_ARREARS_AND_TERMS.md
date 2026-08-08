# Outreach drafts — ready to send

> Companion to `SALES_MACHINE.md`. Drafts only; nothing here has been sent.
> **Never put a commercial/rate draft in a client repo** — `mmcbuild-application` is public and is
> being moved into the `mmcbuild-ai` org. That is why this file lives here.
>
> **Last updated:** 2026-08-05.

---

## 1. MMC Build — overdue instalments + terms after Stage 7

### The contract and the actual position

| Item | Value |
|---|---|
| Contract | **GBTA-MMC-2026-001** (A1), payment schedule varied Apr 2026 |
| Contract total | **$60,350 ex GST** |
| Stages 0–5 balance post-deposit | **$40,953 incl GST** |
| Schedule in force | **6 monthly instalments of $6,825.50 incl GST**, 30 Apr → 30 Sep 2026 (Karen chose 6-month 21 Apr 15:13; Dennis confirmed 15:47) |
| Final payment | **$12,155.00 incl GST**, due **30 days after Stage 7 acceptance** |
| Total | $53,108 incl GST |

**Status as at 2026-08-05 (operator-confirmed: two instalments unpaid):**

| # | Due | Amount | Status |
|---|---|---|---|
| 1 | 30 Apr 2026 | $6,825.50 | paid |
| 2 | 31 May 2026 | $6,825.50 | paid |
| 3 | 30 Jun 2026 | $6,825.50 | **OVERDUE — 36 days** |
| 4 | 31 Jul 2026 | $6,825.50 | **OVERDUE — 5 days** |
| 5 | 31 Aug 2026 | $6,825.50 | not yet due |
| 6 | **30 Sep 2026** | $6,825.50 | not yet due — **last monthly instalment** |
| — | **30 days after Stage 7 acceptance** | **$12,155.00** | not yet due — **final payment** |

> **Arrears: $13,651.00 incl GST.**
> **Total remaining on the contract: $39,457.00 incl GST** ($13,651.00 overdue + $6,825.50 on
> 31 Aug + $6,825.50 on 30 Sep + $12,155.00 after Stage 7).
>
> Reconciles: $53,108.00 contract − $13,651.00 already paid = $39,457.00. ✓

**No schedule discrepancy** — the 6-month option Karen chose on 21 April is what is being invoiced.
The email chain and the invoices agree, so there is nothing here for her to push back on. (An earlier
draft of this file wrongly had the 5-month schedule; corrected 2026-08-05.)

### What Stage 7 actually is — and why it is not "go live"

**A1 §3, Stage 7: Pilot, Iteration & Handover — 10 days, $8,500 ex GST. Status: NOT STARTED.**

| Deliverable | Description |
|---|---|
| Pilot onboarding | **Onboard 5–10 firms.** Guided walkthroughs of Comply, Build, Quote |
| Feedback & iteration | Weekly feedback review, prioritised bug fixes and UX improvements |
| AI retraining cycle | Incorporate corrections, re-run benchmarks, document outcomes |
| Post-pilot survey | Structured survey: usability, accuracy, value, willingness to pay |
| Handover documentation | Architecture docs, deployment runbooks, API reference, operational playbook, backlog |
| R&D evidence pack | Complete experiment report for AusIndustry |

> **Dependency (A1): "5–10 pilot firms to be confirmed by MMC Build." Status: Pending.**

**Three consequences, and they are the whole picture:**

1. **"Fine-tuning to go live" is Stage 6, not Stage 7.** Stage 6 is *Billing, Observability & Launch*
   (3 days, $2,550) — Stripe live, observability, launch. Stage 7 is a **10-day pilot programme with
   real firms that starts after launch.** The Final Payment covers **Stages 6 AND 7 together**, so
   going live does not trigger it. If you have been treating go-live as the end, the timeline is
   roughly a month longer than you think.
2. **Karen controls the dependency that gates your $12,155.** Stage 7 cannot start without 5–10
   pilot firms, and confirming them is MMC's obligation — recorded as *Pending* since March. **Ask
   for the pilot firm list now, in the same email as the arrears.** If she cannot produce it, Stage 7
   cannot complete, the final payment has no trigger, and $12,155 sits indefinitely through no fault
   of yours.
3. **Consider proposing a partial Stage 7 acceptance.** The handover documentation and R&D evidence
   pack are entirely within your control and are the parts MMC actually needs. If the pilot stalls on
   their dependency, offer to split Stage 7: accept and pay the handover portion on delivery, defer
   the pilot portion. Better a varied trigger you can meet than a clean one you cannot.

### 🔑 Two contract clauses that change the position entirely

**A3 §6 — IP has NOT transferred.**

> *"all code, documentation, and artefacts become the property of MMC Build Pty Ltd **upon full
> payment of the contract**."*

**MMC is about to launch commercially on software it does not yet own.** The repos being in their
GitHub org and the infrastructure being on their Vercel and Supabase is *possession*, not
*ownership* — the contract is explicit and A3 reaffirms it deliberately.

This is far better leverage than "I will stop building," because it is not a threat, it is simply the
term both parties signed. It is also a genuine commercial problem for MMC that Karen will care about:
launching to paying customers, and any investor or acquirer due diligence, on IP the vendor still
owns. **State it as a fact, once, without drama.** It is the single strongest reason for her to clear
the arrears before launch.

**A3 §5 — late interest, and an acceleration right that crystallises on 14 August 2026.**

> §5.1 *"Any instalment unpaid after its due date accrues simple interest at 5% per annum, calculated
> daily."*
> §5.2 *"If any **two** instalments remain unpaid more than **14 days** after their respective due
> dates, the **entire outstanding balance** under this schedule becomes **immediately payable on
> written notice from GBTA**."*

| Instalment | Due | 14 days past due | Status at 2026-08-05 |
|---|---|---|---|
| 3 of 6 | 30 Jun 2026 | 14 Jul 2026 | ✅ trigger condition met |
| 4 of 6 | 31 Jul 2026 | **14 Aug 2026** | ⏳ **9 days away** |

**On 14 August 2026, if instalment 4 is still unpaid, the acceleration right is live** — written
notice makes the whole remaining Part A balance (**$27,302.00**, instalments 3–6) immediately
payable, not just the two overdue.

You almost certainly should not fire it on day one — it is a relationship-ending instrument and it
does not create money in a business that does not have it. But **you should say it exists, before it
arms.** A deadline that was agreed in advance and is arriving on a known date is the most persuasive
thing in this entire file, and it costs nothing to mention. Interest accrued on instalment 3 as at
today is roughly **$34** — negligible in money, useful as a signal that you are tracking the contract
precisely.

**Before sending: confirm A3 was countersigned.** It carries signature blocks for both parties. If it
was agreed by email but never signed, the schedule still stands (conduct plus written agreement), but
§5's interest and acceleration rights are much cleaner to rely on with a signature on the page.

### The final payment date

The final $12,155.00 has **no fixed date** — it is 30 days after **Stage 7 acceptance**, so the clock
starts on a date you do not control and which nobody has set yet.

| If Stage 7 is accepted… | Final payment due |
|---|---|
| 15 Aug 2026 | 14 Sep 2026 |
| 31 Aug 2026 | 30 Sep 2026 |
| 15 Sep 2026 | 15 Oct 2026 |
| 30 Sep 2026 | 30 Oct 2026 |
| 31 Oct 2026 | 30 Nov 2026 |

Two consequences worth acting on:

1. **Acceptance is the trigger, and it is not automatic.** "It's live" is not acceptance. You need a
   dated written confirmation from MMC that Stage 7 is accepted. Without one there is no start date,
   and $12,155 sits with no due date indefinitely. **Ask for it as a specific, separate step when you
   finish go-live** — not buried in a status update.
2. **Accept early and the final payment can land before the last instalment.** Acceptance on or
   before 31 Aug puts the final payment due on or before 30 Sep — the same day as instalment 6. That
   is the best available outcome and it argues for finishing Stage 7 promptly, which is what you were
   doing anyway.

### A harder question about the retainer number

I called MMC "the easiest money in the plan" earlier. **On the evidence, that was wrong** — this is
debt collection, not a sale, and it needs to come out of the 30-day plan as a *reliable* source.

More importantly: **MMC needed a restructure before the first invoice, and has since fallen two
behind on $8,190.60/month.** Proposing a **$12,000/month** retainer to that client is proposing
something that will not happen. It is 20% of the entire contract value, every month, to a business
already struggling with two-thirds of it.

Three honest options:

1. **Price it to reality — $4,000–6,000 + GST/month.** Lower than the work is worth, but a retainer
   that gets paid beats one that gets admired. Scope it to match: a fixed number of days, not
   "continuous delivery."
2. **Quote $12,000 and mean it**, expecting them to decline and take it in-house. Clean, and you get
   your hours back for the audit/sprint pipeline. This is a legitimate answer, not a failure.
3. **Tie it to their revenue** — Karen already asked about *"a structure tied to when paid customers
   come online"* on 21 Apr and you deferred it. Now is when that becomes real, and it is the option
   she is most likely to say yes to. Warning: it makes your income depend on their sales performance,
   which is a bet on a business that cannot currently pay a fixed invoice. Only take it with a floor.

**The draft below uses $12,000 with option 3 named as the alternative.** Change the number before you
send if you would rather have option 1 — but decide deliberately, rather than discovering your answer
in the reply.

### Correcting what I told you last message

I said finishing go-live spends your leverage. **That was wrong, and the contract is why.** The final
$12,155 is contractually triggered by **Stage 7 acceptance**. Completing Stage 7 does not weaken your
position — it converts your largest remaining payment from a hope into a debt with a due date.

But the trigger is **acceptance**, not "it's live." So:

> **Get Stage 7 acceptance in writing.** A dated email from MMC saying Stage 7 is accepted is what
> starts the 30-day clock. If go-live happens informally and nobody signs anything, that $12,155 has
> no due date and drifts indefinitely. This is the single most valuable line in this document.

### The position is stronger than it feels

Two facts from the April chain do the heavy lifting, and both are in writing:

1. **The instalments are calendar-based, not milestone-based.** That was your concession to Karen's
   cashflow — the amounts fall due on fixed dates regardless of delivery state. So there is no
   "we're waiting on delivery" answer available. They are simply overdue.
2. **You already absorbed $15–20k of unbilled work** (agentic workflows, full 3D spatial extraction,
   multi-model cross-validation, model registry, remediation workflow, AI training content), you
   restructured the schedule to suit her cashflow, and when offered five months you gave six. That is
   three separate accommodations, in writing, before a single instalment was missed.

Worth saying plainly, because it will shape what you do next: **the pattern so far is that
flexibility has been met with less payment, not more.** Your instinct here will be to accommodate
again — offer a longer schedule, drop something, wait another month. Notice it before you act on it.
Flexibility is not what is missing from this relationship.

### Before you send

1. **Reconcile the four instalments against the bank.** Attach a statement showing each invoice, its
   due date, and what is outstanding.
2. **Confirm whether A2 was ever countersigned.** You offered a formal variation and then agreed the
   6-month version by email. The email chain of 21 Apr is almost certainly binding on its own — but
   reference it explicitly by date so there is no ambiguity about which schedule applies.
3. **Check A1 §5 and the general terms** for payment terms, interest on overdue amounts, and any
   suspension-for-non-payment right. If a suspension clause exists, cite it — that turns a position
   into an entitlement. If notice is required first, this email must be that notice.
4. **Decide whether to copy `contactus@savvywise.com.au`** (appears to be MMC's bookkeeper). If they
   process payments, they should have the statement. Ask Karen rather than adding them unannounced.

---

### The email

**The retainer is deliberately NOT in this email.** Mixing "you owe me $13,651" with "please commit
to $12,000 a month" weakens both — it lets her answer the easy one and reads as leverage rather than
administration. Raise it as a one-line flag here; put the actual proposal after the arrears are
resolved. Getting paid comes first.

**The power in this email is that every strong fact is something she signed.** Keep the tone
administrative. No adjectives, no "as you can appreciate", no explanation of how it makes you feel.
Precision is what makes this land — the moment it reads as aggrieved, it becomes arguable.

> **Subject:** MMC Build — overdue instalments, and three things before launch
>
> Karen, copying Karthik,
>
> Four things, none of them complicated.
>
> **1. Two instalments are overdue.** Instalments 3 and 4 of 6 under A3, due 30 June and 31 July,
> $6,825.50 each — **$13,651.00 total**. Statement attached. Could you come back to me this week with
> a date these will be paid? A date is all I need at this stage.
>
> **2. So you're not caught out by it.** A3 §5 provides that where two instalments are more than 14
> days past due, GBTA may call in the entire remaining Part A balance — $27,302 — on written notice.
> Instalment 4 reaches that point on **14 August**. I'm telling you now rather than on the day,
> because I would much rather have a payment date than use the clause. Interest is also accruing
> under §5.1, which I'll waive if this is settled promptly.
>
> **3. IP transfer, before you launch.** Under the original quotation and reaffirmed in A3 §6, the
> code, documentation and artefacts become MMC Build's property **on full payment of the contract**.
> Everything already sits in your GitHub org and runs on your Vercel and Supabase, so nothing about
> the launch itself is affected — but the ownership transfer hasn't happened yet. Worth being clear
> about before you're selling to customers and fielding diligence questions, and it's the easiest of
> these to resolve.
>
> **4. Stage 7 needs your pilot firms.** Stage 7 is the ten-day pilot — onboarding 5–10 firms,
> feedback and iteration, the retraining cycle, post-pilot survey, handover documentation and the R&D
> evidence pack. Under A1 the 5–10 pilot firms are MMC's to confirm, and that's still outstanding. I
> can't start Stage 7 without them, and Stage 7 acceptance is what triggers the final payment of
> $12,155.
>
> If the pilot firms are some way off, I'd suggest splitting Stage 7: I deliver the handover
> documentation and R&D evidence pack now and we record that portion as accepted, with the pilot
> running when the firms are ready. I'm happy either way — I just don't want the final payment
> sitting with no trigger date.
>
> To be clear on what I'm doing meanwhile: I'm finishing Stage 6 and taking MMC Build live, and the
> live system stays supported and secure throughout. None of the above changes that.
>
> Separately, once this is settled we should talk about what happens after Stage 7, since that
> completes the contract and there's been a good deal of work running beyond it. I'll put something
> to you then rather than complicate this.
>
> Could you come back to me this week with (a) a payment date and (b) where the pilot firms stand?
>
> Dennis
> Global Buildtech Australia Pty Ltd · ABN 54 672 395 685

---

### After you send

- **Get Stage 7 acceptance in writing.** Repeating it because it is worth $12,155 and it is the thing
  most likely to be skipped in the relief of going live.
- **Hold the line.** A "quick" request after Stage 7 with instalments still outstanding resets the
  clock and teaches them the date was soft. The email is worth exactly what the first exception is
  worth.
- **Retainer in advance, monthly.** You now have direct evidence of what invoicing in arrears
  produces with this client.
- **No date within a week → follow up once, asking only for the date.** A client who will not name a
  date is answering you. Better to learn it before building another month.
- **Keep money in this thread.** Jira and the day-to-day stay exactly as professional as they have
  been. The work has been good and the relationship is worth keeping — none of that is in question.

---

### After you send

- If they say yes to continuing development: **invoice the first month up front**, before the next
  ticket. The whole problem this fixes is work-then-hope.
- If they choose maintenance-only: every new request gets quoted as a piece of work before it starts.
  No exceptions, or you are back here in a month.
- If they go quiet for a week: one short follow-up, then stop building new features while it is
  unresolved. Continuing to ship into silence is what created the gap.
