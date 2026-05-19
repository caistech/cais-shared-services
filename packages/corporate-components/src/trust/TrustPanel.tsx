/**
 * <TrustPanel/> — the Portfolio Standard R15 trust-scaffolding surface.
 *
 * Required on every REGULATED-tier product's landing page and on every
 * screen that makes a regulatory claim. No claim without a backing
 * counterparty.
 *
 * Five kinds, each rendering an appropriate disclosure block:
 *
 *   - "regulated-financial"      → counterparties table (AFSL holder,
 *                                  trustee, custodian, valuer, auditor)
 *                                  with status badges. counterparties REQUIRED.
 *   - "consumer-health"          → certifications + policies
 *   - "children-data"            → certifications + policies REQUIRED
 *                                  (privacy + parents/safety + cookies)
 *   - "credential-infrastructure"→ certifications + counterparties optional
 *   - "generic"                  → policies only
 *
 * Status colors:
 *   green  — Contracted (the strongest disclosure)
 *   amber  — In negotiation / Open EOI (active, not yet finalised)
 *   red    — Not yet appointed (gap; visible by design — Elena's complaint
 *            was that claims existed without status)
 *
 * Honest display: if a counterparty isn't passed, it isn't rendered — never
 * defaulted to "Contracted". Status is always visible. No imaginary copy.
 *
 * Server-renderable — no `'use client'`, no React state.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R15 for context.
 * See cais-shared-services/naive-tester-reports/2026-05-19-1711/
 *     f2-k-fund-tokenisation.md — Elena's findings (AFSL holder / trustee /
 *     custodian missing) are the canonical use-case for this component.
 */

import React from 'react';

// --- Types --------------------------------------------------------------

export type TrustKind =
  | 'regulated-financial'
  | 'consumer-health'
  | 'children-data'
  | 'credential-infrastructure'
  | 'generic';

export type CounterpartyStatus =
  | 'Contracted'
  | 'In negotiation'
  | 'Open EOI'
  | 'Not yet appointed';

export interface Counterparty {
  /** Role label. Examples: "AFSL holder", "Trustee", "Custodian", "Auditor". */
  role: string;
  /**
   * Entity name. `undefined` when the counterparty is not yet contracted —
   * the panel still renders the row with the status so the gap is visible.
   */
  name?: string;
  /** Required status badge. */
  status: CounterpartyStatus;
  /**
   * Optional clarifying detail. Examples: "AFSL 123456", "Custodian ABN…",
   * "EOI closes 30 June 2026".
   */
  detail?: string;
  /**
   * Optional URL. When set, the entity name renders as a link
   * (counterparty's public profile, AFSL register entry, etc).
   */
  href?: string;
}

export interface Certification {
  /** Name of the certification. Examples: "ISO 27001:2022", "SOC 2 Type II". */
  name: string;
  /** Issuing body. Examples: "BSI", "AICPA". */
  issuer: string;
  /**
   * Optional validity date — ISO date string ("2027-03-31"). Renders as
   * "Valid until {date}" when present.
   */
  validUntil?: string;
  /** Optional URL to the certificate / public register entry. */
  href?: string;
}

export interface Policy {
  /** Display name. Examples: "Privacy Policy", "Terms of Service". */
  name: string;
  /** Required href — relative or absolute. */
  href: string;
}

// --- Per-kind required-prop discrimination ------------------------------

interface BaseTrustPanelProps {
  /** Optional override for the panel title (each `kind` has a sensible default). */
  title?: string;
  /** Optional Tailwind classes appended to the outer wrapper. */
  className?: string;
  /** Optional aria-label override for the wrapping landmark region. */
  ariaLabel?: string;
}

export interface RegulatedFinancialTrustPanelProps extends BaseTrustPanelProps {
  kind: 'regulated-financial';
  /** REQUIRED — the rule's entire reason for existing. */
  counterparties: Counterparty[];
  certifications?: Certification[];
  policies?: Policy[];
}

export interface ConsumerHealthTrustPanelProps extends BaseTrustPanelProps {
  kind: 'consumer-health';
  certifications?: Certification[];
  counterparties?: Counterparty[];
  policies?: Policy[];
}

export interface ChildrenDataTrustPanelProps extends BaseTrustPanelProps {
  kind: 'children-data';
  /**
   * REQUIRED — must include Privacy + Parents (or Safety) + Cookies links.
   * The component checks at render-time and surfaces a console warning if
   * any are missing, but does not throw — keeps the panel resilient in
   * production while keeping the gap visible at build / preview time.
   */
  policies: Policy[];
  certifications?: Certification[];
  counterparties?: Counterparty[];
}

export interface CredentialInfrastructureTrustPanelProps
  extends BaseTrustPanelProps {
  kind: 'credential-infrastructure';
  certifications?: Certification[];
  counterparties?: Counterparty[];
  policies?: Policy[];
}

export interface GenericTrustPanelProps extends BaseTrustPanelProps {
  kind: 'generic';
  policies?: Policy[];
  certifications?: Certification[];
  counterparties?: Counterparty[];
}

export type TrustPanelProps =
  | RegulatedFinancialTrustPanelProps
  | ConsumerHealthTrustPanelProps
  | ChildrenDataTrustPanelProps
  | CredentialInfrastructureTrustPanelProps
  | GenericTrustPanelProps;

// --- Constants ----------------------------------------------------------

const DEFAULT_TITLES: Record<TrustKind, string> = {
  'regulated-financial': 'Compliance counterparties',
  'consumer-health': 'Certifications & compliance',
  'children-data': "Children's data protection",
  'credential-infrastructure': 'Certifications & operators',
  generic: 'Trust & compliance',
};

const STATUS_TONE: Record<CounterpartyStatus, string> = {
  Contracted:
    'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30',
  'In negotiation':
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
  'Open EOI':
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
  'Not yet appointed':
    'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30',
};

// --- Component ----------------------------------------------------------

export function TrustPanel(props: TrustPanelProps) {
  const { kind, title, className = '', ariaLabel } = props;

  const counterparties = readCounterparties(props);
  const certifications = readCertifications(props);
  const policies = readPolicies(props);

  // Children-data sanity check — visible-warn rather than throw so a
  // production page never blanks. CI gate enforces at build time.
  if (kind === 'children-data') {
    validateChildrenDataPolicies(policies);
  }

  const resolvedTitle = title ?? DEFAULT_TITLES[kind];
  const region = ariaLabel ?? `Trust panel — ${resolvedTitle}`;

  const showCounterparties =
    counterparties.length > 0 ||
    kind === 'regulated-financial'; // always render the table header on financial, even if empty (it shouldn't be)

  const showCertifications = certifications.length > 0;
  const showPolicies = policies.length > 0;

  return (
    <section
      role="region"
      aria-label={region}
      data-cais-trust-panel={kind}
      className={`w-full rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 sm:p-6 ${className}`.trim()}
    >
      <header className="mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
          {resolvedTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {subtitleFor(kind)}
        </p>
      </header>

      {showCounterparties ? (
        <CounterpartiesBlock counterparties={counterparties} />
      ) : null}

      {showCertifications ? (
        <CertificationsBlock certifications={certifications} />
      ) : null}

      {showPolicies ? <PoliciesBlock policies={policies} /> : null}

      {!showCounterparties && !showCertifications && !showPolicies ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No trust details have been published yet for this product.
        </p>
      ) : null}
    </section>
  );
}

// --- Readers ------------------------------------------------------------

function readCounterparties(props: TrustPanelProps): Counterparty[] {
  return props.counterparties ?? [];
}

function readCertifications(props: TrustPanelProps): Certification[] {
  return props.certifications ?? [];
}

function readPolicies(props: TrustPanelProps): Policy[] {
  return props.policies ?? [];
}

function subtitleFor(kind: TrustKind): string {
  switch (kind) {
    case 'regulated-financial':
      return 'Named counterparties, with current contracting status. No claim without a backing role.';
    case 'consumer-health':
      return 'Active certifications and the bodies that issued them.';
    case 'children-data':
      return "Policies, parental-control links, and the standards we comply with.";
    case 'credential-infrastructure':
      return 'Certifications, issuing bodies, and the operators that run this infrastructure.';
    case 'generic':
      return 'Policies and disclosures.';
  }
}

// --- Sub-blocks ---------------------------------------------------------

function CounterpartiesBlock({
  counterparties,
}: {
  counterparties: Counterparty[];
}) {
  if (counterparties.length === 0) {
    return (
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Counterparties
        </h3>
        <p className="text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
          No counterparties have been published. For a regulated financial
          product this gap must be filled before the product is open to
          investors.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
        Counterparties
      </h3>

      {/* Mobile-first: stacked cards on small screens, table on md+. */}
      <ul className="space-y-2 md:hidden">
        {counterparties.map((cp, idx) => (
          <li
            key={`${cp.role}-${idx}`}
            className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white/60 dark:bg-slate-950/40 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {cp.role}
              </div>
              <StatusBadge status={cp.status} />
            </div>
            <div className="mt-1 text-sm text-slate-900 dark:text-white font-medium break-words">
              {cp.name ? renderName(cp) : <em className="text-slate-500 dark:text-slate-400 font-normal">Not named</em>}
            </div>
            {cp.detail ? (
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {cp.detail}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="font-semibold pb-2 pr-4">Role</th>
              <th className="font-semibold pb-2 pr-4">Entity</th>
              <th className="font-semibold pb-2 pr-4">Status</th>
              <th className="font-semibold pb-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {counterparties.map((cp, idx) => (
              <tr
                key={`${cp.role}-${idx}`}
                className="border-t border-slate-200 dark:border-slate-700/60"
              >
                <td className="py-2 pr-4 align-top text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">
                  {cp.role}
                </td>
                <td className="py-2 pr-4 align-top text-slate-900 dark:text-white">
                  {cp.name ? (
                    renderName(cp)
                  ) : (
                    <em className="text-slate-500 dark:text-slate-400 font-normal">
                      Not named
                    </em>
                  )}
                </td>
                <td className="py-2 pr-4 align-top">
                  <StatusBadge status={cp.status} />
                </td>
                <td className="py-2 align-top text-slate-500 dark:text-slate-400">
                  {cp.detail ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderName(cp: Counterparty) {
  if (cp.href) {
    return (
      <a
        href={cp.href}
        className="underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2 hover:decoration-current"
        target={cp.href.startsWith('http') ? '_blank' : undefined}
        rel={cp.href.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {cp.name}
      </a>
    );
  }
  return <>{cp.name}</>;
}

function StatusBadge({ status }: { status: CounterpartyStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${STATUS_TONE[status]}`}
      data-cais-status={status}
    >
      {status}
    </span>
  );
}

function CertificationsBlock({
  certifications,
}: {
  certifications: Certification[];
}) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
        Certifications
      </h3>
      <ul className="space-y-1.5">
        {certifications.map((cert, idx) => (
          <li
            key={`${cert.name}-${idx}`}
            className="text-sm text-slate-700 dark:text-slate-200 flex flex-wrap items-baseline gap-x-2"
          >
            <span className="font-medium text-slate-900 dark:text-white">
              {cert.href ? (
                <a
                  href={cert.href}
                  className="underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2 hover:decoration-current"
                  target={cert.href.startsWith('http') ? '_blank' : undefined}
                  rel={
                    cert.href.startsWith('http')
                      ? 'noopener noreferrer'
                      : undefined
                  }
                >
                  {cert.name}
                </a>
              ) : (
                cert.name
              )}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              issued by {cert.issuer}
            </span>
            {cert.validUntil ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                — valid until {cert.validUntil}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PoliciesBlock({ policies }: { policies: Policy[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
        Policies
      </h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {policies.map((policy, idx) => (
          <li key={`${policy.name}-${idx}`} className="text-sm">
            <a
              href={policy.href}
              className="text-slate-700 dark:text-slate-200 underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2 hover:decoration-current"
              target={policy.href.startsWith('http') ? '_blank' : undefined}
              rel={
                policy.href.startsWith('http')
                  ? 'noopener noreferrer'
                  : undefined
              }
            >
              {policy.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Validators ---------------------------------------------------------

function validateChildrenDataPolicies(policies: Policy[]): void {
  // Heuristic: presence of recognisable policy buckets. Build-time CI gate
  // enforces strictly; here we just warn so prod renders.
  const names = policies
    .map((p) => p.name.toLowerCase())
    .concat(policies.map((p) => p.href.toLowerCase()));

  const hasPrivacy = names.some((n) => n.includes('privacy'));
  const hasParents = names.some(
    (n) => n.includes('parent') || n.includes('safety') || n.includes('coppa')
  );
  const hasCookies = names.some((n) => n.includes('cookie'));

  if (
    typeof console !== 'undefined' &&
    (!hasPrivacy || !hasParents || !hasCookies)
  ) {
    const missing: string[] = [];
    if (!hasPrivacy) missing.push('Privacy');
    if (!hasParents) missing.push('Parents/Safety');
    if (!hasCookies) missing.push('Cookies');
    console.warn(
      `[<TrustPanel kind="children-data">] policies array is missing: ${missing.join(', ')}. Portfolio Standard R15 requires all three on children's-data products.`
    );
  }
}
