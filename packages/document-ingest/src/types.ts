import type { StageGateTicks } from '@caistech/deal-model'

/** Document types the ingester recognises. Each evidences a different set of stage gates. */
export type DocumentKind =
  | 'wapc_subdivision_approval'
  | 'subdivision_plan'
  | 'title'
  | 'geotech'
  | 'qs_cost_plan'
  | 'valuation'
  | 'other'

/** A condition of approval, structured from a WAPC/LG decision letter. */
export interface ApprovalCondition {
  number: number | null
  text: string
  /** The clearing authority named at the end of the condition (e.g. "City of Greater Geraldton"). */
  authority: string | null
  /** Our classification for wiring into the buildup (viability) and the task pipeline (workflow). */
  category:
    | 'servicing' // power/water/sewer to each lot
    | 'civil' // roads, earthworks, drainage, shared paths
    | 'constraint' // geotech, water management, contamination/UXO
    | 'tenure' // easements, reserves, POS vesting
    | 'statutory' // contributions/levies (education, POS cash-in-lieu)
    | 'admin' // plan modification, demolition, general
}

/** An encumbrance/feature read off a registered subdivision plan (easement or reserve). */
export interface PlanFeature {
  /** e.g. "Public Open Space", "Road Reserve", "Drainage easement", "Right of carriageway". */
  purpose: string
  detail: string | null
}

/** A lot-size band from the plan's lot schedule — the valuer's GRV mix. */
export interface LotSizeBand {
  /** e.g. "600-699" (m²). */
  band: string
  count: number
}

/** Structured fields pulled from a subdivision approval / plan. */
export interface ExtractedApproval {
  wapcRef: string | null
  approvalDate: string | null
  validUntil: string | null
  lga: string | null
  /** Parent parcels as written (e.g. "Lots 81, 82, 9001 & 9005 Pepper Gate Waggrakine"). */
  parentParcels: string | null
  /** Plan / diagram references (e.g. "Plan 5709, Plan 60113, Plan 403491"). */
  planReferences: string | null
  /** C/T volume/folio references. */
  titleReferences: string | null
  residentialLots: number | null
  minLotSizeSqm: number | null
  avgLotSizeSqm: number | null
  maxLotSizeSqm: number | null
  netDevelopableHa: number | null
  parentAreaHa: number | null
  posSqm: number | null
  /** Easements shown/noted on the registered plan (tenure). */
  easements?: PlanFeature[]
  /** Reserves/vestings — POS, road reserve, drainage/access (tenure + servicing). */
  reserves?: PlanFeature[]
  /** Lot-size distribution from the plan's lot schedule (the valuer's GRV mix). */
  lotSizeBands?: LotSizeBand[]
  conditions: ApprovalCondition[]
}

/** The finer lifecycle ladder — the evidence-derived "current status" the operator sees. */
export type LifecycleStatus =
  | 'greenfield'
  | 'concept'
  | 'structure_plan'
  | 'subdivision_lodged'
  | 'conditional_approval'
  | 'subdivision_approved'
  | 'conditions_clearing'
  | 'titled'

/** Result of ingesting one document. */
export interface IngestResult {
  kind: DocumentKind
  extracted: ExtractedApproval
  stageGate: StageGateTicks
  dealModelStage: string
  lifecycleStatus: LifecycleStatus
  lifecycleLabel: string
  /** Outstanding gates below the current rung — what still de-risks the deal. */
  outstanding: string[]
  referralCleared: boolean
}
