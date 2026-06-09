/**
 * @caistech/sayfix-embed - SayFix integration for portfolio products
 *
 * IMPORTANT: This widget links to GBTA's SayFix instance.
 * All tickets flow to GBTA for processing, analytics, and fixes.
 * Never deploy SayFix on client infrastructure.
 *
 * Usage:
 *   <SayFixWidget repo="f2k-projects" />
 *   → Opens SayFix at sayfix.vercel.app/welcome?product=f2k-projects
 *   → User enters name/email → enters chat workflow scoped to that product
 *
 *   <SayFixNav ticketCount={3} />
 *   → Navigation links to Report + My Requests (requires auth)
 *
 * SELF-CONTAINED: zero runtime deps (react peer only), icons are inlined SVGs (lucide, MIT), and
 * ALL styling is inline `style={}` — NO Tailwind / CSS framework dependency. Tailwind doesn't scan
 * node_modules, so a className-styled widget renders UNSTYLED in a consumer; inline styles render
 * identically in every repo with zero per-repo config. (Learned on the f2k-projects rollout, 2026-06-09.)
 */

import type { CSSProperties } from 'react';

/* ========================= ICONS (inlined lucide, MIT) ========================= */

interface IconProps {
  size?: number;
}

function svgProps(size = 20) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function MessageSquare({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function Clock({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function Settings({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Wrench({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/* ========================= WIDGET ========================= */

export interface SayFixWidgetProps {
  /** Repo name (e.g. f2k-projects, mmcbuild) - owner is inferred from the product's GitHub account in SayFix */
  repo: string;
  label?: string;
  showIcon?: boolean;
  position?: 'bottom-right' | 'bottom-left';
}

/**
 * Floating "Report a problem" button. Opens SayFix in a new tab. Fully self-styled (inline) so it
 * renders identically in any repo regardless of CSS framework.
 */
export function SayFixWidget({
  repo,
  label = 'Report a problem — get it SayFixed',
  showIcon = true,
  position = 'bottom-right',
}: SayFixWidgetProps) {
  const sayfixUrl = `https://sayfix.vercel.app/welcome?product=${encodeURIComponent(repo)}`;

  const style: CSSProperties = {
    position: 'fixed',
    bottom: 24,
    ...(position === 'bottom-left' ? { left: 24 } : { right: 24 }),
    zIndex: 2147483000,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#1c1917',
    color: '#ffffff',
    padding: '12px 18px',
    borderRadius: 9999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
    fontWeight: 500,
    fontSize: 15,
    lineHeight: 1.2,
    fontFamily: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
  };

  return (
    <a
      href={sayfixUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
      title="Report a problem — opens SayFix in a new tab"
    >
      {showIcon && <MessageSquare size={18} />}
      {label}
    </a>
  );
}

/* ========================= NAV ========================= */

export interface SayFixNavProps {
  ticketCount?: number;
  showAdmin?: boolean;
}

const navLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  color: '#57534e',
  fontSize: 14,
  textDecoration: 'none',
};

/**
 * Navigation component for SayFix in product chrome
 */
export function SayFixNav({ ticketCount = 0, showAdmin = false }: SayFixNavProps) {
  return (
    <nav style={{ display: 'inline-flex', alignItems: 'center', gap: 16, fontFamily: 'inherit' }}>
      <a href="https://sayfix.vercel.app/new" target="_blank" rel="noopener noreferrer" style={navLink}>
        <MessageSquare size={16} />
        Report
      </a>
      <a href="https://sayfix.vercel.app/tickets" target="_blank" rel="noopener noreferrer" style={navLink}>
        <Clock size={16} />
        My Requests
        {ticketCount > 0 && (
          <span style={{ background: '#0f766e', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 9999 }}>
            {ticketCount}
          </span>
        )}
      </a>
      {showAdmin && (
        <a href="https://sayfix.vercel.app/admin" target="_blank" rel="noopener noreferrer" style={navLink}>
          <Settings size={16} />
          SayFix Admin
        </a>
      )}
    </nav>
  );
}

/* ========================= ADMIN LINK ========================= */

export interface SayFixAdminLinkProps {
  label?: string;
}

/**
 * Link to SayFix admin portal for managing projects + invites
 */
export function SayFixAdminLink({ label = 'SayFix Projects' }: SayFixAdminLinkProps) {
  return (
    <a
      href="https://sayfix.vercel.app/admin"
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...navLink, fontWeight: 500 }}
    >
      <Wrench size={16} />
      {label}
    </a>
  );
}

/* ========================= API UTILS ========================= */

export interface TicketStatus {
  id: string;
  state: string;
  statusLabel: string;
  clarified_spec: { intent: string; observed_behaviour: string } | null;
  preview_url: string | null;
  created_at: string;
}

/**
 * Fetch user's tickets from SayFix
 */
export async function listSayFixTickets(): Promise<TicketStatus[]> {
  const res = await fetch('https://sayfix.vercel.app/api/tickets');
  if (!res.ok) return [];
  const data = await res.json();
  return data.tickets || [];
}

/**
 * Fetch a single ticket by ID
 */
export async function getSayFixTicket(id: string): Promise<TicketStatus | null> {
  const res = await fetch(`https://sayfix.vercel.app/api/tickets/${id}`);
  if (!res.ok) return null;
  return res.json();
}

/* ========================= INVESTIGATION ========================= */

export interface InvestigationResult {
  issue: string;
  repo: string;
  codeResults: { file: string; snippet: string; type: string; score: number }[];
  kbResults: { error_pattern: string; solution: string; product?: string }[];
  analysis: {
    summary: string;
    shouldFix: boolean;
    canAnswer: boolean;
    answer?: string;
    fixType?: string;
  };
  fixResult?: { status: string; message: string };
}

/**
 * Trigger investigation on a ticket - searches codebase + bug KB
 *
 * Requires GITHUB_TOKEN to be configured in SayFix Vercel
 */
export async function investigateTicket(ticketId: string): Promise<InvestigationResult | null> {
  const res = await fetch(`https://sayfix.vercel.app/api/tickets/${ticketId}/investigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'investigate' }),
  });

  if (!res.ok) return null;
  return res.json();
}

/**
 * Trigger a fix for a ticket - initiates coding assistant
 */
export async function fixTicket(ticketId: string): Promise<InvestigationResult | null> {
  const res = await fetch(`https://sayfix.vercel.app/api/tickets/${ticketId}/investigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'fix' }),
  });

  if (!res.ok) return null;
  return res.json();
}
