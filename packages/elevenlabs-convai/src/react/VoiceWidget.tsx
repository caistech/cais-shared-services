// elevenlabs-convai/react/VoiceWidget.tsx
// Drop-in voice agent surface. Config-driven via VoiceWidgetProps (placement, mode,
// overrides, fallback). Self-contained styles (no CSS framework dependency), responsive
// (full-screen sheet <=640px, >=44px touch targets), with an explanatory header.
//
// Identity note: the widget never sends an identity the agent relays to tools. Server-side
// resolveSession() owns identity. Use onConnect(conversationId) to POST the conversation id
// to your session-init route so the server can bind it to the verified user.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConversationProvider, useConversation, type HookOptions } from '@elevenlabs/react';
import type { VoiceWidgetProps, VoiceConnectionStatus } from '../types.js';
import {
  buildStartOptions,
  launcherLabel,
  panelHeader,
  placementClass,
  shouldUseTextFallback,
  statusLabel,
  WIDGET_CSS,
} from './widget-logic.js';

function useWidgetStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('style[data-convai]')) return;
    const el = document.createElement('style');
    el.setAttribute('data-convai', '');
    el.textContent = WIDGET_CSS;
    document.head.appendChild(el);
  }, []);
}

function VoiceWidgetInner(props: VoiceWidgetProps) {
  useWidgetStyles();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const startedRef = useRef(false);

  const convo = useConversation({
    onConnect: (p: { conversationId: string }) => props.onConnect?.(p.conversationId),
    onDisconnect: () => props.onDisconnect?.(),
    onError: (message: string) => props.onError?.(message),
    onMessage: (p: { source: 'user' | 'ai'; message: string }) => props.onMessage?.(p.source, p.message),
    onStatusChange: (p: { status: string }) => props.onStatusChange?.(p.status as VoiceConnectionStatus),
  });

  const status = convo.status as VoiceConnectionStatus;
  const fallback = shouldUseTextFallback(props, status);

  function connect() {
    if (fallback || startedRef.current || status === 'connected') return;
    startedRef.current = true;
    try {
      convo.startSession({ ...buildStartOptions(props), connectionType: 'webrtc' } as HookOptions);
    } catch (e) {
      startedRef.current = false;
      props.onError?.(String(e));
    }
  }

  function openAndConnect() {
    setOpen(true);
    connect();
  }

  function close() {
    setOpen(false);
    startedRef.current = false;
    try { convo.endSession(); } catch { /* nothing to end */ }
  }

  function submitText(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (value) {
      props.onTextFallbackSubmit?.(value);
      setText('');
    }
  }

  // Optional auto-connect on mount.
  useEffect(() => {
    if (props.autoConnect) openAndConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={placementClass(props.placement)}>
      {!open && (
        <button className="convai-btn" onClick={openAndConnect} aria-label={launcherLabel(props.mode)}>
          <span aria-hidden>🎙️</span>
          {launcherLabel(props.mode)}
        </button>
      )}

      {open && (
        <div
          className={`convai-panel${props.placement === 'fullpage' ? ' convai-panel--fullpage' : ''} ${props.className ?? ''}`}
          role="dialog"
          aria-label="Voice assistant"
        >
          <button className="convai-close" onClick={close} aria-label="Close voice assistant">×</button>
          <p className="convai-header">{panelHeader(props)}</p>

          {fallback ? (
            <form className="convai-fallback convai-row" onSubmit={submitText}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your question"
                aria-label="Type your question"
              />
              <button className="convai-btn" type="submit">Send</button>
            </form>
          ) : (
            <>
              <div className="convai-status" aria-live="polite">
                {statusLabel(status, convo.isSpeaking)}
              </div>
              <div className="convai-row">
                <button
                  className="convai-btn"
                  onClick={() => convo.setMuted(!convo.isMuted)}
                  aria-label={convo.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {convo.isMuted ? 'Unmute' : 'Mute'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The portfolio voice agent surface. Wrap-free for the consumer: it provides its own
 * ConversationProvider. Pass an `agentId` (from your provisioned agent) plus optional
 * placement/mode/overrides.
 */
export function VoiceWidget(props: VoiceWidgetProps) {
  return (
    <ConversationProvider>
      <VoiceWidgetInner {...props} />
    </ConversationProvider>
  );
}

export default VoiceWidget;
