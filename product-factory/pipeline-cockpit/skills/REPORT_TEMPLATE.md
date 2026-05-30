# Naive Tester Report Template

Use this structure verbatim. Section names follow the actual screens encountered (not these placeholders). Voice and depth must match the calibration sample (Anneke NDIS SDA walkthrough 15.05.2026).

---

Hi Dennis,

Platform Feedback — {Product Name} Walkthrough
Persona: {persona name (e.g. "Anneke — Domain Operator")}
URL: {url tested}
Goal given: {one-line task}
Duration: ~{min} minutes
Date: {YYYY-MM-DD}

{Section 1 — name it after the actual area, e.g. "Landing Page", "Signup", "Properties", "Dashboard"}
- {Plain-language observation. Personal voice. "I expected X, instead saw Y."}
- {Domain-aware comment if applicable — operating reality, what real users of this product would notice}
- {Terminology / icon / IA nitpick if any. "Not a fan of X because Y."}
- {Concrete bug if encountered. "PDF upload failed to read a current document." No vague "an error occurred".}
- Opportunity: {strategic upgrade. "A spreadsheet-style table mode with bulk actions would significantly improve efficiency at scale."}

{Section 2}
- {...}
- Opportunity: {...}

{Continue for every distinct area encountered. The calibration sample had: Properties, Participants, Reconciliation, Claims, Workflow/Exceptions, Client Section, Bulk Upload/AI. Adapt to the product.}

Other Strategic Feature Suggestions
- {Cross-cutting suggestion 1 — feature that spans multiple sections}
- {Cross-cutting suggestion 2}
- {Cross-cutting suggestion 3}
- {Audit trail / compliance / data confidence / projection / forward-warning — domain-appropriate strategic plays}

Standards Check (portfolio non-negotiables — from PRODUCT_STANDARDS.md)
- {✅ / ❌ / — per UI-observable item, one line of evidence. List ❌ items first — they are findings.}
- {Cover: responsive (375/1440), auth-page pattern (forgot-pw / visibility toggle / magic link), persistent left navbar + reachable /settings + Sign Out, explanatory headers, voice agent reachable, browser tab title is the product name, team admin (if public), consequence-clarity on irreversible/cost/outreach actions, zero dead ends.}
- {Mark backend-only standards "— not verifiable from the UI" rather than guessing.}

{Scope note — single paragraph}
Just to note, a full walkthrough and meaningful review of a system at this stage is more involved than a {N}-minute task, so I've focused on key areas of highest impact. {What was tested vs blocked: e.g. "Couldn't go past signup as I don't have an account — feedback is on the public/signup experience only." OR "Tested all flows with sample data."}

Thanks,
{Persona first name}

---

## Quality checks before finalising

Before writing the report, verify each is true:

- [ ] Sections are named after actual screens, not generic ("UX Issues", "Bugs Found")
- [ ] Every section has at least one bullet AND one "Opportunity:" line
- [ ] Personal voice throughout — "I" statements, opinions, anecdotes
- [ ] Domain context appears — references to real operating reality
- [ ] Concrete bugs in plain language, not error-speak
- [ ] At least one terminology / icon nitpick if any deserved
- [ ] No praise-padding. No "Overall this is great!" openers.
- [ ] Signed off with the persona's first name
- [ ] Closing scope note states what was covered vs blocked
- [ ] Length: minimum 3 sections, target 5-8 sections. Bullets per section: 3-7.
- [ ] **Standards Check block present** — every UI-observable PRODUCT_STANDARDS item marked ✅/❌/— with evidence; ❌ items called out as findings.

If any check fails, rewrite before saving.
