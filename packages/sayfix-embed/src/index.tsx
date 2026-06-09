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
 * Zero runtime dependencies (react is a peer) — the icons are inlined SVGs (lucide paths, MIT)
 * so the widget drops into any repo without a lucide-react version to reconcile.
 */

/* ========================= ICONS (inlined lucide, MIT) ========================= */

interface IconProps {
  className?: string;
}

function svgProps(className?: string) {
  return {
    className,
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function MessageSquare({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function Clock({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function Settings({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Wrench({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
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
 * Floating "Report Issue" button widget
 * Opens SayFix in a new tab
 *
 * Note: Just pass the repo name - SayFix knows which GitHub account it belongs to
 */
export function SayFixWidget({
  repo,
  label = 'Report a problem — get it SayFixed',
  showIcon = true,
  position = 'bottom-right',
}: SayFixWidgetProps) {
  const sayfixUrl = `https://sayfix.vercel.app/welcome?product=${encodeURIComponent(repo)}`;

  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
  };

  // Reads clearly as THE support mechanism (so a visitor knows it's where you report a problem),
  // and the friendly framing sets up the surprise that it's a real coach + fast fix, not a ticket
  // black hole. Override `label` per product if needed.
  return (
    <a
      href={sayfixUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed ${positionClasses[position]} bg-stone-900 text-white px-4 py-3 rounded-full shadow-lg hover:bg-stone-800 transition-all flex items-center gap-2 font-medium z-50`}
      title="Report a problem — opens SayFix in a new tab"
    >
      {showIcon && <MessageSquare className="w-5 h-5" />}
      {label}
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
