/**
 * @caistech/sayfix-client - SayFix integration for portfolio products
 * 
 * Provides:
 * - SayFixWidget: Floating button to report bugs
 * - useSayFix: Hook for programmatic ticket management
 * - API utilities for talking to SayFix backend
 * 
 * IMPORTANT: This connects to GBTA's SayFix instance (sayfix.vercel.app).
 * All tickets flow to GBTA for processing.
 */

import { Bug, ExternalLink, MessageSquare, Clock } from 'lucide-react';
import { useState, useCallback } from 'react';

/* ========================= WIDGET ========================= */

export interface SayFixWidgetProps {
  /** Product identifier (github_repo name) */
  product: string;
  /** Button label */
  label?: string;
  /** Show icon */
  showIcon?: boolean;
  /** Custom position */
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

/* ========================= INLINE WIDGET ========================= */

export interface SayFixInlineProps {
  /** Product identifier */
  product: string;
  /** API key for authenticated requests (optional) */
  apiKey?: string;
  /** Callback when ticket is created */
  onTicketCreated?: (ticketId: string) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

/**
 * Inline SayFix form - embeds the bug reporter directly in your app
 * Requires integration with SayFix API
 */
export function SayFixInline({ product, apiKey, onTicketCreated, onError }: SayFixInlineProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [ticketCreated, setTicketCreated] = useState(false);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || sending) return;
    
    const userMessage = input.trim();
    setInput('');
    setSending(true);
    setMessages(m => [...m, { role: 'user', content: userMessage }]);

    try {
      const res = await fetch('https://sayfix.vercel.app/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, { role: 'user', content: userMessage }].map(m => ({ role: m.role, content: m.content }))
        }),
      });
      
      const turn = await res.json();
      
      if (turn.kind === 'question' || turn.kind === 'spec') {
        setMessages(m => [...m, { role: 'assistant', content: turn.question || turn.confirmation }]);
      } else if (turn.kind === 'degraded') {
        setMessages(m => [...m, { role: 'assistant', content: turn.message }]);
        onError?.(turn.message);
      }
    } catch (err) {
      const msg = 'Failed to connect to SayFix';
      setMessages(m => [...m, { role: 'assistant', content: msg }]);
      onError?.(msg);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, onError]);

  if (ticketCreated) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <div className="text-green-600 mb-2">✓ Ticket created</div>
        <p className="text-sm text-green-700">
          We'll review your issue and get back to you shortly.
        </p>
        <button
          onClick={() => { setMessages([]); setTicketCreated(false); }}
          className="mt-4 text-sm text-green-700 underline"
        >
          Report another issue
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white max-w-lg">
      <div className="border-b border-stone-100 px-4 py-3 bg-stone-50">
        <h3 className="font-medium text-stone-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Report an Issue
        </h3>
      </div>
      
      <div className="p-4 max-h-80 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-stone-500 text-center py-4">
            Describe what's not working...
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`px-3 py-2 rounded-lg text-sm ${
              m.role === 'user' 
                ? 'bg-teal-700 text-white ml-8' 
                : 'bg-stone-100 text-stone-800 mr-8'
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="text-sm text-stone-400">Thinking...</div>
        )}
      </div>

      <div className="border-t border-stone-100 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Describe the issue..."
            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================= TICKET STATUS ========================= */

export interface TicketStatus {
  id: string;
  state: string;
  statusLabel: string;
  clarified_spec: {
    intent: string;
    observed_behaviour: string;
  } | null;
  preview_url: string | null;
  created_at: string;
}

/**
 * Fetch ticket status from SayFix
 */
export async function getTicketStatus(ticketId: string, apiKey?: string): Promise<TicketStatus | null> {
  const res = await fetch(`https://sayfix.vercel.app/api/tickets/${ticketId}`, {
    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
  });
  
  if (!res.ok) return null;
  return res.json();
}

/**
 * List user's tickets from SayFix
 */
export async function listTickets(apiKey?: string): Promise<TicketStatus[]> {
  const res = await fetch('https://sayfix.vercel.app/api/tickets', {
    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
  });
  
  if (!res.ok) return [];
  const data = await res.json();
  return data.tickets || [];
}

/* ========================= EMBEDDED NAV ========================= */

/**
 * Navigation component for SayFix integration
 */
export function SayFixNav({ ticketCount = 0 }: { ticketCount?: number }) {
  return (
    <nav className="flex items-center gap-4 text-sm">
      <a href="/new" className="flex items-center gap-2 text-stone-600 hover:text-stone-900">
        <MessageSquare className="w-4 h-4" />
        Report
      </a>
      <a href="/tickets" className="flex items-center gap-2 text-stone-600 hover:text-stone-900">
        <Clock className="w-4 h-4" />
        My Requests
        {ticketCount > 0 && (
          <span className="bg-teal-700 text-white text-xs px-1.5 py-0.5 rounded-full">
            {ticketCount}
          </span>
        )}
      </a>
    </nav>
  );
}
