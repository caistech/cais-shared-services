/**
 * @caistech/sayfix-embed - SayFix integration for portfolio products
 * 
 * IMPORTANT: This widget links to GBTA's SayFix instance.
 * All tickets flow to GBTA for processing, analytics, and fixes.
 * Never deploy SayFix on client infrastructure.
 * 
 * Usage:
 *   <SayFixWidget product="f2k-projects" />
 *   → Opens GBTA's SayFix at sayfix.vercel.app/new?product=xxx
 * 
 *   <SayFixNav ticketCount={3} />
 *   → Navigation links to Report + My Requests
 */

import { Bug, ExternalLink, MessageSquare, Clock, Settings, Wrench } from 'lucide-react';

/* ========================= WIDGET ========================= */

export interface SayFixWidgetProps {
  /** Repo name (e.g. f2k-projects, mmcbuild) - owner is inferred from the product's GitHub account in SayFix */
  repo: string;
  label?: string;
  showIcon?: boolean;
  position?: 'bottom-right' | 'bottom-left';
}

/**
 * Floating "Report Issue" button widget
 * Opens SayFix in a new tab
 * 
 * Note: Just pass the repo name - SayFix knows which GitHub account it belongs to
 */
export function SayFixWidget({ 
  repo, 
  label = 'Report Issue', 
  showIcon = true,
  position = 'bottom-right'
}: SayFixWidgetProps) {
  const sayfixUrl = `https://sayfix.vercel.app/new?product=${encodeURIComponent(repo)}`;
  
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
  };

  return (
    <a
      href={sayfixUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed ${positionClasses[position]} bg-stone-900 text-white px-4 py-3 rounded-full shadow-lg hover:bg-stone-800 transition-all flex items-center gap-2 font-medium z-50`}
      title="Report an issue - opens in new tab"
    >
      {showIcon && <Bug className="w-5 h-5" />}
      {label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}

/* ========================= NAV ========================= */

export interface SayFixNavProps {
  ticketCount?: number;
  showAdmin?: boolean;
}

/**
 * Navigation component for SayFix in product chrome
 */
export function SayFixNav({ ticketCount = 0, showAdmin = false }: SayFixNavProps) {
  return (
    <nav className="flex items-center gap-4 text-sm">
      <a href="https://sayfix.vercel.app/new" target="_blank" rel="noopener noreferrer" 
         className="flex items-center gap-2 text-stone-600 hover:text-stone-900">
        <MessageSquare className="w-4 h-4" />
        Report
      </a>
      <a href="https://sayfix.vercel.app/tickets" target="_blank" rel="noopener noreferrer"
         className="flex items-center gap-2 text-stone-600 hover:text-stone-900">
        <Clock className="w-4 h-4" />
        My Requests
        {ticketCount > 0 && (
          <span className="bg-teal-700 text-white text-xs px-1.5 py-0.5 rounded-full">
            {ticketCount}
          </span>
        )}
      </a>
      {showAdmin && (
        <a href="https://sayfix.vercel.app/admin" target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-2 text-stone-600 hover:text-stone-900">
          <Settings className="w-4 h-4" />
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
      className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
    >
      <Wrench className="w-4 h-4" />
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
 * This connects to SayFix backend to:
 * 1. Search the product's GitHub repo for relevant code
 * 2. Search bug-knowledge.json for similar past issues
 * 3. Either answer the question or trigger a fix
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
