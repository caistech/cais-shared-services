import { describe, it, expect } from 'vitest';
import {
  collectContentConflicts,
  computePlacement,
  rectForPosition,
  intersectionArea,
  edgeGap,
  rectArea,
  type Obstacle,
  type Rect,
  type Viewport,
  type Size,
} from '../src/placement';

const DESKTOP: Viewport = { width: 1440, height: 900 };
const MOBILE: Viewport = { width: 390, height: 844 };
const PILL: Size = { width: 240, height: 48 };

function obstacle(rect: Rect, kind: Obstacle['kind'] = 'fixed', weight = 1.5): Obstacle {
  return { rect, kind, weight };
}

/** A typical bottom-right-anchored floater (e.g. an Intercom chat bubble) on desktop. */
function bottomRightChat(vp: Viewport): Obstacle {
  return obstacle({ left: vp.width - 90, top: vp.height - 90, right: vp.width - 20, bottom: vp.height - 20 }, 'fixed', 1.5);
}

describe('geometry', () => {
  it('computes rect area', () => {
    expect(rectArea({ left: 0, top: 0, right: 10, bottom: 5 })).toBe(50);
    expect(rectArea({ left: 10, top: 10, right: 0, bottom: 0 })).toBe(0); // inverted → 0
  });

  it('computes intersection area, 0 when disjoint', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    const b = { left: 5, top: 5, right: 15, bottom: 15 };
    expect(intersectionArea(a, b)).toBe(25);
    expect(intersectionArea(a, { left: 20, top: 20, right: 30, bottom: 30 })).toBe(0);
  });

  it('computes edge gap between disjoint rects', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    const b = { left: 20, top: 0, right: 30, bottom: 10 }; // 10px to the right
    expect(edgeGap(a, b)).toBe(10);
    // overlapping rects have zero gap
    expect(edgeGap(a, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(0);
  });

  it('places corners inside the viewport with margin', () => {
    const r = rectForPosition('bottom-right', DESKTOP, PILL, 24);
    expect(r.right).toBe(DESKTOP.width - 24);
    expect(r.bottom).toBe(DESKTOP.height - 24);
    expect(r.left).toBe(DESKTOP.width - 24 - PILL.width);
  });

  it('pins right-edge-tab flush to the right edge, vertically centred', () => {
    const r = rectForPosition('right-edge-tab', MOBILE, { width: 52, height: 52 }, 24);
    expect(r.right).toBe(MOBILE.width);
    expect(Math.round((r.top + r.bottom) / 2)).toBe(Math.round(MOBILE.height / 2));
  });
});

describe('Test 1 — normal website (no conflicts)', () => {
  it('defaults to bottom-right', () => {
    const result = computePlacement({ viewport: DESKTOP, button: PILL, obstacles: [] });
    expect(result.position).toBe('bottom-right');
    expect(result.scores[0].conflicts).toBe(0);
  });

  it('honours a configured preferred corner when the page is clean', () => {
    const result = computePlacement({
      viewport: DESKTOP,
      button: PILL,
      obstacles: [],
      preferred: 'bottom-left',
    });
    expect(result.position).toBe('bottom-left');
  });
});

describe('Test 2 — existing chat widget bottom-right', () => {
  it('moves away from the occupied corner', () => {
    const result = computePlacement({
      viewport: DESKTOP,
      button: PILL,
      obstacles: [bottomRightChat(DESKTOP)],
    });
    expect(result.position).not.toBe('bottom-right');
    // The chosen spot must be conflict-free.
    expect(result.scores[0].conflicts).toBe(0);
  });

  it('still avoids bottom-right even when it is the operator preference', () => {
    const result = computePlacement({
      viewport: DESKTOP,
      button: PILL,
      obstacles: [bottomRightChat(DESKTOP)],
      preferred: 'bottom-right',
    });
    expect(result.position).not.toBe('bottom-right');
  });
});

describe('Test 3 — checkout page (avoid the purchase CTA)', () => {
  it('does not overlap a sticky Purchase button', () => {
    // A wide sticky checkout bar across the bottom of the viewport.
    const purchase = obstacle(
      { left: DESKTOP.width - 320, top: DESKTOP.height - 80, right: DESKTOP.width - 20, bottom: DESKTOP.height - 20 },
      'interactive',
      1.5,
    );
    const result = computePlacement({ viewport: DESKTOP, button: PILL, obstacles: [purchase] });
    const chosenRect = result.rect;
    expect(intersectionArea(chosenRect, purchase.rect)).toBe(0);
    expect(result.position).not.toBe('bottom-right');
  });
});

describe('Test 4 — mobile view', () => {
  it('collapses to the right-edge-tab on a clean mobile page', () => {
    const result = computePlacement({
      viewport: MOBILE,
      button: { width: 52, height: 52 },
      obstacles: [],
      isMobile: true,
    });
    expect(result.position).toBe('right-edge-tab');
  });

  it('never chooses a bottom-center-ish position on mobile (candidates exclude it by construction)', () => {
    const result = computePlacement({
      viewport: MOBILE,
      button: { width: 52, height: 52 },
      obstacles: [],
      isMobile: true,
    });
    expect(['right-edge-tab', 'bottom-right', 'bottom-left']).toContain(result.position);
  });
});

describe('Test 5 — dynamic popup appears', () => {
  it('recomputes to a different position once a conflict lands on the current spot', () => {
    const clean = computePlacement({ viewport: DESKTOP, button: PILL, obstacles: [] });
    expect(clean.position).toBe('bottom-right');

    // A popup/chat mounts over bottom-right (what the MutationObserver would trigger a recompute for).
    const afterPopup = computePlacement({
      viewport: DESKTOP,
      button: PILL,
      obstacles: [bottomRightChat(DESKTOP)],
      remembered: clean.position, // memory prefers the old spot, but a real overlap must still win out
    });
    expect(afterPopup.position).not.toBe('bottom-right');
    expect(afterPopup.scores[0].conflicts).toBe(0);
  });
});

describe('memory / preference tie-breaks', () => {
  it('a remembered clean position wins over the default order', () => {
    const result = computePlacement({
      viewport: DESKTOP,
      button: PILL,
      obstacles: [],
      remembered: 'top-left',
      candidates: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    });
    expect(result.position).toBe('top-left');
  });

  it('never returns an empty result', () => {
    const result = computePlacement({ viewport: DESKTOP, button: PILL, obstacles: [], candidates: [] });
    expect(result.position).toBeTruthy();
    expect(result.rect).toBeTruthy();
  });
});

describe('content occlusion (the engine avoided controls and was blind to content)', () => {
  const viewport = { width: 1440, height: 900 };
  const button = { width: 160, height: 44 };

  /** A minimal stand-in for the bits of Document the occlusion pass touches. */
  function fakeDoc(hits: Record<string, Element[]>) {
    const body = { tagName: 'BODY', closest: () => null } as unknown as Element;
    return {
      body,
      documentElement: { tagName: 'HTML' } as unknown as Element,
      elementsFromPoint: (x: number, y: number) => hits[`${Math.round(x)},${Math.round(y)}`] ?? [body],
    } as unknown as Document;
  }

  function el(tagName: string, rect: { left: number; top: number; right: number; bottom: number }, text?: string) {
    return {
      tagName,
      id: '',
      className: '',
      childNodes: text ? [{ nodeType: 3, nodeValue: text }] : [],
      getAttribute: () => null,
      closest: () => null,
      getBoundingClientRect: () => rect as DOMRect,
    } as unknown as Element;
  }

  it('returns nothing when every sample lands on the body', () => {
    expect(collectContentConflicts(fakeDoc({}), viewport, button, ['bottom-right'])).toEqual([]);
  });

  it('flags a heading sitting under a candidate position', () => {
    const heading = el('H1', { left: 1200, top: 800, right: 1420, bottom: 880 }, 'Sell it for what it is worth');
    const doc = fakeDoc({ '1257,833': [heading], '1336,833': [heading] });
    const found = collectContentConflicts(doc, viewport, button, ['bottom-right']);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].kind).toBe('content');
    // Below `interactive` on purpose: covering a button breaks the page, covering a paragraph
    // obscures it. Both real, not equal.
    expect(found[0].weight).toBeLessThan(1);
  });

  // The two existing passes miss these entirely — an <img> is neither fixed nor interactive.
  it('flags an image, which has no text node to inspect', () => {
    const img = el('IMG', { left: 1200, top: 800, right: 1420, bottom: 880 });
    const doc = fakeDoc({ '1257,833': [img] });
    expect(collectContentConflicts(doc, viewport, button, ['bottom-right'])).toHaveLength(1);
  });

  it('ignores an empty layout container', () => {
    const wrapper = el('DIV', { left: 1200, top: 800, right: 1420, bottom: 880 });
    const doc = fakeDoc({ '1257,833': [wrapper] });
    expect(collectContentConflicts(doc, viewport, button, ['bottom-right'])).toEqual([]);
  });

  // Degrading to the previous behaviour beats throwing inside someone else's page.
  it('returns nothing where elementsFromPoint is unavailable', () => {
    const doc = { body: {}, documentElement: {} } as unknown as Document;
    expect(collectContentConflicts(doc, viewport, button, ['bottom-right'])).toEqual([]);
  });

  it('lets a covered candidate lose to a clean one', () => {
    const heading = el('H1', { left: 1200, top: 800, right: 1420, bottom: 880 }, 'important');
    const obstacles = collectContentConflicts(
      fakeDoc({ '1257,833': [heading], '1336,833': [heading], '1415,833': [heading] }),
      viewport,
      button,
      ['bottom-right'],
    );
    const result = computePlacement({ viewport, button, obstacles, candidates: ['bottom-right', 'bottom-left'] });
    expect(result.position).toBe('bottom-left');
  });
});
