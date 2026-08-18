import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildStartOptions,
  launcherLabel,
  panelHeader,
  shouldUseTextFallback,
  shouldShowConnecting,
  startsNewConversation,
  placementClass,
  statusLabel,
} from '../src/react/widget-logic';
import type { VoiceWidgetProps } from '../src/types';

const base: VoiceWidgetProps = { agentId: 'agent_x' };

describe('buildStartOptions', () => {
  it('includes only the agentId when nothing else is set', () => {
    const opts = buildStartOptions(base);
    expect(opts).toEqual({ agentId: 'agent_x' });
  });

  it('passes through overrides and clientTools when present', () => {
    const opts = buildStartOptions({
      ...base,
      overrides: { agent: { firstMessage: 'Hi there' } },
      clientTools: { doThing: async () => 'ok' },
    });
    expect(opts.overrides?.agent?.firstMessage).toBe('Hi there');
    expect(typeof opts.clientTools?.doThing).toBe('function');
  });

  it('omits empty overrides/clientTools objects', () => {
    const opts = buildStartOptions({ ...base, overrides: {}, clientTools: {} });
    expect(opts.overrides).toBeUndefined();
    expect(opts.clientTools).toBeUndefined();
  });

  it('passes userId as a prompt variable, not an identity field', () => {
    const opts = buildStartOptions({ ...base, userId: 'u1' });
    expect(opts.dynamicVariables).toEqual({ user_id: 'u1' });
    // never a top-level userId the agent could relay as identity
    expect((opts as Record<string, unknown>).userId).toBeUndefined();
  });

  it('omits agentId when none is supplied (signed-URL / owner-gated path)', () => {
    // A private agent supplies getSignedUrl instead of a public agentId; buildStartOptions
    // must not emit an agentId key (the VoiceWidget connect path adds signedUrl).
    const opts = buildStartOptions({ getSignedUrl: async () => 'wss://signed' });
    expect(opts.agentId).toBeUndefined();
    expect('agentId' in opts).toBe(false);
  });
});

describe('launcherLabel / panelHeader', () => {
  it('defaults to the greeting label', () => {
    expect(launcherLabel()).toMatch(/assistant/i);
    expect(launcherLabel('clarifier')).toMatch(/ask/i);
  });

  it('uses an explicit title over the mode header', () => {
    expect(panelHeader({ ...base, title: 'Custom header' })).toBe('Custom header');
  });

  it('falls back to a mode-specific header', () => {
    expect(panelHeader({ ...base, mode: 'clarifier' })).toMatch(/stuck/i);
  });
});

describe('shouldUseTextFallback', () => {
  it('is false when textFallback is not enabled', () => {
    expect(shouldUseTextFallback({ ...base }, 'error')).toBe(false);
  });

  it('is true when enabled and the connection errored', () => {
    expect(shouldUseTextFallback({ ...base, textFallback: true }, 'error')).toBe(true);
  });

  it('is true when enabled and no agentId is configured', () => {
    expect(shouldUseTextFallback({ agentId: '', textFallback: true }, 'disconnected')).toBe(true);
  });

  it('is false when enabled, agent present, and connected', () => {
    expect(shouldUseTextFallback({ ...base, textFallback: true }, 'connected')).toBe(false);
  });

  it('is false with no agentId but a signed-URL resolver (voice can still run)', () => {
    expect(
      shouldUseTextFallback({ getSignedUrl: async () => 'wss://signed', textFallback: true }, 'disconnected'),
    ).toBe(false);
  });

  // ── the stall timer ───────────────────────────────────────────────────────────────────────
  // Before this, the fallback required `status === 'error'`. A connection that neither succeeded
  // nor failed therefore left a visitor without a microphone on a panel they could not use, with
  // no way to type — permanently. Measured live: the box appeared 0–100% of the time across six
  // sweeps on unchanged code, tracking whether the connection happened to error.

  it('offers the box once the connection has STALLED, with no error ever arriving', () => {
    // The whole point. `connecting` is not an error and never becomes one in the failing case.
    expect(
      shouldUseTextFallback({ ...base, textFallback: true }, 'connecting', { stalled: true }),
    ).toBe(true);
  });

  it('does NOT offer the box while a connection is merely in progress', () => {
    expect(shouldUseTextFallback({ ...base, textFallback: true }, 'connecting')).toBe(false);
  });

  it('never interrupts a LIVE conversation, even if the stall timer fired late', () => {
    // The opposite failure, and the worse one: stealing the voice UI from someone who does have a
    // microphone degrades the primary experience for everyone to protect a subset.
    expect(
      shouldUseTextFallback({ ...base, textFallback: true }, 'connected', { stalled: true }),
    ).toBe(false);
  });

  it('still respects the opt-in — a stall cannot conjure a box the consumer never asked for', () => {
    expect(shouldUseTextFallback({ ...base }, 'connecting', { stalled: true })).toBe(false);
  });
});

describe('placementClass / statusLabel', () => {
  it('defaults placement to floating', () => {
    expect(placementClass()).toContain('convai-launch--floating');
    expect(placementClass('sidebar')).toContain('convai-launch--sidebar');
  });

  it('describes connection status for the operator', () => {
    expect(statusLabel('connecting', false)).toMatch(/connecting/i);
    expect(statusLabel('connected', true)).toMatch(/speaking/i);
    expect(statusLabel('connected', false)).toMatch(/listening/i);
    expect(statusLabel('error', false)).toMatch(/problem/i);
  });
});


describe('shouldShowConnecting — the eight seconds nobody was told about', () => {
  it('is false before anyone asks to talk (a page at rest shows no progress bar)', () => {
    expect(shouldShowConnecting({ attempted: false, connected: false, fallback: false })).toBe(false);
  });

  it('is TRUE while a requested connection has not landed — the gap this closes', () => {
    expect(shouldShowConnecting({ attempted: true, connected: false, fallback: false })).toBe(true);
  });

  it('stops the moment voice connects', () => {
    expect(shouldShowConnecting({ attempted: true, connected: true, fallback: false })).toBe(false);
  });

  it('yields to the text fallback rather than sitting over it', () => {
    // Once the offer to type has replaced the voice UI, a progress bar would be claiming a
    // connection attempt that has already stopped.
    expect(shouldShowConnecting({ attempted: true, connected: false, fallback: true })).toBe(false);
  });
});


describe('startsNewConversation — the transcript that never cleared', () => {
  // WHY THIS EXISTS. `messages` was a useState([]) with one append and NO reset anywhere — not on
  // connect, not on disconnect, not on close. Every conversation of a visit therefore stacked into
  // one scrolling panel. Found on a live product showing two "good to see you again" greetings at
  // once, above everything the owner had pasted in earlier sessions. The reset hangs off exactly
  // this predicate, which is also `connect()`'s guard — one condition, so the two cannot drift.

  it('is TRUE on a first tap — the case that clears the previous conversation', () => {
    expect(startsNewConversation({ fallback: false, alreadyStarted: false, status: 'disconnected' })).toBe(true);
  });

  it('is true again after a call ended, because close() releases alreadyStarted', () => {
    // This is the accumulation case. The second conversation of a visit reaches connect() with
    // startedRef released, and it is the one whose transcript used to append to the first.
    expect(startsNewConversation({ fallback: false, alreadyStarted: false, status: 'disconnected' })).toBe(true);
  });

  it('is FALSE while a session is already running, so a live transcript is never wiped mid-call', () => {
    expect(startsNewConversation({ fallback: false, alreadyStarted: false, status: 'connected' })).toBe(false);
    expect(startsNewConversation({ fallback: false, alreadyStarted: true, status: 'connecting' })).toBe(false);
  });

  it('is FALSE in text-fallback mode — there is no voice session to begin', () => {
    // A mic-less visitor typing into the fallback must not have their exchange erased by a
    // connect() that cannot connect anyway.
    expect(startsNewConversation({ fallback: true, alreadyStarted: false, status: 'disconnected' })).toBe(false);
  });

  it('is FALSE on a double tap, so an impatient second click cannot clear what was just said', () => {
    expect(startsNewConversation({ fallback: false, alreadyStarted: true, status: 'disconnected' })).toBe(false);
  });
});

describe('…and the reset is actually WIRED — the half a pure test cannot reach', () => {
  // ⚠️ EVERY ASSERTION ABOVE PASSES IF `setMessages([])` IS DELETED FROM connect(). They test the
  // predicate; nothing tests that anything CALLS it. That gap is the portfolio's most common defect
  // shape — correct, tested, and unreachable — and it is exactly how this bug survived in the first
  // place: the append was right, the state was right, and no line cleared it.
  //
  // The widget itself cannot be rendered here: this package is deliberately tested in node with no
  // React DOM and no ElevenLabs SDK runtime, which is why widget-logic.ts exists at all. So the
  // wiring is pinned at the source, the same way a sibling repo pins a prop that is computed and
  // then not passed. Cruder than a render test and it catches the thing that actually happened.
  const widget = readFileSync(new URL('../src/react/VoiceWidget.tsx', import.meta.url), 'utf8');

  it('clears the transcript inside connect(), not somewhere that never runs', () => {
    const connectFn = widget.slice(widget.indexOf('async function connect()'), widget.indexOf('function openAndConnect'));
    expect(connectFn).toContain('setMessages([])');
  });

  it('gates connect() on startsNewConversation rather than a second copy of the condition', () => {
    // Two copies of "is this a new conversation" drift, and the reset would then fire at a
    // different moment than the guard — clearing a live transcript, or not clearing at all.
    const connectFn = widget.slice(widget.indexOf('async function connect()'), widget.indexOf('function openAndConnect'));
    expect(connectFn).toContain('startsNewConversation(');
  });

  it('does NOT clear on close — the last conversation stays readable until the next one begins', () => {
    const closeFn = widget.slice(widget.indexOf('function close()'), widget.indexOf('function submitText'));
    expect(closeFn).not.toContain('setMessages');
  });
});
