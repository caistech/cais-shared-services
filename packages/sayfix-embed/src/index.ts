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
  product: string;
  label?: string;
  showIcon?: boolean;
  position?: 'bottom-right' | 'bottom-left';
}

/**
 * Floating "Report Issue" button widget
 * Opens SayFix in a new tab
 */
export function SayFixWidget({ 
  product, 
  label = 'Report Issue', 
  showIcon = true,
  position = 'bottom-right'
}: SayFixWidgetProps) {
  const sayfixUrl = `https://sayfix.vercel.app/new?product=${encodeURIComponent(product)}`;
  
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
