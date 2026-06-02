// check-result.ts — the data contract every validation/compliance check emits.
//
// Replaces the old prose-string finding. A runner returns this so the Fix-button cell can:
//   (1) explain the failure in plain language (the content contract),
//   (2) route a fix by class (A=codemod, B=design-build, C=human),
//   (3) show choices with consequences, technical detail behind an expander.
//
// Place at: product-factory/pipeline-cockpit/src/lib/checks/check-result.ts
// (or wherever the check runners can import it from — keep it dependency-free so both the
//  server runners and the client cell can share the types.)

/** A = deterministic config codemod · B = generative feature (design-build) · C = human judgment */
export type FixClass = 'A' | 'B' | 'C';

export type CheckStatus = 'pass' | 'warn' | 'fail';

/** How a chosen option acts. The card never sends the user off-page; each maps to a server action. */
export type FixRoute = 'codemod' | 'design-build' | 'human-ack';

export interface FixOption {
  /** stable id: 'apply' | 'skip' | 'rebuild-feature' | 'override' | … */
  id: string;
  /** plain-language button label, e.g. "Apply the fix" */
  label: string;
  /** plain-language consequence shown as helptext, e.g. "passes the check; standard and safe" */
  consequence: string;
  recommended?: boolean;
  route: FixRoute;
  /** codemod id, or the single-finding brief for design-build, or ack metadata for human */
  payload?: unknown;
}

export interface FixDescriptor {
  fixClass: FixClass;
  /** plain-language proposed fix, e.g. "add the standard security settings to your config" */
  proposed: string;
  /** the choices rendered as buttons */
  options: FixOption[];
  /** TECHNICAL layer — behind an expander, never primary text */
  technical?: {
    summary: string;
    /** e.g. the diff or the concrete missing items */
    diffPreview?: string;
    files?: string[];
  };
}

export interface PlainLanguage {
  /** "how your site protects visitors from common web attacks" */
  whatWeChecked: string;
  /** "it's missing two standard safety settings…" */
  whatWeFound: string;
  /** "some partners check for these; no visible change to your site" */
  implication: string;
}

export interface CheckResult {
  /** 'security-headers' | 'metadata' | 'gtm-distribution-loop' | … */
  checkId: string;
  /** human-facing cell title, e.g. "Security Headers" */
  title: string;
  status: CheckStatus;
  plain: PlainLanguage;
  /** present whenever status is 'warn' | 'fail' (i.e. there's something to fix) */
  fix?: FixDescriptor;
  /** how many products have hit this check — feeds the promote-upstream suggestion */
  recurrence?: number;
  /** machine detail for logs/ledger; never rendered as primary text */
  raw?: unknown;
}

/** Convenience for runners: a passing result needs no fix descriptor. */
export function pass(checkId: string, title: string, plain: PlainLanguage, raw?: unknown): CheckResult {
  return { checkId, title, status: 'pass', plain, raw };
}
