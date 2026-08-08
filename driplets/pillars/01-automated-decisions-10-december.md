# Most of what you'll read about 10 December assumes you're caught. Start by finding out whether you are.

*Stream B pillar #1. ~1,800 words. Written for advisors whose clients are about to ask them
about this. Not legal advice — I build the software, I don't practise the law, and the two
open questions at the end are open for me too.*

---

On 10 December, a change to the Privacy Act starts to bite. If your business uses software
that makes — or *directly supports* — a decision that could reasonably be expected to
significantly affect someone's rights or interests, your privacy policy has to say so. In
general terms: what kinds of personal information go in, what kinds of decisions come out,
and broadly how the thing works.

The Office of the Australian Information Commissioner gets infringement-notice powers to go
with it, and penalties for a non-compliant privacy policy reach $330,000.

That's the change. You'll see a lot written about it between now and December, and most of
it will be correct. What most of it will also do is assume the reader is caught, because an
article that opens with "you may not need to do anything" is not an article anybody
commissions.

So let me start there instead, because it's the first question an advisor actually gets
asked, and the honest answer is genuinely useful.

## A lot of businesses aren't caught, and it's worth knowing which

The Privacy Act has never applied to most small businesses. If annual turnover is under
$3 million, an organisation is generally outside it altogether — no privacy policy
obligation, no APP 1.7, nothing to update on 10 December.

There are exceptions that pull you back in. Trading in personal information. Health service
providers. Being related to a larger business. Certain government contracting. If any of
those apply, the exemption doesn't.

I'd say two things about this.

The first is that if you advise a book of owner-operated businesses, a meaningful share of
them are probably exempt, and telling them so is worth more than telling them to panic. It
is also the fastest way to find the ones who *aren't*, because the exceptions are short and
you can walk them in a minute.

The second is that I would not build a compliance position on the exemption and stop
thinking about it. It has been reviewed repeatedly, it is unpopular with the regulator, and
a business that grows past $3 million doesn't get a grace period to go and find out what its
software has been deciding for the last three years. The work below is worth doing either
way, and it's cheap now and expensive under a deadline.

## The obligation sits with the business using the software, not the vendor who sold it

This is the part that surprises people, and it's the reason advisors are about to get
these questions rather than software companies.

If you bought a system that screens applicants, or scores a quote, or flags an application
into one queue rather than another, and that decision affects someone's rights or
interests — the obligation to explain it is yours. Not the vendor's. You are the entity
holding the personal information and making the decision; the vendor sold you a feature.

Which produces an awkward asymmetry. The party that understands how the automation works has
no obligation to describe it, and the party with the obligation often doesn't know it's
there.

## The list is the hard part, and it's harder than it looks

Everyone writing about this arrives at roughly the same practical step: make a list of every
decision in your business where software is doing some of the thinking. That's right, and
it undersells the difficulty.

Most of the software doing the thinking doesn't call itself AI.

It's a "suggested match" in a recruitment system. A risk band on an insurance quote. A
credit-limit recommendation inside an accounting package. A flag that decides which queue an
application lands in, or which of two form paths a customer sees. A "recommended action" in a
CRM. A scoring column somebody switched on in 2021 and nobody has thought about since.

Nobody who bought that software thinks of it as an automated decision. It was a feature on a
comparison table, or it arrived in an update, or it was on by default.

So the list cannot be built from vendor documentation, because the vendor isn't describing it
that way either. It has to be built from the decisions backwards. Not *"where do we use AI"*
— that question returns almost nothing useful — but:

**Where does an outcome for a person get shaped before a human looks at it?**

Then, for each one: what personal information goes in, what comes out, and would the person
affected be surprised to learn software was involved.

That last question is doing more work than it looks like. It is close to the test the rule is
reaching for, and it is answerable by someone who knows the business rather than the code.

## What happened when I did this on my own product

I build an AI assistant for business owners. It holds a lot: turnover, profit, how the
business actually runs, and — often — that the owner is thinking of selling and hasn't told
his staff or his family. If anything I've built was going to be caught by this, that would be
it.

So I went through it properly this week, surface by surface, reading the code rather than
recalling it.

The valuation turned out to be arithmetic. Figures in, published formula, same answers always
produce the same number, no model anywhere in the path. It's an estimate, and it isn't a
decision — it grants nothing and refuses nothing.

There's a filter that decides which of an owner's statements are withheld from the document
he'd hand a buyer, so that "I'd accept less than that" never travels into the room where it
would cost him money. That one has a real consequence. But it's a decision made in his
favour, about disclosure, not about his rights.

The memory chooses what to keep after each conversation. He can read it and delete it.

Coverage scores describe the business, and only he sees them.

My honest read is that **none of it meets the threshold.** The rule is aimed at decisions an
organisation makes *about* a person that change what they can have — credit refused, an
application screened out, a claim declined. Everything mine works out is about the owner's
own business, shown to the owner.

Then I wrote the disclosure anyway, and published it.

Partly because my own privacy policy already says, two sections earlier, that turnover and
profit are the most sensitive information most owners will ever type into anything. Having
written that sentence, declining to describe what the software does with it — on the grounds
that a threshold is arguably unmet — is a technicality argued at exactly the reader least
inclined to give you the benefit of the doubt.

But mostly because the disclosure turned out to be a good one. What it actually says is that
nothing automated sets your price, grants or refuses you access, ranks you against another
customer, or reports on you to anyone. That's a better sentence than silence, and it cost an
hour to be able to write it truthfully.

The version that would have been expensive is the one where I assumed I was fine, didn't
look, and found out in December that the filter or the scoring was closer to the line than I
thought.

## The two things I'm still not sure about

**How far "directly support" reaches.** A tool that ranks applicants but rejects nobody still
decides who gets read first, and on a Friday afternoon with two hundred applications, being
read first is most of the decision. I don't know where that lands and I haven't found anyone
willing to say precisely.

**Whether an estimate can support a decision.** My valuation doesn't decide anything. But the
owner acts on it — he sets a price, he goes to market or doesn't. If a number a business
gives you materially shapes what you then do, is the business "directly supporting" a
decision about you? I think probably not, because the decision is his and it's about his own
business. I'd like to be more certain than "probably".

If you know the answer to either, I'd genuinely like to hear it.

## What I'd actually do, if I advised a book of these businesses

**Sort them by the exemption first.** It takes a minute per client and it tells you where the
real work is. Being the adviser who says "you're not caught, here's why" is worth more than
being the fifth email about a deadline.

**For everyone who is caught, build the inventory before you touch the policy.** The wording
is a paragraph and it's the easy part. The list of where software shapes an outcome is the
hard part, it's the part that can't be outsourced to a template, and it's the part that
takes calendar time because you have to ask people what their systems actually do.

**Ask about defaults and updates.** The screening feature that arrived in a release note is
the one nobody will remember. So is the setting a departed employee switched on.

**Then write the policy, and have someone qualified check it.** In that order, because a
policy written before the inventory describes the automation you remembered rather than the
automation you have.

And do the inventory even where the exemption applies. Not for the regulator — for the
plainer reason that a business which can't say where software is making calls on its behalf
has a gap in its understanding of itself, and that gap costs money in ways that have nothing
to do with the Privacy Act.

---

*I build the software; I don't practise the law. Everything above is what I found doing this
on my own product and what I'd want to know if I advised owners. The threshold questions are
for a lawyer, and the two I'm stuck on are stuck for me too — if you've got a view, say so.*
