# The Encode-Once Playbook

### Use your best model to write down the judgment — once — so cheaper models do the work forever.

> **The free playbook from the "ENCODE" post.** Frontier-model access is temporary and expensive.
> The highest-leverage thing you can do with it is not *tasks* — it's minting **durable artifacts**
> that turn expensive taste into cheap, repeatable execution. This is how one person runs the output
> of a team. Read it once; run it this week.

---

## The core idea (read this first)

There are two kinds of model work, and almost everyone conflates them:

| | Frontier model (expensive, temporary access) | Cheap model (cheap, unlimited) |
|---|---|---|
| **Bad use** | Doing tasks (a bug, an email, a summary) | — |
| **Great use** | **Writing down the JUDGMENT** — the rubric, the prompt, the persona, the "what good looks like" | **Executing against that judgment**, forever, for pennies |

The frontier model is a **taste engine**, not a faster worker. Point it at the *artifacts*, not the
*tasks*. Spend its judgment once; let the cheap models cash it in indefinitely.

**Why now:** your access to the best model is the resource that expires. When it's gone, throwaway
tasks leave you with nothing. Encoded artifacts leave you with a compounding asset that keeps
running on whatever cheap model you have next.

---

## The 5-criteria test — is this a frontier-model job?

Encode it with your best model **only if it scores high on all five**:

1. **Judgment / taste-heavy** — the thing a cheap model *can't originate* (evaluative, creative, synthesizing).
2. **Output is a reusable artifact** — a rubric, prompt, persona, eval set, spec — *not* a one-off action.
3. **Downstream becomes mechanical** — once the artifact exists, executing/scoring against it is checkable by a cheap model.
4. **Broad leverage** — it applies across many tasks/products, not one.
5. **Durable** — it doesn't churn every week.

If it fails these — if it's a one-off action, or something a cheap model does fine — **don't waste
frontier access on it.** Use the cheap model.

---

## The five artifact types to mint

| Artifact | The frontier model writes… | The cheap model then… |
|---|---|---|
| **Rubrics & quality bars** | "great, not just fine" — the pass bar AND the tempting version that fails ("X, not Y") | scores every output/review/gate against it |
| **Prompt libraries** | the hard, high-taste prompt for a recurring task | runs it a thousand times |
| **Personas & voices** | the character — tone, openings, boundaries | stays in character on every interaction |
| **Eval / golden sets** | what "right" looks like on the hard cases | regression-tests against it cheaply |
| **Positioning & style canon** | the locked voice / positioning | generates all downstream copy in that voice |

---

## The 4-step loop

1. **DETECT** — list the places you keep making the same judgment call by hand (every review, every
   "is this good enough," every "write this in our voice"). Those are your encode candidates.
2. **DRAFT (frontier model)** — have your best model write the artifact: the rubric, the prompt, the
   persona. Give it 1–2 gold examples to match the bar. This is the *only* step that needs the
   expensive model.
3. **APPROVE (you)** — review and ratify. **Keep this gate.** The model drafts the judgment; you own
   it. Never automate the approval — that's the part that's yours.
4. **OPERATIONALIZE (cheap model)** — wire the artifact into a config/file your cheap model loads
   every run, so it scores/executes against it automatically. Now it runs forever without you.

---

## Worked example — quality bars

**The task I kept doing by hand:** deciding whether a product's demo was actually *good* or just
*present*. Pure judgment. Slow. Inconsistent.

**What I encoded (frontier model, once):** a set of "X, not Y" quality bars per product. Example:

> *Vocal polish → "an untrained-ear listener says 'wow' on first playback — not 'that sounds better.'"*
> *Coach → "the voice agent initiates the next step proactively — not waits to be asked."*
> *Memory → "references a specific prior-session detail in turn one — not just 'welcome back.'"*

Notice the shape: every bar names the **passing behavior AND the tempting-but-failing version**.
That "not Y" clause is what makes it scoreable by a cheap model — it removes the wiggle room.

**What runs now (cheap model, forever):** every review loads those bars and scores against them.
The frontier model's taste was paid for once. Every gate since runs for pennies.

---

## Your this-week checklist

- [ ] List 3 judgment calls you make by hand every week (a review, a "good enough?", a "in our voice?").
- [ ] Run each through the 5-criteria test. Keep the ones that pass all five.
- [ ] For each keeper, have your **best model draft the artifact** (rubric / prompt / persona), with 1–2 gold examples to match.
- [ ] **Review and ratify** — you own the judgment; the model only drafted it.
- [ ] Wire each artifact into a file/config your **cheap model loads every session**.
- [ ] Delete the manual step. It now runs on the cheap model, against the frontier model's taste.

---

**One line:** *your best model is a taste engine on a timer — spend it minting the rubrics, prompts,
and personas your cheap models will run forever, and do it before the access window closes.*
