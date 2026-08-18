// elevenlabs-convai/react/widget-logic.ts
// Pure, framework-free logic for VoiceWidget. Kept separate from the .tsx so it can be
// unit-tested in a node environment without React DOM or the ElevenLabs SDK runtime.
// (Type-only imports below are erased at compile time — no runtime dependency.)

import type { VoiceWidgetProps, VoiceMode, VoicePlacement, VoiceConnectionStatus } from '../types.js';

/** Options object passed to useConversation().startSession(). A structural subset of the
 *  SDK's HookOptions — the .tsx casts it at the call site. */
export interface StartOptions {
  /** Present in the public-agent path; omitted when connecting via `signedUrl`. */
  agentId?: string;
  /** Present when connecting to a private, owner-gated agent via a signed URL. */
  signedUrl?: string;
  overrides?: {
    agent?: { prompt?: { prompt: string }; firstMessage?: string };
  };
  clientTools?: Record<string, (params: Record<string, unknown>) => Promise<string> | string>;
  dynamicVariables?: Record<string, string>;
}

/**
 * Build the startSession options from widget props. Only includes keys that are present,
 * so we never send empty overrides/tools that could confuse the agent. The connect path in
 * VoiceWidget adds `signedUrl` (and omits `agentId`) when the consumer supplies one.
 */
export function buildStartOptions(props: VoiceWidgetProps): StartOptions {
  const opts: StartOptions = {};
  if (props.agentId) opts.agentId = props.agentId;

  if (props.overrides && Object.keys(props.overrides).length > 0) {
    opts.overrides = props.overrides;
  }
  if (props.clientTools && Object.keys(props.clientTools).length > 0) {
    opts.clientTools = props.clientTools;
  }
  // userId is passed only as a prompt-templating variable, never as an identity the agent
  // relays to tools (server-side binding owns identity). Harmless if the prompt ignores it.
  if (props.userId) {
    opts.dynamicVariables = { user_id: props.userId };
  }
  return opts;
}

const MODE_LABELS: Record<VoiceMode, string> = {
  greeting: 'Talk to the assistant',
  clarifier: 'Ask about this',
  discovery: 'Start a conversation',
  interview: 'Begin',
};

/** Launcher button label for a given mode (falls back to the greeting label). */
export function launcherLabel(mode?: VoiceMode): string {
  return mode ? MODE_LABELS[mode] : MODE_LABELS.greeting;
}

const MODE_HEADERS: Record<VoiceMode, string> = {
  greeting: 'Voice assistant. Tap the mic and talk; it can pick up where you left off.',
  clarifier: 'Stuck on this? Tap the mic and ask. The assistant knows this screen and your progress so far.',
  discovery: 'Tell the assistant what you need in your own words. It will guide you from there.',
  interview: 'A short spoken conversation. Answer out loud; you can pause or stop any time.',
};

/** Explanatory header for the open panel (UI explanatory-header rule). Props.title wins. */
export function panelHeader(props: VoiceWidgetProps): string {
  return props.title ?? (props.mode ? MODE_HEADERS[props.mode] : MODE_HEADERS.greeting);
}

/**
 * Whether to show the text-input fallback instead of the voice UI: only when the consumer
 * opted in AND voice can't run (no agent configured, or the connection errored).
 */
/**
 * Should the panel show a "connecting" state, with the bounded progress bar?
 *
 * Pure, and separated from the component for the same reason `shouldUseTextFallback` is: this is
 * the half that is worth asserting. It answers the gap the stall timeout left behind — a consumer
 * passing `transcript` (the portfolio's standard landing shape) rendered NOTHING between the click
 * and the connection, because the status line is suppressed when `transcript` is set and the
 * transcript itself only renders once connected. Measured live: eight seconds of empty panel,
 * which is indistinguishable from broken.
 *
 * Deliberately false once `fallback` is true: at that point the offer to type has replaced the
 * voice UI, and a progress bar over it would be claiming a connection attempt that has stopped.
 */
export function shouldShowConnecting(opts: {
  attempted: boolean;
  connected: boolean;
  fallback: boolean;
}): boolean {
  return opts.attempted && !opts.connected && !opts.fallback;
}

/**
 * Is this tap the start of a NEW conversation?
 *
 * This is the guard that was inline in `connect()`, extracted for one reason: the transcript
 * reset has to happen at EXACTLY this moment and nowhere else, and two copies of the same
 * condition drift.
 *
 * WHY A RESET IS NEEDED AT ALL. `messages` was a `useState([])` with a single append and no
 * reset anywhere — not on connect, not on disconnect, not on close. So ending a call and
 * starting another appended the new conversation to the old one, and a visitor who talked
 * three times saw all three stacked in one scrolling panel, greetings and all. Observed on a
 * live product with two "good to see you again" openings visible at once, above a transcript
 * containing everything the owner had pasted in earlier sessions.
 *
 * ⚠️ WHY THE RESET GOES HERE AND NOT IN `close()`. Clearing when the call ENDS would wipe the
 * transcript at the moment it is most useful — the user has just finished talking and may want
 * to read back what was said. Clearing when the next one BEGINS keeps the last conversation
 * readable for as long as it is the most recent thing that happened, which is the behaviour a
 * person expects from a transcript. "New conversation, clean page" rather than "call over,
 * everything vanishes".
 */
export function startsNewConversation(opts: {
  fallback: boolean;
  alreadyStarted: boolean;
  status: VoiceConnectionStatus;
}): boolean {
  return !opts.fallback && !opts.alreadyStarted && opts.status !== 'connected';
}

export function shouldUseTextFallback(
  props: VoiceWidgetProps,
  status: VoiceConnectionStatus,
  opts: { stalled?: boolean } = {},
): boolean {
  if (!props.textFallback) return false;
  // Voice can run if there is any connect source: a public agentId, a signed URL, or a resolver.
  const canConnect = Boolean(props.agentId || props.signedUrl || props.getSignedUrl);
  // A live conversation must never be interrupted by a stall timer that fired late.
  if (status === 'connected') return false;
  return !canConnect || status === 'error' || opts.stalled === true;
}

/**
 * How long the widget waits for a connection before offering the text box anyway.
 *
 * WHY A TIMEOUT EXISTS AT ALL. Until this, the fallback was reachable ONLY via
 * `status === 'error'` — the box a visitor without a microphone needs was gated on the
 * voice connection FAILING first. A connection that neither connects nor errors therefore
 * left them with a panel they could not use, permanently.
 *
 * That is not theoretical. Measured on a live product across six sweeps in one afternoon on
 * unchanged code, the text box appeared 0%, 40%, 50%, 70%, 80% and 100% of the time — the
 * variance tracking whether the connection happened to fail. When it did appear it took
 * ~570ms; when it did not, it never came, verified out to 30 seconds. A tester's verdict on
 * the same widget: he typed the question his whole purchase turned on, and it went into a hole.
 *
 * WHY 8 SECONDS. The fallback REPLACES the voice UI, so firing early would steal a slow but
 * working connection from someone who does have a microphone — the opposite failure, and a
 * worse one, because it degrades the primary experience for everyone to protect a subset.
 * Successful connections settle in well under this; 8s is comfortably past them and still
 * far short of "never", which is what it replaces. Override per widget with `fallbackAfterMs`.
 */
export const DEFAULT_FALLBACK_AFTER_MS = 8_000;

/** CSS class for the launcher container, by placement. */
export function placementClass(placement?: VoicePlacement): string {
  return `convai-launch convai-launch--${placement ?? 'floating'}`;
}

/** Human-readable status line shown in the panel. */
export function statusLabel(status: VoiceConnectionStatus, isSpeaking: boolean): string {
  switch (status) {
    case 'connecting': return 'Connecting…';
    case 'connected': return isSpeaking ? 'Assistant speaking…' : 'Listening…';
    case 'error': return 'Connection problem';
    default: return 'Not connected';
  }
}

/**
 * Self-contained styles, injected once at runtime. No CSS framework dependency so the
 * widget drops into any consumer. Responsive: floating launcher is a >=44px touch target
 * bottom-right; the open panel becomes a full-screen sheet at <=640px.
 */
export const WIDGET_CSS = `
.convai-launch { position: fixed; z-index: 2147483000; }
.convai-launch--floating { right: 16px; bottom: 16px; }
.convai-launch--header, .convai-launch--sidebar, .convai-launch--inline { position: static; }
.convai-btn {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; min-width: 44px; padding: 10px 16px;
  border: 0; border-radius: 9999px; cursor: pointer;
  background: #111827; color: #fff; font-size: 16px; line-height: 1.2;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
}
.convai-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.convai-panel {
  position: fixed; right: 16px; bottom: 76px; width: 360px; max-width: calc(100vw - 32px);
  background: #fff; color: #111827; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
  padding: 16px; z-index: 2147483000;
}
.convai-panel--fullpage { position: static; width: 100%; max-width: 640px; margin: 0 auto; }
/* Embedded coach (placement inline/fullpage): sits in the page flow, full width of its parent,
   no floating card/shadow — the consumer's container owns the chrome. Avatar on top, optional
   scrolling transcript, Begin button. Never the bottom-right corner. */
.convai-panel--embedded { position: static; width: 100%; max-width: 100%; margin: 0;
  background: transparent; box-shadow: none; padding: 0; }
.convai-transcript {
  max-height: 320px; overflow-y: auto; margin: 4px 0 14px;
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px;
}
.convai-transcript-empty { color: #6b7280; font-size: 14px; margin: auto; text-align: center; }
.convai-msg { font-size: 15px; line-height: 1.45; padding: 8px 12px; border-radius: 12px; max-width: 85%; }
.convai-msg--ai { background: #fff; border: 1px solid #e5e7eb; align-self: flex-start; color: #111827; }
.convai-msg--user { background: #0f766e; color: #fff; align-self: flex-end; }
.convai-coach--lg .convai-avatar { width: 112px; height: 112px; }
.convai-header { font-size: 14px; line-height: 1.4; color: #374151; margin: 0 0 12px; }
.convai-coach { display: flex; flex-direction: column; align-items: center; margin: 4px 0 10px; }
.convai-avatar {
  width: 88px; height: 88px; border-radius: 9999px; object-fit: cover;
  box-shadow: 0 0 0 3px #e5e7eb; transition: box-shadow .3s;
}
.convai-avatar--live { box-shadow: 0 0 0 3px #0f766e; animation: convai-pulse 2s ease-in-out infinite; }
@keyframes convai-pulse { 0%,100% { box-shadow: 0 0 0 3px #0f766e; } 50% { box-shadow: 0 0 0 7px rgba(15,118,110,.30); } }
.convai-coach-name { margin-top: 6px; font-size: 13px; color: #6b7280; }
.convai-launch-avatar { width: 28px; height: 28px; border-radius: 9999px; object-fit: cover; margin: -2px -2px -2px -6px; }
.convai-status { font-size: 14px; font-weight: 600; margin: 8px 0; }
/* The connecting state. Occupies the wait before the text fallback appears, which was previously
   an empty panel - see the connecting flag in VoiceWidget.tsx. The bar is tied to the SAME
   duration as the stall timeout, so it completes exactly as the offer to type arrives.
   (No backticks in here: this comment lives INSIDE the WIDGET_CSS template literal.) */
.convai-connecting { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
.convai-connecting > span:first-child { font-size: 14px; font-weight: 600; }
.convai-progress { display: block; height: 4px; width: 100%; border-radius: 999px; background: rgba(0,0,0,.08); overflow: hidden; }
.convai-progress > i { display: block; height: 100%; width: 100%; border-radius: 999px; background: currentColor; opacity: .55; transform-origin: left center; animation: convai-fill linear forwards; }
@keyframes convai-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
/* A visitor who has asked for no motion still needs to know it is working, so the bar stays but
   stops animating rather than disappearing. */
@media (prefers-reduced-motion: reduce) {
  .convai-progress > i { animation: none; transform: scaleX(.35); }
}
.convai-row { display: flex; gap: 8px; align-items: center; }
.convai-fallback input {
  flex: 1; min-height: 44px; font-size: 16px; padding: 8px 12px;
  border: 1px solid #d1d5db; border-radius: 10px;
}
.convai-close {
  position: absolute; top: 8px; right: 8px; min-height: 44px; min-width: 44px;
  border: 0; background: transparent; font-size: 20px; cursor: pointer; color: #6b7280;
}
@media (max-width: 640px) {
  .convai-panel { inset: 0; right: 0; bottom: 0; width: 100vw; max-width: 100vw;
    border-radius: 0; padding: 20px; }
}
`;
