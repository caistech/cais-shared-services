# @caistech/deal-model

The canonical **Generic Estate Deal Model (F2K), V7** — a pure, stateless TypeScript
engine that turns an ingested feasibility study into a finance-inclusive **base price**,
an entry-stage **uplift split**, and a **GO / ADJUST / REJECT** verdict.

This is the **single source of truth** for the deal maths. DealFindrs computes with it and
owns the resulting verdict; F2K-Checkpoint and F2K-Projects read the locked snapshot rather
than recomputing. It replaces the `Seafields_Estate_Deal_Model_V7.xlsx` spreadsheet; every
formula is mirrored 1:1 with the workbook cell references in code comments.

### V7 changes (over V5)
- **Every party's contribution is recovered in the base.** The base subtotal now adds the
  F2K contribution per lot (`B82 = SUM(B74:B81) + B61/B37`), per the SPV/HoA reset
  ("every party's contribution repaid in the base with interest"). Backward-compatible: a
  `$0` F2K contribution reproduces the V5 base exactly.
- **Defaults moved (all still editable per-deal via `constants` / `externalQuotes`):**
  agent commission `2% → 3.5%`; finance quotes default to `[0.12, 0.12, 0.12]` (flat 12%
  market rate) when omitted. Internal-rate deduction default stays `2%`.

## Install
```bash
npm install @caistech/deal-model
```

## Use
```ts
import { computeDeal, emptyStageGate } from "@caistech/deal-model";

const result = computeDeal({
  lots: 100,
  marketPricePerLot: 170_000,
  fundingMode: "Internal",      // "Internal" | "External"
  homeCaptureRate: 1,           // 0..1
  civilMode: "Contractor",      // "Contractor" | "Civil-JV"
  externalQuotes: [0.08, 0.09, 0.12],
  landPerLot: 20_000,
  developerSunkCostTotal: 300_000,  // a TOTAL, not per-lot
  infraPerLot: 80_000,
  softCostsPerLot: 6_000,
  educationPerLot: 4_000,
  f2kContributionTotal: 0,          // a TOTAL
  modularMarginPerHome: 30_000,
  stageGate: emptyStageGate(),      // 21 evidence ticks -> auto stage
  // stageOverride, f2kShareOverride, constants: all optional
});

result.hurdle.verdict;                 // "ADJUST"
result.baseRate.baseRatePerLot;        // 136991.23
result.market.netUpliftPctOfBase;      // 0.2161
result.partyOutcomes;                  // full waterfall
```

## Units contract (read before wiring inputs)
The workbook mixes per-lot and whole-of-project figures; the types encode which is which:
- `*PerLot` — entered per lot (workbook column C).
- `*Total` — entered as a project total (`developerSunkCostTotal`, `f2kContributionTotal`).
- everything else is a rate (0..1) or a count.

## What it computes (workbook sections)
1. **Stage gate** (§1) — 21 evidence ticks → Conception / Part-developed / De-risked (only 7
   ticks are load-bearing; all 21 are kept for audit). Manual override supported.
2. **Finance derivation** (§3) — external average of quotes; internal = average − deduction;
   project rate by funding mode.
3. **Per-tranche finance** (§5) — amount × rate × term × avg-outstanding, per tranche.
4. **Finance-inclusive base rate** (§4/§6) — 8-component subtotal; base = subtotal ÷ (1 − PM%).
5. **Market test** (§7) — gross/net uplift; agent commission on sale price.
6. **Civil mode** (§6/§8) — Contractor (infra finance in base) vs Civil-JV (off-the-top share).
7. **Entry-stage split** (§9) — 60/50/40 F2K share by stage; overridable.
8. **Hurdle** (§10) — GO/ADJUST/REJECT (+ "developer thin" reject).
9. **F2K income** (§11) — land-only vs land+homes.
10. **Party outcomes** (§12) — the full distribution waterfall.

## Conformance
`npm test` runs the golden test that reproduces the V5 workbook sample to the cent. Any drift
in the engine breaks it. The workbook's cached values are the source of truth.

## Policy knobs
Thresholds, stage splits, PM/agent/introducer %, and tranche terms live in `DEFAULT_CONSTANTS`
and are overridable per call via `inputs.constants`. These are the business-signed-off values
(the architecture doc's policy table) — not hardcoded magic numbers.
