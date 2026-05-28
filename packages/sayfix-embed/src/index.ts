/**
 * SayFix Embed - Shared service layer for reporting issues
 * 
 * Usage in any product:
 *   import { SayFixWidget } from '@caistech/sayfix-embed';
 *   
 *   <SayFixWidget 
 *     product="f2k-projects"
 *     userEmail={user.email}
 *   />
 */

import { useState, useEffect } from 'react';

interface SayFixConfig {
  product: string;
  userEmail?: string;
  userName?: string;
  apiUrl?: string;
}

interface TicketStatus {
  id: string;
  status: string;
  description: string;
  created_at: string;
}

export function SayFixWidget({ 
  product, 
  userEmail, 
  userName,
  apiUrl = process.env.NEXT_PUBLIC_SAYFIX_URL || 'https://sayfix.vercel.app'
}: SayFixConfig) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-stone-900 text-white px-4 py-3 rounded-full shadow-lg hover:bg-stone-800 transition-all flex items-center gap-2 font-medium z-50"
      >
        <span className="text-xl">🐛</span>
        Report Issue
      </button>

      {/* Modal */}
      {isOpen && (
        <SayFixModal 
          product={product}
          userEmail={userEmail}
          userName={userName}
          apiUrl={apiUrl}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function SayFixModal({ 
  product, 
  userEmail, 
  userName,
  apiUrl,
  onClose 
}: SayFixConfig & { onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_input: { description, product },
          clarified_spec: { product, description },
          request_nature: 'change'
        })
      });

      if (!res.ok) throw new Error('Failed to submit');

      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-xl font-semibold text-stone-900 mb-2">Issue Submitted!</h3>
          <p className="text-stone-600 mb-4">
            We'll look into this for {product}. You'll hear back soon.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-stone-900 text-white rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-stone-900">
            Report Issue - {product}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">
            What's not working?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what's broken or what you'd like changed..."
            className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent resize-none"
            rows={5}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-stone-300 text-stone-700 rounded-lg font-medium hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || sending}
            className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Submit Issue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SayFixWidget;
