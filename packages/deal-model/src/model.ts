import type {
  DealModelConstants,
  DealModelInputs,
  DealModelResult,
  Stage,
} from "./types.js";
import { assignStage, resolveStage } from "./stage-gate.js";

/** Default finance quotes (workbook C45:C47) — V7 flat 12% market rate. All editable. */
export const DEFAULT_EXTERNAL_QUOTES = [0.12, 0.12, 0.12];

/** V7 default constants (workbook "Constants - editable if needed"). All editable per-deal. */
export const DEFAULT_CONSTANTS: DealModelConstants = {
  internalDeduction: 0.02, // C49
  civilEngFeePct: 0.08, // C57
  civilContractorMarginPct: 0.12, // C62
  pmFeePct: 0.05, // C83
  agentCommissionPct: 0.035, // C91 (V7: 3.5% — Barry's rate; was 2% in V5)
  introducerPctOfLand: 0.01, // C81 / E136
  stageSplits: {
    Conception: 0.6,
    "Part-developed": 0.5,
    "De-risked": 0.4,
  }, // C104
  rejectBelow: 0.2, // C112
  cleanGoAt: 0.35, // C113
  developerFloorPctOfBase: 0.05, // C114
  trancheTerms: {
    land: { term: 2.5, avgOut: 1 }, // E66/F66
    infra: { term: 2, avgOut: 0.5 }, // E67/F67
    sunk: { term: 2.5, avgOut: 1 }, // E68/F68
    f2k: { term: 2, avgOut: 1 }, // E69/F69
  },
};

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function mergeConstants(
  overrides?: Partial<DealModelConstants>,
): DealModelConstants {
  if (!overrides) return DEFAULT_CONSTANTS;
  return {
    ...DEFAULT_CONSTANTS,
    ...overrides,
    // nested objects need explicit merge so a partial override doesn't wipe siblings
    stageSplits: { ...DEFAULT_CONSTANTS.stageSplits, ...overrides.stageSplits },
    trancheTerms: {
      ...DEFAULT_CONSTANTS.trancheTerms,
      ...overrides.trancheTerms,
    },
  };
}

/**
 * Compute the full Generic Estate Deal Model from an ingested feasibility study.
 *
 * Pure and stateless: same inputs → same outputs, no I/O. This is the single
 * source of truth. DealFindrs runs it and owns the resulting verdict; downstream
 * repos read the snapshot rather than recomputing.
 *
 * The computation mirrors the workbook top-to-bottom; each block cites its cells.
 */
export function computeDeal(inputs: DealModelInputs): DealModelResult {
  const k = mergeConstants(inputs.constants);
  const {
    lots,
    marketPricePerLot,
    fundingMode,
    homeCaptureRate,
    civilMode,
    externalQuotes = DEFAULT_EXTERNAL_QUOTES,
    landPerLot,
    developerSunkCostTotal,
    infraPerLot,
    softCostsPerLot,
    educationPerLot,
    f2kContributionTotal,
    modularMarginPerHome,
  } = inputs;

  // --- Stage (Section 1) ---
  const stageAssignedFromGate: Stage = assignStage(inputs.stageGate);
  const stageUsed: Stage = resolveStage(inputs.stageGate, inputs.stageOverride);

  // --- 3. Finance rate derivation ---
  const externalAverage = mean(externalQuotes); // C48
  const internalRate = externalAverage - k.internalDeduction; // C50
  const projectRate = fundingMode === "Internal" ? internalRate : externalAverage; // C51

  // Tranche principal amounts (totals). Column C of Section 5.
  const landTotal = landPerLot * lots; // D54
  const infraTotal = infraPerLot * lots; // D56
  const sunkTotal = developerSunkCostTotal; // D55 (already a total)
  const f2kTotal = f2kContributionTotal; // C61 (already a total)

  const t = k.trancheTerms;
  // --- 5. Finance cost by tranche = amount x rate x term x avg-out ---
  const landFin = landTotal * projectRate * t.land.term * t.land.avgOut; // G66
  const infraFin = infraTotal * projectRate * t.infra.term * t.infra.avgOut; // G67
  const sunkFin = sunkTotal * projectRate * t.sunk.term * t.sunk.avgOut; // G68
  const f2kFin = f2kTotal * projectRate * t.f2k.term * t.f2k.avgOut; // G69

  // Base finance includes infra finance ONLY in Contractor mode (Civil-JV finances
  // the works itself and is paid via the off-the-top uplift share). G70.
  const baseFinanceTotal =
    landFin + (civilMode === "Contractor" ? infraFin : 0) + sunkFin + f2kFin;
  const baseFinancePerLot = baseFinanceTotal / lots; // G71

  // --- 4/6. Base rate build-up (per lot) ---
  const civilEngFeePerLot = k.civilEngFeePct * infraPerLot; // C58/C77
  const developerSunkPerLot = developerSunkCostTotal / lots; // C79
  const introducerPerLot = k.introducerPctOfLand * landPerLot; // C81 (= 0.01*D54/C37)
  const f2kContributionPerLot = f2kContributionTotal / lots; // B61/B37

  const components = {
    land: landPerLot, // C74
    soft: softCostsPerLot, // C75
    infra: infraPerLot, // C76
    civilEngFee: civilEngFeePerLot, // C77
    education: educationPerLot, // C78
    developerSunkPerLot, // C79
    baseFinancePerLot, // C80
    introducerPerLot, // C81
    f2kContributionPerLot, // B61/B37 (V7)
  };
  // B82 (V7): SUM(B74:B81) + B61/B37 — the F2K contribution is recovered in the base
  // like every other party's, per the SPV/HoA reset ("every party's contribution
  // repaid in the base with interest"). V5 omitted this term; with a $0 F2K
  // contribution the two are identical, so V5 conformance is preserved.
  const subtotalPerLot =
    components.land +
    components.soft +
    components.infra +
    components.civilEngFee +
    components.education +
    components.developerSunkPerLot +
    components.baseFinancePerLot +
    components.introducerPerLot +
    components.f2kContributionPerLot;

  // PM is the only % of base: base = subtotal / (1 - PM%). C85.
  const baseRatePerLot = subtotalPerLot / (1 - k.pmFeePct);

  // --- 7. Market test & uplift (agent on SALE price) ---
  const grossUpliftPerLot = marketPricePerLot - baseRatePerLot; // C90
  const agentCommissionPerLot = k.agentCommissionPct * marketPricePerLot; // D91
  const netUpliftPerLot = grossUpliftPerLot - agentCommissionPerLot; // C92
  const netUpliftPctOfBase = netUpliftPerLot / baseRatePerLot; // C93

  // --- 8. Civil-JV uplift share (= civil finance cost at INTERNAL rate; off-the-top) ---
  const civilFinInternal =
    infraTotal * internalRate * t.infra.term * t.infra.avgOut; // C96
  const civilJvPerLotFull = civilFinInternal / lots; // C97
  const civilJvSharePerLot = civilMode === "Civil-JV" ? civilJvPerLotFull : 0; // C98

  // --- 9. Entry-stage uplift split (after agent & civil-JV off-the-top) ---
  const upliftToSplitPerLot = netUpliftPerLot - civilJvSharePerLot; // C101
  const upliftToSplitTotal = upliftToSplitPerLot * lots; // D102
  const defaultF2kShare = k.stageSplits[stageUsed]; // C104
  const f2kShare = inputs.f2kShareOverride ?? defaultF2kShare; // C106
  const developerShare = 1 - f2kShare; // C107
  const f2kUpliftTotal = upliftToSplitTotal * f2kShare; // C108
  const developerUpliftTotal = upliftToSplitTotal * developerShare; // C109

  // --- 10. Hurdle gate ---
  const developerPostSplitPctOfBase =
    developerUpliftTotal / lots / baseRatePerLot; // C115
  const hurdle = decideVerdict({
    netUpliftPctOfBase,
    developerPostSplitPctOfBase,
    civilMode,
    k,
  });

  // --- 11. F2K income ---
  const homesBuilt = lots * homeCaptureRate; // C121
  const pmFeeTotal = k.pmFeePct * baseRatePerLot * lots; // C122
  const financeCarryTotal = f2kFin; // C124 (= G69)
  const landOnlyReturn = pmFeeTotal + f2kUpliftTotal + f2kFin; // C125
  const modularMarginTotal = modularMarginPerHome * homesBuilt; // C126
  const landPlusHomesReturn = landOnlyReturn + modularMarginTotal; // C127

  // --- 12. Party outcomes (profit excludes return of own capital) ---
  const agentCommissionTotal = k.agentCommissionPct * marketPricePerLot * lots; // E135
  const introducerTotal = k.introducerPctOfLand * landTotal; // E136
  const civilCarry = civilMode === "Civil-JV" ? civilJvSharePerLot * lots : 0; // D134
  const civilMargin = infraTotal * k.civilContractorMarginPct; // E134
  // Developer carries the infra works finance in Contractor mode (mirrors workbook D131:
  // =G66+IF(C42="Contractor",G67,0)+G68). This reconciles the base finance to the developer.
  const developerFinanceCarry =
    landFin + (civilMode === "Contractor" ? infraFin : 0) + sunkFin;

  const partyOutcomes = [
    {
      party: "Developer",
      capitalBack: landTotal + sunkTotal, // C131
      // Infra works finance is carried by the developer/project in Contractor mode
      // (in Civil-JV the civil partner finances it and earns the off-the-top share).
      // Resolves the orphaned infra carry: the base charges it, so the developer earns it. D131.
      financeOrCarry: developerFinanceCarry, // D131
      feesOrMargin: 0,
      uplift: developerUpliftTotal, // F131
      total: developerFinanceCarry + developerUpliftTotal, // G131
    },
    {
      party: "Factory2Key (land-only)",
      capitalBack: f2kTotal, // C132
      financeOrCarry: f2kFin, // D132 (= G69)
      feesOrMargin: pmFeeTotal, // E132
      uplift: f2kUpliftTotal, // F132
      total: landOnlyReturn, // G132 (= C125)
    },
    {
      party: "Factory2Key (land + homes)",
      capitalBack: f2kTotal,
      financeOrCarry: f2kFin,
      feesOrMargin: pmFeeTotal + modularMarginTotal, // E133
      uplift: f2kUpliftTotal, // F133
      total: landPlusHomesReturn, // G133 (= C127)
    },
    {
      party: "Civil & Infra Works",
      capitalBack: infraTotal * (1 - k.civilContractorMarginPct), // C134
      financeOrCarry: civilCarry, // D134
      feesOrMargin: civilMargin, // E134
      uplift: 0,
      total: civilCarry + civilMargin, // G134
    },
    {
      party: "Agents",
      capitalBack: 0,
      financeOrCarry: 0,
      feesOrMargin: agentCommissionTotal, // E135
      uplift: 0,
      total: agentCommissionTotal, // G135
    },
    {
      party: "Introducer",
      capitalBack: 0,
      financeOrCarry: 0,
      feesOrMargin: introducerTotal, // E136
      uplift: 0,
      total: introducerTotal, // G136
    },
  ];

  return {
    stageAssignedFromGate,
    stageUsed,
    projectRate,
    finance: {
      externalAverage,
      internalRate,
      projectRate,
      tranches: { land: landFin, infra: infraFin, sunk: sunkFin, f2k: f2kFin },
      baseFinanceTotal,
      baseFinancePerLot,
    },
    baseRate: { components, subtotalPerLot, baseRatePerLot },
    market: {
      grossUpliftPerLot,
      agentCommissionPerLot,
      netUpliftPerLot,
      netUpliftPctOfBase,
    },
    split: {
      civilJvSharePerLot,
      upliftToSplitPerLot,
      upliftToSplitTotal,
      f2kShare,
      developerShare,
      f2kUpliftTotal,
      developerUpliftTotal,
    },
    hurdle,
    f2kIncome: {
      homesBuilt,
      pmFeeTotal,
      upliftShareTotal: f2kUpliftTotal,
      financeCarryTotal,
      landOnlyReturn,
      modularMarginTotal,
      landPlusHomesReturn,
    },
    partyOutcomes,
  };
}

/**
 * The verdict logic — workbook C116/C117. Order is significant and matches the sheet:
 *   1. net uplift below reject floor            -> REJECT
 *   2. developer post-split slice below floor   -> REJECT (dev thin)
 *   3. net uplift below clean-GO threshold       -> ADJUST
 *   4. otherwise                                 -> GO
 */
function decideVerdict(args: {
  netUpliftPctOfBase: number;
  developerPostSplitPctOfBase: number;
  civilMode: DealModelInputs["civilMode"];
  k: DealModelConstants;
}): DealModelResult["hurdle"] {
  const { netUpliftPctOfBase, developerPostSplitPctOfBase, civilMode, k } = args;

  if (netUpliftPctOfBase < k.rejectBelow) {
    return {
      verdict: "REJECT",
      developerThin: false,
      reason: "Uplift below floor - numbers do not work",
      developerPostSplitPctOfBase,
    };
  }
  if (developerPostSplitPctOfBase < k.developerFloorPctOfBase) {
    return {
      verdict: "REJECT",
      developerThin: true,
      reason:
        civilMode === "Civil-JV"
          ? "Civil-JV financing off-the-top leaves too little - use Contractor"
          : "Developer slice too thin to sign",
      developerPostSplitPctOfBase,
    };
  }
  if (netUpliftPctOfBase < k.cleanGoAt) {
    return {
      verdict: "ADJUST",
      developerThin: false,
      reason: "Proceeds but tighten",
      developerPostSplitPctOfBase,
    };
  }
  return {
    verdict: "GO",
    developerThin: false,
    reason: "Clears with room",
    developerPostSplitPctOfBase,
  };
}
