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
 *   → DYNAMIC placement: auto-avoids the host site's own chat widgets / cookie banners / CTAs and
 *     relocates at runtime as the page changes (see ./placement + ./SayFixWidget). Opt out with
 *     <SayFixWidget repo="…" autoPlace={false} /> for the legacy static corner.
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
import { MessageSquare, Clock, Settings, Wrench } from './icons';

/* ========================= WIDGET (client, dynamic placement) ========================= */

// The floating launcher is a client component (it inspects the live DOM to place itself). It is
// re-exported here so consumers keep importing `{ SayFixWidget }` from the package root; the
// "use client" boundary lives in ./SayFixWidget, so server components may render it unchanged.
export { SayFixWidget } from './SayFixWidget';
export type { SayFixWidgetProps } from './SayFixWidget';

// The placement engine is exported for advanced consumers (and a future vanilla-JS loader).
export {
  computePlacement,
  collectObstacles,
  collectContentConflicts,
  scorePosition,
  rectForPosition,
  intersectionArea,
  edgeGap,
  rectArea,
  DEFAULT_DESKTOP_CANDIDATES,
  DEFAULT_MOBILE_CANDIDATES,
} from './placement';
export type {
  Corner,
  Position,
  Rect,
  Viewport,
  Size,
  Obstacle,
  ObstacleKind,
  PlacementInput,
  PlacementScore,
  PlacementResult,
} from './placement';

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
