# "Agentic team" means at least four different things, and the vendor rarely says which

*Stream B pillar #2. ~2,000 words. Written for the person who is being sold one of these and
does not build software — an advisor whose client is about to sign, a broker, an owner with
three quotes on the desk. Every trade word is explained where it first appears, because you
will hear all of them in the meeting. No vendor is named, deliberately: several of the
interesting ones are potential partners, and the argument does not need them.*

---

I spent a good while last year nodding along to the phrase "agentic team" without once asking
anyone what they meant by it, which in hindsight was careless, because I now think it covers
four genuinely different machines — and most conversations about it are two people describing
different ones to each other in perfect agreement.

I only worked that out because I had to build one. Someone asked me a very reasonable
question, the sort I would have asked: surely you set up a group of specialists in advance,
each with its own knowledge and its own access — one that knows how you quote, one that knows
your contacts, one that writes the letter — and the system hands work to whichever fits?

It is the picture nearly everyone has, and you will see it on a slide. I have come to think it
is right about a smaller share of the work than it sounds, and the reasoning is more useful to
you than my conclusion, because you are the one who has to judge somebody else's version of it.

## First, the words

Five you will hear in the meeting. None is jargon for its own sake — each one changes what you
are buying.

**Model.** The AI itself, the part that reads and writes. Two things follow. It costs money
every time it runs, so anything it touches has a price per use rather than a price per licence.
And it can give a different answer tomorrow from the same starting point. That is exactly what
you want for judgement and exactly what you do not want for anything that has to be identical
every time.

**Prompt.** The instructions the model is given. Worth knowing because "we have prompted it not
to" describes what they have asked for, not what the thing is able to do.

**Agent.** A model that has been given **tools** — the ability to actually do something. Send
the email, raise the invoice, book the appointment, rather than just write words about it. That
is the whole meaning of the word, and it is the single most important thing to slow down on.

**Orchestration.** Deciding which part does what, in what order. Ask whether that decision is
itself made by a model or by ordinary software. Both are legitimate. Only one is predictable.

**Token.** In this setting, the key that lets their system into yours. It usually keeps working
long after the meeting, which is why it matters where it is kept and how you cancel it.

## The four things people mean

**One — a swarm.** Helpers created to do one job, several working side by side, gone when it is
finished. Nothing standing, nothing kept warm. This is what most engineers mean, and it is the
version that genuinely works today at scale.

**Two — role-play.** A Researcher, a Writer, a Critic, and a manager handing off between them.
This is what most of the writing about agentic teams describes, and it is the one to be careful
about, because **the roles are instructions rather than restrictions.** In the ones I have
looked at, every character shares the same tools, the work-in-progress lives in the
conversation, and the handoff between them is itself a model's decision. The organisation chart
is decoration. Nothing prevents the Writer using the Researcher's access, because there is no
*preventing* in the design — only asking.

**Three — a fleet.** Configured assistants living inside a large platform you already pay for,
standing, triggered by events, scoped to that platform's data. This is closest to the picture in
the question I was asked, and it is real and it works. Worth noticing *why* it works: they are
standing because the platform was already standing, and they are properly scoped because the
platform already owns the rules about who may see what. Both of those were inherited, not built.

**Four — a workflow.** Ordinary software doing most of the work by following rules, with models
used only where something genuinely needs judgement, and a hard separation between the part
that decides and the part that acts.

That last one is what we build, and it is the least exciting of the four to describe over
dinner. It is deliberately less agentic than the marketing.

## Most of the work should have no model in it

We keep a list of about a hundred and forty jobs that a business like our customers' does over
and over — chase an overdue account, follow up a quote, tell a subcontractor his insurance runs
out in a fortnight. When we sorted them honestly, roughly half are mechanical.

Not "simple". Mechanical: something crosses a line, we check it against the system that actually
holds the record, we write it from a template, we apply the owner's rules about what needs his
say-so, and it goes.

Chasing a sixty-three-day invoice is a comparison, a check and a template.

Put a model in the middle of that and you buy three things — a cost on every run, a delay, and
the possibility of a different result tomorrow from the same starting point. What you lose is
the one that matters: when the owner asks why it sent that, there is a reason he can read.

About one job in seven genuinely needs judgement. A quote for something unusual. A "can you
sharpen the price" conversation. An argument about scope halfway through a job. Those want a
model, and they will take most of the work to build — which is a neat illustration of how badly
effort and volume line up, and why the impressive seventh is what gets demonstrated.

**How to use that in the room.** Write down the ten jobs you actually want off your desk — not
the exciting ones, the ten that eat Tuesday. Hand the list over and ask them to sort it: which
of these need judgement, and which are rules being followed? If it all comes back as the clever
kind, they have priced the demo rather than your week.

## The line nobody has a name for

Here is the part I would want an advisor to take away, because it decides whether a system is
safe to put in front of a client.

There is a line between something that can *propose* an action and something that can *perform*
it. That line — not the number of agents, not the model, not the org chart — is the whole of it.

If a quote needs the owner's approval before it goes out, but the agent writing it holds the
ability to send for the duration of its work, then "produce a draft and stop" is a request. Not
a restriction. A request. One bad step in a chain of reasoning and the quote is with the client,
and everything else was correct: the approval was configured, the policy was right, the agent
was instructed. It simply had the ability to act, and a reason to use it.

The fix is not a better prompt. It is not a second model checking the first either, because that
is another thing that can be talked round in exactly the way the first one was.

The fix is that the agent does not have the ability. It writes down what it wants to happen, and
that goes onto a waiting list — in the trade, an **outbox**. Something else entirely picks it up
afterwards and carries it out, once the approval has landed. That second thing has no judgement
in it at all, which is the point: there is nothing there to persuade.

Two different pieces of software, one of which cannot reason and therefore cannot be reasoned
with.

We got that inversion right early, and I would like to claim foresight, but the honest version is
that we wrote it down as a principle and then found out this month that the part which carries
things out only knew how to do one kind of job. Anything else, we would accept it, file it, and
never do it. No error, nothing red, every screen reporting perfect health. The rule was sound.
What sat behind the rule was quietly narrower than the rule implied — which is its own lesson
about how these systems fail. Not with an error. With a silence.

## Where the work lives when nobody is looking

The last one is unglamorous, and it separates a demonstration from a product faster than
anything else here.

Where does a job sit between the moment somebody asks for it and the moment it is done?

Often the answer is "in the conversation" — technically the **context window**, the model's
short-term memory for one exchange. That is fine for a demo which runs end to end in ninety
seconds, and useless the moment a job has to survive an approval that lands the next morning, a
power cut, or a retry three days later.

Ours sits in a table, with a status, a history, and a rule that the same instruction arriving
twice is still one job. Most real business work does not finish inside the conversation that
started it.

I would go further. If a system cannot tell you what it is currently holding for a given
business — not whether it is healthy, but *what it is holding, by name* — then it is not
holding anything. It is just running.

## The test — six questions, in this order

This is the part worth printing. Ask them of any vendor, including us.

1. **How much of this is a model, and how much is plain software following a rule — and why is
   that split right?** "It is all AI" is an answer, and an expensive one.
2. **Can an agent act, or only propose?** If the answer contains the word "prompt", it can act.
3. **What are the guardrails, exactly?** Listen for whether the safety net is a genuinely
   different kind of thing, or another model checking the first.
4. **Where does the work live between being asked for and being done?** If it is the
   conversation, ask what happens when the approval lands tomorrow morning.
5. **What does the integration actually hand over, and how do I cancel it without ringing
   anyone?** For us this is a key to a business's accounting system, which is standing access to
   their entire financial position. It is the largest risk in the arrangement and it is almost
   never on the slide.
6. **Is the approval structural or behavioural?** Enforced by the shape of the software, or by
   the agent having been told? That is question two asked again at the end, because the first
   answer is usually the optimistic one.

None of those require you to understand how any of it works. They require the seller to be
specific, which is the actual test.

And one more, which tells you more than the six: **ask them for a story about something that
went wrong and that they found themselves.** Then listen to how they tell it. Did they find it,
or did a customer? How did they find it? What would it have looked like from your side — and if
the answer is "nothing at all, that is exactly the problem", they have met the expensive kind of
failure. How did they prove the fix works? A check nobody has ever seen fail is not a check.

If they have no story at all, that is also an answer. Either it is very new, or nobody has gone
looking.

## Where I am not sure

Two things I genuinely have not resolved, and you should weigh them accordingly.

The first is standing versus on-call. I have argued that what belongs ready in advance is the
*instructions* — what this one is for, what it may see, what it may propose, written down and
agreed before work arrives — rather than a set of assistants sitting there waiting. And that
most of what people want a permanent assistant for turns out to be a permanent *fact*: not
something that reads the owner's last twenty quotes every time, but the shape of how he writes
one, worked out once and written down. I believe that. I also notice it is extremely convenient
for someone whose setup has nowhere to put a permanently running assistant, and I cannot fully
separate the reasoning from the constraint.

So do not ask a vendor which approach is right. Ask why they chose theirs, and whether they would
still choose it if their setup allowed the other.

The second is whether the mechanical half stays mechanical. Models get cheaper and better every
few months, and "no model in this path" is a decision made against today's costs and today's
explainability. I do not think being able to explain a decision gets cheaper. But I have been
wrong about the shape of this before, which is most of the reason I wrote it down.

If you are being sold one of these, the questions are yours. If you are building one, I would
like to know which of the four you think you are building — because in my experience that
question produces a much longer pause than it should.
