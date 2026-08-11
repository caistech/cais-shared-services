# "Agentic team" means at least four different things, and the vendor rarely says which

*Stream B pillar #2. ~1,750 words. Written for advisors, brokers and operators who are being
sold one of these, and for the builders in the comments who will tell me where I'm wrong.
No vendor is named in here, deliberately — several of the interesting ones are potential
partners, and the argument doesn't need them.*

---

I spent a good while last year nodding along to the phrase "agentic team" without ever
asking anyone what they meant by it, which in hindsight was careless, because I now think
the phrase covers four genuinely different architectures and most conversations are two
people describing different ones to each other in perfect agreement.

I only worked that out because I had to build one. Somebody asked me a very reasonable
question — the sort of question I'd have asked — which was roughly: surely the point is that
you stand up a set of specialised sub-programmes, each with its own access to the connectors
and the knowledge and the models it needs, each fine-tuned for its job, and the orchestrator
sends work to whichever one fits? A quoting agent, a contacts agent, an email agent. Off
they go, back they come.

It's a good instinct and it is roughly what the market is selling. I've come to think it's
right about a smaller fraction of the work than it sounds, and I want to lay out why,
because the reasoning is more useful than the conclusion.

## The four things people mean

**One — a swarm of coding agents.** Ephemeral, spawned per task, several of them working the
same codebase in parallel, gone when they're done. This is what most engineers mean, and
it's the version that actually works today, at scale, in public. Nothing standing. Nothing
warm. They exist for as long as the job takes.

**Two — role-play.** A Researcher, a Writer, a Critic, and a manager agent handing off
between them. This is what most of the writing about agentic teams means, and it's the one
worth being careful about, because the roles are prompts rather than boundaries. In the ones
I've looked at, all the agents share one tool belt, the state lives in a conversation
buffer, and the handoff is itself a model's decision. The org chart is decoration. Nothing
stops the Writer calling the Researcher's tools, because there is no *stopping* in the
design — only instruction.

**Three — a fleet on a platform.** Configured agents attached to a big vendor's system,
standing, triggered by events, scoped to that vendor's data. This is closest to the picture
in the question I was asked, and it is a real thing that really works. Worth noticing *why*
it works: they're standing because the platform was already standing, and they're properly
scoped because the platform already owns the permissions model. Both of those are things
they inherited, not things the agents brought.

**Four — a workflow engine with models in it.** Most of the work has no model in it at all.
Models sit at the points where judgement is genuinely required, and there is a structural
boundary between the part that decides and the part that acts.

That last one is what we've built, and I'll admit it is the least exciting of the four to
describe at a dinner. It is deliberately less agentic than the marketing.

## Most of the work should have no model in it

We have a registry of about a hundred and forty operational flows for the kind of business
we serve — chasing an overdue account, following up a quote, telling a subcontractor his
insurance expires in a fortnight. When we tiered them honestly, roughly half are mechanical.
Not "simple", mechanical: something crosses a threshold, we check the source of record, we
compose from a template, we apply the delegation rules, we send.

Chasing a sixty-three-day invoice is a comparison, a confirmation and a template. If you put
a model in that path you buy three things — cost on every single run, latency, and
irreproducibility — and you lose the one that matters, which is that when the owner asks
"why did it send that", there's an answer he can read.

About one flow in seven genuinely needs judgement. Building a non-standard quote. Handling a
"can you sharpen the price" conversation. A variation dispute mid-job. Those are the ones
that want an agent, and they're also the ones that will eat most of the engineering, which
is a nice illustration of how badly effort and count line up.

So when somebody says agents all the way down, my first question isn't about the agents. It
is: what fraction of this has no model in it, and can you tell me why that fraction is right?

## The line nobody has a name for

Here is the part I'd want an advisor to take away, because it is the one that decides
whether a system is safe to put in front of a client.

There is a line between an agent that can *propose* something and an agent that can *do* it,
and that line — not the org chart, not the number of agents, not the model — is the whole
of it.

If a quote needs the owner's approval before it goes out, but the agent writing it is
holding the send tool for the duration of its reasoning, then "produce a draft and stop" is
a request. Not a constraint. A request. One bad step in a chain of reasoning and the quote
is with the client, and everything downstream was correct: the gate was configured, the
policy was right, the agent was instructed. It simply had the ability to act and a reason
to use it.

The fix is not a better prompt, and it isn't a critic agent either, because a critic agent
is another model — you've added a second thing that can be talked round rather than a thing
that can't.

The fix is that the agent doesn't have the tool. It writes a row saying what it wants to
happen. Something else entirely, with no model in it, performs that row after the approval
has landed. Two different pieces of software, one of which cannot reason and therefore
cannot be persuaded.

We got that inversion right early and I'd like to claim foresight, but the honest version is
that we wrote it down as a principle, and then found out this month that our own executor
knew about exactly one kind of work. Anything else, we'd accept it, store it, and never
perform it — no error, nothing red, every screen healthy. The boundary was sound. The thing
on the far side of it was quietly narrower than the boundary implied, which is its own
lesson about how these systems fail: not with an error, but with a silence.

## State that survives being switched off

The last one is unglamorous and it separates a demo from a product faster than anything else
on this list.

Where does the work live between the moment somebody asks for it and the moment it's done?

In a lot of what I've seen, the answer is a conversation — which is fine for a demo that runs
end to end in ninety seconds, and useless the moment a task has to survive an approval that
lands the next morning, a deploy, a crash, or a retry three days later. Ours lives in a
table, with a status, a history and an idempotency key, because most business work doesn't
finish inside the request that started it.

I'd go further: if a system can't tell you what it is currently holding for a given business,
it isn't holding anything. It's just running.

## The test — six questions, in this order

This is the part I'd actually print out. Ask them of any vendor, including us.

**1. What fraction of the work has no model in it, and why is that the right fraction?**
"It's agents all the way down" is an answer, and it tells you the cost per run is unbounded
and the behaviour is unexplainable.

**2. Can an agent act, or only propose?** If the answer involves the word "prompt", it can
act.

**3. What happens when it's wrong?** Listen for whether the safeguard is a *different kind
of thing* or just another model.

**4. Where does the state live?** If it's a conversation, ask what happens when the approval
lands tomorrow.

**5. Who holds the credentials, and can the customer revoke them?** For us this is a refresh
token to a business's accounting system, which is standing access to their entire financial
position. It is the whole risk surface and it is rarely on the slide.

**6. Is the approval structural or behavioural?** Meaning: is it enforced by the shape of the
software, or by the agent having been told? This is the same question as two, asked again at
the end, because it is the one that matters and the first answer is usually optimistic.

None of those require you to understand the technology. They require the vendor to be
specific, which is the actual test.

## Where I'm not sure

Two things I genuinely haven't resolved.

The first is standing versus on-call. I've argued the specialisation belongs in a declared
capability — the tool set, the prompt, the model, written down and reviewed before any work
arrives — rather than in a running process, and that most of what people want a standing
agent for turns out to be a standing *fact* they should have extracted once and stored. I
believe that. I also notice it's very convenient for someone whose infrastructure has
nowhere to put a long-lived process, and I can't fully separate the two.

The second is whether the mechanical half stays mechanical. Models get cheaper and better
every few months, and "no model in this path" is a decision I made about today's costs and
today's explainability. I don't think reproducibility gets cheaper. But I've been wrong about
the shape of this before, which is most of why I wrote it down.

If you're being sold one of these, the six questions are yours. If you're building one, I'd
like to know which of the four you think you're building — because in my experience that
question produces a much longer pause than it should.
