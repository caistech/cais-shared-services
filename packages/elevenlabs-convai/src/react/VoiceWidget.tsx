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
  shouldShowConnecting,
  DEFAULT_FALLBACK_AFTER_MS,
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
  // Embedded placements (inline/fullpage) live in the page flow — avatar on top, optional
  // scrolling transcript, Begin button — never the floating bottom-right launcher. They open
  // on mount and have no launcher/close chrome (the page owns that).
  const embedded = props.placement === 'inline' || props.placement === 'fullpage';
  const [open, setOpen] = useState(embedded);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<{ source: 'user' | 'ai'; text: string }[]>([]);
  const startedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const convo = useConversation({
    onConnect: (p: { conversationId: string }) => props.onConnect?.(p.conversationId),
    onDisconnect: () => props.onDisconnect?.(),
    onError: (message: string) => props.onError?.(message),
    onMessage: (p: { source: 'user' | 'ai'; message: string }) => {
      setMessages((m) => [...m, { source: p.source, text: p.message }]);
      props.onMessage?.(p.source, p.message);
    },
    onStatusChange: (p: { status: string }) => props.onStatusChange?.(p.status as VoiceConnectionStatus),
  });

  const status = convo.status as VoiceConnectionStatus;
  const connected = status === 'connected';

  // STALL TIMER — the reason a mic-less visitor is ever offered the text box.
  //
  // The fallback used to require `status === 'error'`, so a connection that neither succeeded nor
  // failed left the panel dead forever. See DEFAULT_FALLBACK_AFTER_MS for those measurements.
  //
  // ⚠️ IT KEYS OFF "SOMEONE ASKED TO TALK", NOT "THE PANEL IS OPEN", and the difference is the whole
  // defect this replaces. `open` is TRUE FROM MOUNT for the embedded placements (line ~31:
  // `useState(embedded)`), so keying on it started the clock at page load. Measured on a live
  // landing page, with nothing clicked at all:
  //
  //     +8s   "Talk to the assistant"
  //     +11s  a text box
  //
  // The product turned itself into a chatbot while the visitor was still reading — and the visitor
  // this page is written for reads the whole page before touching anything, so he was never offered
  // voice at all. A timer meant to rescue a hung connection was instead pre-empting one that had
  // never been attempted.
  //
  // `attempted` is state rather than the existing `startedRef`, because a ref does not re-render and
  // the fallback has to appear when it flips. Cancelled the moment voice connects; reset when the
  // panel closes so a reopen gets a fresh attempt rather than an instant fallback.
  const [attempted, setAttempted] = useState(false);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (connected || !open) {
      setStalled(false);
      if (!open) setAttempted(false);
      return;
    }
    if (!attempted) return; // nobody has asked to talk yet — there is nothing to rescue
    const after = props.fallbackAfterMs ?? DEFAULT_FALLBACK_AFTER_MS;
    const timer = setTimeout(() => setStalled(true), after);
    return () => clearTimeout(timer);
  }, [open, connected, attempted, props.fallbackAfterMs]);

  const fallback = shouldUseTextFallback(props, status, { stalled });

  // THE EIGHT SECONDS NOBODY WAS TOLD ABOUT.
  //
  // The stall timeout above is deliberate and correct — firing early REPLACES the voice UI, which
  // would steal a slow-but-working connection from someone who does have a microphone. But nothing
  // occupied those seconds. In the embedded branch the status line is suppressed whenever
  // `transcript` is set (`!props.transcript &&` below), and the transcript itself only renders once
  // `connected` — so a consumer passing `transcript`, which is the portfolio's standard landing
  // shape, showed the visitor an empty panel with Mute and End on it and no indication that
  // anything was happening. Measured on a live landing page: text appeared at t=8s, and `.convai-
  // status` was empty for every second before it.
  //
  // Eight seconds of nothing is indistinguishable from broken, and the visitor it fails is the
  // low-commitment one the fallback exists to serve — the person who leaves rather than reports.
  // So: say what is happening, and show that the wait is BOUNDED. The bar is honest — it is tied to
  // the same timer that produces the fallback, so it finishes exactly when the offer to type
  // appears, rather than being decorative motion that implies progress it cannot know about.
  const waitMs = props.fallbackAfterMs ?? DEFAULT_FALLBACK_AFTER_MS;
  const connecting = shouldShowConnecting({ attempted, connected, fallback });

  // Hand the consumer imperative controls into the live conversation, once, on connect. Lets it
  // push a user turn or a contextual nudge (e.g. a timed wrap-up) the user didn't type.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (connected && !readyFiredRef.current) {
      readyFiredRef.current = true;
      props.onReady?.({
        sendUserMessage: (t: string) => { try { convo.sendUserMessage?.(t); } catch { /* not connected */ } },
        sendContextualUpdate: (t: string) => { try { convo.sendContextualUpdate?.(t); } catch { /* not connected */ } },
      });
    }
    if (!connected) readyFiredRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Keep the embedded transcript pinned to the newest message.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function connect() {
    if (fallback || startedRef.current || status === 'connected') return;
    startedRef.current = true;
    // The moment that starts the stall clock: someone has asked to talk, so a connection that
    // neither succeeds nor fails is now worth rescuing with a text box.
    setAttempted(true);
    try {
      const opts = buildStartOptions(props);
      // Private, owner-gated agents connect via a signed URL (authorized server-side) rather than a
      // public agentId. `getSignedUrl` is resolved fresh at connect time so an expiring URL can't go
      // stale before the tap. When a signed URL is used, agentId is omitted (the URL identifies the agent).
      if (props.signedUrl || props.getSignedUrl) {
        const signedUrl = props.signedUrl ?? (await props.getSignedUrl!());
        delete opts.agentId;
        // Signed-URL sessions connect over WebSocket (the URL is the ws endpoint); the public
        // agentId path uses WebRTC. Mixing them is a type error in the SDK's HookOptions.
        convo.startSession({ ...opts, signedUrl, connectionType: 'websocket' } as HookOptions);
      } else {
        convo.startSession({ ...opts, connectionType: 'webrtc' } as HookOptions);
      }
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
    if (!value) return;
    if (connected) {
      // Live session: inject as a user turn the agent actually sees (voice + text, one conversation).
      try { convo.sendUserMessage?.(value); } catch { /* not connected */ }
    } else {
      // No live voice — hand off to the consumer to route (true no-agent fallback).
      props.onTextFallbackSubmit?.(value);
    }
    setText('');
  }

  // Proactive behaviour on mount. autoConnect = open + connect (requests mic on load).
  // autoOpen = open the panel showing the greeting, but connect only on the user's tap (no mic
  // until then) — the gentler "greets-then-connects" greeter for a public page.
  useEffect(() => {
    if (props.autoConnect) openAndConnect();
    else if (props.autoOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Panel is open but the user hasn't started a session yet (the autoOpen greeter state).
  const preConnect = !connected && status !== 'connecting' && !startedRef.current;

  // Embedded coach: avatar on top → optional scrolling transcript → Begin button, in the page
  // flow. The portfolio's standard intake/landing voice shape (not a corner launcher).
  if (embedded) {
    return (
      <div className="convai-launch convai-launch--inline">
        <div
          className={`convai-panel convai-panel--embedded ${props.className ?? ''}`}
          role="region"
          aria-label={props.coachName ? `${props.coachName}, voice coach` : 'Voice coach'}
        >
          {props.avatarUrl && (
            <div className="convai-coach convai-coach--lg">
              <img
                className={`convai-avatar${connected ? ' convai-avatar--live' : ''}`}
                src={props.avatarUrl}
                alt={props.coachName ? `${props.coachName}, your coach` : 'Voice coach'}
              />
              <span className="convai-coach-name">
                {props.coachName ?? 'Coach'}{connected ? ' — listening' : ''}
              </span>
            </div>
          )}
          <p className="convai-header">{panelHeader(props)}</p>

          {props.transcript && (connected || messages.length > 0) && (
            <div className="convai-transcript" ref={transcriptRef} aria-live="polite">
              {messages.length === 0 ? (
                <p className="convai-transcript-empty">{statusLabel(status, convo.isSpeaking)}</p>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`convai-msg convai-msg--${m.source}`}>{m.text}</div>
                ))
              )}
            </div>
          )}

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
          ) : preConnect ? (
            <button className="convai-btn" onClick={connect} aria-label={launcherLabel(props.mode)}>
              {/* An inline SVG, not 🎙️.
                  The emoji rendered as the only emoji on an otherwise deliberately sober page — a
                  tester walking a product aimed at owners in their sixties noticed exactly that,
                  and it reads as a stray rather than a choice. It also renders differently on every
                  platform (Apple, Windows and Android each draw a different microphone at a
                  different weight), so a product cannot control how its primary call-to-action
                  looks. `aria-hidden` because the button already carries an aria-label. */}
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              {launcherLabel(props.mode)}
            </button>
          ) : (
            <>
              {connecting && (
                <div className="convai-connecting" aria-live="polite">
                  <span>{statusLabel(status, convo.isSpeaking)}</span>
                  <span className="convai-progress" aria-hidden>
                    <i style={{ animationDuration: `${waitMs}ms` }} />
                  </span>
                </div>
              )}
              {!props.transcript && !connecting && (
                <div className="convai-status" aria-live="polite">
                  {statusLabel(status, convo.isSpeaking)}
                </div>
              )}
              <div className="convai-row">
                <button
                  className="convai-btn"
                  onClick={() => convo.setMuted(!convo.isMuted)}
                  aria-label={convo.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {convo.isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button className="convai-btn" onClick={close} aria-label="End the conversation">
                  End
                </button>
              </div>
              {props.textInput && (
                <form className="convai-fallback convai-row" onSubmit={submitText} style={{ marginTop: 8 }}>
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type or paste to the assistant"
                    aria-label="Type or paste to the assistant"
                  />
                  <button className="convai-btn" type="submit">Send</button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={placementClass(props.placement)}>
      {!open && (
        <button className="convai-btn" onClick={openAndConnect} aria-label={launcherLabel(props.mode)}>
          {props.avatarUrl
            ? <img className="convai-launch-avatar" src={props.avatarUrl} alt="" aria-hidden />
            : <span aria-hidden>🎙️</span>}
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
          {props.avatarUrl && (
            <div className="convai-coach">
              {/* A face to talk to — people speak more freely to a face than a mic icon. The ring
                  pulses while connected (the coach is "listening"). */}
              <img
                className={`convai-avatar${connected ? ' convai-avatar--live' : ''}`}
                src={props.avatarUrl}
                alt={props.coachName ? `${props.coachName}, your coach` : 'Voice coach'}
              />
              <span className="convai-coach-name">
                {props.coachName ?? 'Coach'}{connected ? ' — listening' : ''}
              </span>
            </div>
          )}
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
          ) : preConnect ? (
            // autoOpen greeter: the greeting is in the header above; one tap to start (mic only now).
            <div className="convai-row">
              <button className="convai-btn" onClick={connect} aria-label={launcherLabel(props.mode)}>
                <span aria-hidden>🎙️</span>
                {launcherLabel(props.mode)}
              </button>
            </div>
          ) : (
            <>
              {connecting ? (
                <div className="convai-connecting" aria-live="polite">
                  <span>{statusLabel(status, convo.isSpeaking)}</span>
                  <span className="convai-progress" aria-hidden>
                    <i style={{ animationDuration: `${waitMs}ms` }} />
                  </span>
                </div>
              ) : (
                <div className="convai-status" aria-live="polite">
                  {statusLabel(status, convo.isSpeaking)}
                </div>
              )}
              <div className="convai-row">
                <button
                  className="convai-btn"
                  onClick={() => convo.setMuted(!convo.isMuted)}
                  aria-label={convo.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {convo.isMuted ? 'Unmute' : 'Mute'}
                </button>
              </div>
              {props.textInput && (
                <form className="convai-fallback convai-row" onSubmit={submitText} style={{ marginTop: 8 }}>
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type or paste to the assistant"
                    aria-label="Type or paste to the assistant"
                  />
                  <button className="convai-btn" type="submit">Send</button>
                </form>
              )}
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
