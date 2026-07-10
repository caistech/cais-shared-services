# LinkedIn post — "SKILLS" lead magnet

---

I installed ~60 skills into my AI coding agent.

I was using about 5 of them.

Sound familiar?

You add a tool, you're excited for a week, and then it quietly disappears into a menu you never open. Meanwhile you keep asking the agent for skills that were never even installed — half-remembered names from a demo you watched once.

So the agent is blind in two directions at the same time:
→ It forgets the good tools it actually has.
→ It nods along to tools that don't exist.

Here's the fix I built. It's boring, and that's the point.

**One document. Two behaviours.**

1️⃣ **A real inventory.** Every installed skill, in one file, mapped to the *exact moment in the work* that should trigger it. Not "here's a tool" — but "when you've just made a risky edit, THIS one drives the flow end-to-end and checks it actually works." When you're about to commit, THIS one reviews the diff. When you're building a chart, read THIS one first. The trigger is the moment, not the tool name.

2️⃣ **Ask-first, at the seams.** The agent doesn't silently plow ahead, and it doesn't spam you every message. At each *stage-change* in the work it asks one question: *"This looks like a good point to run the review skill — want me to?"* You say yes, or you say "stop suggesting" and it goes quiet. Safety tools (the ones that catch `rm -rf` and force-pushes) just fire — they don't ask.

**Why it actually works — three reasons:**

🔹 **The catalogue is auto-loaded every session.** It's not a doc you have to remember to open. It's imported into the agent's standing instructions, so the agent starts every session already knowing its own toolbox. Memory you have to invoke isn't memory.

🔹 **It routes on the moment, not the name.** You don't have to remember what the skill is called. You just work, and the agent recognises "ah, we've hit the point where the QA walkthrough belongs" and offers it. The recall burden moves off you and onto the machine.

🔹 **It lists what does NOT exist.** The single highest-value section is the "don't offer these" list — the phantom skills. Once the agent knows those aren't real, it stops promising them and offers the closest thing that IS installed. No more dead ends.

That's the whole trick. A living inventory + a nudge at the seams + honesty about what's missing.

It turned my agent from "a menu I forgot about" into "a colleague who knows the tools and offers the right one at the right time."

—

Want the template? It's a copy-paste file plus the one paragraph you drop into your agent's config to auto-load it. Works with any setup that reads a project instructions file.

**Comment "SKILLS" and I'll send it over.** ⬇️

(Building one-operator AI factories in public — follow along if that's your thing.)
