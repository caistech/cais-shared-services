# Naive tester — pre-wired for this product

The `/naive-tester` skill (lives at `~/.claude/skills/naive-tester/`) ships a
domain-matched persona that walks the deployed product as a confused human
beta tester and emails the report to `mcmdennis@gmail.com`.

## Running on this product

Once the product is live at a Vercel preview or production URL:

```text
/naive-tester <vercel-url> [persona]
```

If you omit the persona, the skill auto-matches one by URL pattern / product
name. Available personas include: Anneke (NDIS SDA), Marcus (modular builder),
Stuart (R&D claims), Liam (deal sourcing), Priya (founder coaching), Carla
(events/wedding planner), Helen (school), Elena (parent), Hamish (architect),
Tom (small builder), Tony (subcontractor), Dev (devops), Wei (manufacturer),
Hiroshi (tourist), Asha (legal), Megumi (ecom), Sam (operator), Owen (ops),
Bea (gov reviewer), Andre (lender), Jessica (investor), Rohan (analyst),
Chloe (recruiter), Margaret (retiree), Bilal (council planner), Jake
(tradesperson), Sarah (compliance officer), Megan (HR).

## Weekly auto-run

The portfolio runs a scheduled sweep every Monday 7am Sydney via the
`naive-tester-weekly` /schedule routine — every active Vercel project under
the corporate-ai-solutions team gets walked and emailed. A new product is
swept automatically once it's deployed under the team.

## Reading the report

Each report saves to `~/naive-tester-reports/{YYYY-MM-DD-HHMM}/<product>.md`
and gets emailed via Resend. The format mirrors Anneke's NDIS SDA walkthrough
calibration sample — friction log, dead ends, edge-case probes, ranked
findings.
