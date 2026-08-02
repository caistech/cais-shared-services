/**
 * @caistech/sayfix-embed — dynamic placement engine
 *
 * Framework-agnostic, side-effect-light core that decides WHERE the SayFix launcher button should
 * sit on an arbitrary third-party website so it never obstructs the host site's own UI (chat
 * widgets, cookie banners, checkout CTAs, floating menus, accessibility controls, …).
 *
 * The React widget (SayFixWidget) consumes this via a small client hook; keeping the algorithm pure
 * here means it is unit-testable with plain objects (no DOM) and reusable by a future vanilla-JS
 * script loader for non-React hosts (WordPress / Wix / Shopify) WITHOUT forking a second engine.
 *
 * SECURITY: `collectObstacles` reads only element *geometry* (getBoundingClientRect) and *structural
 * metadata* (computed `position`, id/class/aria-label/role tokens) — never element text content,
 * form values, or any user-entered data. It does not mutate the host page and performs no network
 * or tracking calls. See SayFix_Dynamic_Widget_Placement_Enhancement.md § Security Requirements.
 */

/* ============================= TYPES ============================= */

/** The four desktop corners. */
export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/** Every position the launcher can be rendered at. `right-edge-tab` is the collapsed mobile shape. */
export type Position = Corner | 'right-edge-tab';

/** A viewport-relative rectangle (CSS pixels, origin top-left). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Why an obstacle matters — feeds the scoring weight.
 *
 * `content` was added 2026-08-02. The engine avoided CONTROLS and was blind to CONTENT: a heading, a
 * price, a voucher code, an image or a chart was invisible to it, so it would park the launcher on
 * the single most important string on the page and report `conflicts: 0` — correct by its own model,
 * which is worse than a crash. Recorded as a known limit until the operator ruled it a defect:
 * "it's meant to avoid both."
 */
export type ObstacleKind = 'fixed' | 'interactive' | 'content';

/** A host-page element the launcher should avoid overlapping / crowding. */
export interface Obstacle {
  rect: Rect;
  kind: ObstacleKind;
  /** Relative importance of avoiding this element (a matched chat/checkout widget weighs more). */
  weight: number;
  /** Optional classification label, purely for debugging/telemetry (never user content). */
  hint?: string;
}

export interface PlacementInput {
  viewport: Viewport;
  /** Rendered size of the launcher in its current form (corner pill vs collapsed edge-tab). */
  button: Size;
  obstacles: Obstacle[];
  /** Gap from the viewport edge, px. Default 24 (matches the legacy static offset). */
  margin?: number;
  /** Mobile hosts prefer the collapsed right-edge-tab and avoid bottom-center browser-UI collisions. */
  isMobile?: boolean;
  /** Candidate positions to consider, best-preferred first. Defaults derived from `isMobile`. */
  candidates?: Position[];
  /** The operator's configured/preferred position (the legacy `position` prop) — gets a tie-break bonus. */
  preferred?: Position;
  /** A previously-remembered good position for this page (localStorage) — a stronger tie-break bonus. */
  remembered?: Position;
}

export interface PlacementScore {
  position: Position;
  score: number;
  rect: Rect;
  /** How many obstacles this position directly overlaps (0 == clean). */
  conflicts: number;
}

export interface PlacementResult {
  position: Position;
  rect: Rect;
  /** All candidates, highest score first — useful for tests + debugging. */
  scores: PlacementScore[];
}

/* ============================= CONSTANTS ============================= */

export const DEFAULT_DESKTOP_CANDIDATES: Corner[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

/** Mobile: collapsed edge-tab first, then bottom corners (never bottom-center — browser UI + CTAs). */
export const DEFAULT_MOBILE_CANDIDATES: Position[] = [
  'right-edge-tab',
  'bottom-right',
  'bottom-left',
];

const DEFAULT_MARGIN = 24;

// Scoring weights. A direct overlap is disqualifying; proximity is a softer nudge.
const BASE_SCORE = 100;
const OVERLAP_PENALTY = 220; // a real overlap must beat any preference bonus and sink the spot
const OVERLAP_FLOOR = 0.35; // even a tiny overlap incurs ≥35% of the penalty (touching == bad)
const PROXIMITY_RADIUS = 96; // px within which a non-overlapping obstacle still crowds the button
const PROXIMITY_PENALTY = 60;
const PREFERENCE_STEP = 2; // per-rank tie-break so a clean page resolves to the preferred order
const PREFERRED_BONUS = 8; // configured position wins ties over other clean corners
const REMEMBERED_BONUS = 14; // a remembered-good position wins over the default preference

/* ============================= GEOMETRY ============================= */

export function rectArea(r: Rect): number {
  return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
}

/** Overlapping area of two rects (0 if disjoint). */
export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return Math.max(0, w) * Math.max(0, h);
}

/** Shortest edge-to-edge distance between two disjoint rects (0 if they touch/overlap). */
export function edgeGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Where the launcher rectangle sits for a given candidate position, clamped into the viewport.
 */
export function rectForPosition(
  position: Position,
  viewport: Viewport,
  button: Size,
  margin = DEFAULT_MARGIN,
): Rect {
  const { width: vw, height: vh } = viewport;
  const { width: w, height: h } = button;

  switch (position) {
    case 'bottom-right':
      return box(vw - margin - w, vh - margin - h, w, h);
    case 'bottom-left':
      return box(margin, vh - margin - h, w, h);
    case 'top-right':
      return box(vw - margin - w, margin, w, h);
    case 'top-left':
      return box(margin, margin, w, h);
    case 'right-edge-tab':
      // Pinned flush to the right edge, vertically centred — the collapsed mobile shape.
      return box(vw - w, (vh - h) / 2, w, h);
    default:
      return box(vw - margin - w, vh - margin - h, w, h);
  }
}

function box(left: number, top: number, w: number, h: number): Rect {
  return { left, top, right: left + w, bottom: top + h };
}

/* ============================= SCORING ============================= */

function preferenceBonus(
  position: Position,
  candidates: Position[],
  preferred?: Position,
  remembered?: Position,
): number {
  const idx = candidates.indexOf(position);
  const rank = idx === -1 ? 0 : (candidates.length - idx) * PREFERENCE_STEP;
  const pref = position === preferred ? PREFERRED_BONUS : 0;
  const remem = position === remembered ? REMEMBERED_BONUS : 0;
  return rank + pref + remem;
}

/**
 * Score a single candidate position. Higher is better. Pure — given the same inputs it always
 * returns the same score, so it can be tested exhaustively.
 */
export function scorePosition(
  position: Position,
  rect: Rect,
  input: PlacementInput,
  candidates: Position[],
): PlacementScore {
  let score = BASE_SCORE + preferenceBonus(position, candidates, input.preferred, input.remembered);
  const buttonArea = rectArea(rect) || 1;
  let conflicts = 0;

  for (const obstacle of input.obstacles) {
    const overlap = intersectionArea(rect, obstacle.rect);
    if (overlap > 0) {
      conflicts += 1;
      const severity = Math.min(1, overlap / buttonArea + OVERLAP_FLOOR);
      score -= obstacle.weight * OVERLAP_PENALTY * severity;
    } else {
      const gap = edgeGap(rect, obstacle.rect);
      if (gap < PROXIMITY_RADIUS) {
        score -= obstacle.weight * PROXIMITY_PENALTY * (1 - gap / PROXIMITY_RADIUS);
      }
    }
  }

  return { position, score, rect, conflicts };
}

/**
 * The core decision: score every candidate and return the winner (highest score, ties broken by
 * candidate order for stability). Never throws; falls back to the first candidate if the list is
 * somehow empty.
 */
export function computePlacement(input: PlacementInput): PlacementResult {
  const candidates =
    input.candidates ??
    (input.isMobile ? DEFAULT_MOBILE_CANDIDATES : DEFAULT_DESKTOP_CANDIDATES);
  const margin = input.margin ?? DEFAULT_MARGIN;

  const scores = candidates.map((position) =>
    scorePosition(
      position,
      rectForPosition(position, input.viewport, input.button, margin),
      input,
      candidates,
    ),
  );

  // Highest score first; stable so equal scores keep the preferred candidate order.
  const ranked = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map(({ s }) => s);

  const best = ranked[0] ?? {
    position: candidates[0] ?? 'bottom-right',
    rect: rectForPosition(candidates[0] ?? 'bottom-right', input.viewport, input.button, margin),
    score: 0,
    conflicts: 0,
  };

  return { position: best.position, rect: best.rect, scores: ranked };
}

/* ============================= DOM SCAN ============================= */

// Structural-metadata classifiers (id/class/aria-label/role tokens only — NOT text content).
const HINT_WEIGHTS: { test: RegExp; weight: number; hint: string }[] = [
  { test: /chat|intercom|crisp|drift|tawk|livechat|messenger|zendesk|helpscout|hubspot/i, weight: 1.5, hint: 'chat' },
  { test: /cookie|consent|gdpr|\bcmp\b|privacy-banner/i, weight: 1.4, hint: 'consent' },
  { test: /cart|checkout|buy-now|purchase|add-to-cart|basket|paynow|pay-now/i, weight: 1.5, hint: 'commerce' },
  { test: /\bcta\b|floating|sticky-bar|fab\b|back-to-top|scroll-top|a11y|accessibility|whatsapp|call-now/i, weight: 1.2, hint: 'floating-cta' },
];

const INTERACTIVE_SELECTOR = 'button, a[href], input, select, textarea, [role="button"], [role="link"]';

function classify(el: Element): { weight: number; hint?: string } {
  const tokens = [
    el.id,
    el.className && typeof el.className === 'string' ? el.className : '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('role') ?? '',
    el.getAttribute('data-testid') ?? '',
  ].join(' ');
  for (const { test, weight, hint } of HINT_WEIGHTS) {
    if (test.test(tokens)) return { weight, hint };
  }
  return { weight: 1 };
}

function toRect(domRect: DOMRect): Rect {
  return { left: domRect.left, top: domRect.top, right: domRect.right, bottom: domRect.bottom };
}

function isVisible(el: Element, style: CSSStyleDeclaration, rect: DOMRect): boolean {
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity || '1') === 0) return false;
  if (rect.width < 4 || rect.height < 4) return false;
  return true;
}

function intersectsViewport(rect: DOMRect, vp: Viewport): boolean {
  return rect.right > 0 && rect.bottom > 0 && rect.left < vp.width && rect.top < vp.height;
}

/**
 * Scan the host document for elements the launcher should avoid. Returns:
 *  - every visible `position: fixed | sticky` element in the viewport (persistent floaters — chat
 *    widgets, cookie banners, sticky bars), classified/weighted by structural metadata; PLUS
 *  - visible interactive elements (buttons/links/inputs/CTAs) currently intersecting the viewport,
 *    so a checkout "Purchase" CTA above the fold is avoided even if it is not itself fixed.
 *
 * Excludes SayFix's own subtree (marked with `data-sayfix-widget`). Defensive throughout — a single
 * bad node never breaks placement. Reads geometry + structural metadata only (see file-level note).
 *
 * `excludeSelector` defaults to the SayFix marker; callers pass the document from a client effect.
 */
export function collectObstacles(
  doc: Document,
  viewport: Viewport,
  excludeSelector = '[data-sayfix-widget]',
  maxScan = 400,
): Obstacle[] {
  const win = doc.defaultView;
  if (!win) return [];
  const obstacles: Obstacle[] = [];
  const seen = new Set<Element>();

  const consider = (el: Element, kind: ObstacleKind, requireFixed: boolean) => {
    if (seen.has(el)) return;
    if (excludeSelector && el.closest(excludeSelector)) return;
    let style: CSSStyleDeclaration;
    let rect: DOMRect;
    try {
      style = win.getComputedStyle(el);
      rect = el.getBoundingClientRect();
    } catch {
      return;
    }
    const positioned = style.position === 'fixed' || style.position === 'sticky';
    if (requireFixed && !positioned) return;
    if (!isVisible(el, style, rect)) return;
    if (!intersectsViewport(rect, viewport)) return;
    seen.add(el);
    const { weight, hint } = classify(el);
    obstacles.push({ rect: toRect(rect), kind, weight, hint });
  };

  try {
    // Pass 1: all fixed/sticky elements (few in number, always relevant).
    const all = doc.body ? doc.body.querySelectorAll<Element>('*') : [];
    let scanned = 0;
    for (const el of Array.from(all)) {
      if (scanned++ > maxScan) break;
      consider(el, 'fixed', true);
    }
    // Pass 2: interactive elements intersecting the viewport (checkout CTAs, etc.).
    const interactive = doc.querySelectorAll<Element>(INTERACTIVE_SELECTOR);
    let scannedI = 0;
    for (const el of Array.from(interactive)) {
      if (scannedI++ > maxScan) break;
      consider(el, 'interactive', false);
    }
  } catch {
    // Return whatever we gathered; placement degrades gracefully to the preferred corner.
  }

  return obstacles;
}

/* ============================= CONTENT OCCLUSION ============================= */

/**
 * Weight for a content conflict — deliberately BELOW `interactive` (1).
 *
 * Covering a button breaks the page; covering a paragraph obscures it. Both are real, they are not
 * equal, and a content hit must still be able to lose to a strongly-preferred clean corner.
 */
const CONTENT_WEIGHT = 0.6;

/** Elements that ARE content in their own right, with no text node to inspect. */
const CONTENT_TAGS = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME']);

/** Host opt-out: anything inside this is declared safe to cover. */
const AVOID_OPT_OUT = '[data-sayfix-avoid="false"]';

/**
 * Does this element itself carry something a reader would miss if it were covered?
 *
 * ⚠️ SECURITY — this asks WHETHER a text node is non-empty, never WHAT it says. Existence, not
 * value: nothing is read into a variable that outlives the check, nothing is classified by meaning,
 * nothing is transmitted. That distinction is what keeps the file-level guarantee intact while
 * running on third-party customer sites, and it is why importance cannot be ranked by reading the
 * words — a price and a footnote are indistinguishable here, by design.
 */
function carriesContent(el: Element): boolean {
  if (CONTENT_TAGS.has(el.tagName)) return true;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.nodeValue ?? '').trim().length > 0) return true;
  }
  return false;
}

/**
 * WHAT WOULD THE LAUNCHER BE COVERING, AND IS THERE SOMEWHERE COVERING LESS?
 *
 * The obvious fix — add every text element to the obstacle list — does not work, and it is worth
 * saying why so nobody tries it again. On a content page EVERYTHING is text: every candidate takes
 * an overlap hit, `OVERLAP_PENALTY` swamps every preference bonus, all four corners score equally
 * terrible, and the choice degenerates to candidate order. "Never cover any content" is unsatisfiable
 * for a floating overlay.
 *
 * So the question is inverted. Instead of finding all the content and avoiding it, hit-test the
 * handful of places the launcher can actually go and ask what is underneath each. `elementsFromPoint`
 * gives the topmost element at a point; if it is a leaf carrying content, that candidate is covering
 * something. If it is `body` or an empty layout container, that spot is free.
 *
 * This also catches images, canvases and videos, which the two existing passes miss entirely — and
 * it is CHEAPER than they are: roughly nine hit-tests per candidate against two 400-element scans.
 *
 * Returns obstacles carrying the FOUND ELEMENT's rect rather than the sample point, so an element
 * spanning two candidate positions correctly penalises both.
 */
export function collectContentConflicts(
  doc: Document,
  viewport: Viewport,
  button: Size,
  candidates: Position[],
  margin = DEFAULT_MARGIN,
  excludeSelector = '[data-sayfix-widget]',
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const seen = new Set<Element>();

  // Feature-detected rather than assumed: jsdom and older browsers may not implement it, and a
  // missing API must degrade to the previous behaviour rather than throw inside a host page.
  if (typeof doc.elementsFromPoint !== 'function') return obstacles;

  try {
    for (const position of candidates) {
      const rect = rectForPosition(position, viewport, button, margin);
      // Corners, edge midpoints and centre — nine points. Inset by a pixel so a sample on the
      // boundary does not hit the neighbouring element instead of the one actually covered.
      const xs = [rect.left + 1, (rect.left + rect.right) / 2, rect.right - 1];
      const ys = [rect.top + 1, (rect.top + rect.bottom) / 2, rect.bottom - 1];

      for (const x of xs) {
        for (const y of ys) {
          if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
          let stack: Element[];
          try {
            stack = doc.elementsFromPoint(x, y) ?? [];
          } catch {
            continue;
          }
          // The topmost element that is not ours. Our own launcher is at this point by definition
          // once it has rendered, so skipping the subtree is what makes the check re-runnable.
          const top = stack.find((el) => !(excludeSelector && el.closest(excludeSelector)));
          if (!top || seen.has(top)) continue;
          if (top === doc.body || top === doc.documentElement) continue;
          if (top.closest(AVOID_OPT_OUT)) continue;
          if (!carriesContent(top)) continue;

          seen.add(top);
          let domRect: DOMRect;
          try {
            domRect = top.getBoundingClientRect();
          } catch {
            continue;
          }
          const { hint } = classify(top);
          obstacles.push({
            rect: toRect(domRect),
            kind: 'content',
            weight: CONTENT_WEIGHT,
            hint: hint ?? 'content',
          });
        }
      }
    }
  } catch {
    // Same posture as the structural scan: return what we have. A placement engine that throws
    // inside someone else's page is worse than one that picks a slightly worse corner.
  }

  return obstacles;
}
