'use client';

/**
 * SayFixWidget — the floating "Report a problem" launcher, now with DYNAMIC placement so it never
 * obstructs the host website's own UI. It picks the safest corner/edge on load, and re-picks at
 * runtime when the page changes (a chat widget mounts, a cookie banner appears, an SPA route change,
 * the viewport resizes/rotates). Falls back to the legacy static behaviour when `autoPlace={false}`.
 *
 * Client component ("use client") because placement inspects the live DOM. SSR renders the preferred
 * corner (no `window`), the client hydrates identically, then relocates in an effect — no hydration
 * mismatch. All styling stays inline (no CSS framework dependency), matching the package's DNA.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MessageSquare } from './icons';
import {
  collectObstacles,
  computePlacement,
  DEFAULT_DESKTOP_CANDIDATES,
  DEFAULT_MOBILE_CANDIDATES,
  type Corner,
  type Obstacle,
  type Position,
  type Size,
} from './placement';

export interface SayFixWidgetProps {
  /** Repo name (e.g. f2k-projects, mmcbuild) — owner is inferred from the product's GitHub account in SayFix */
  repo: string;
  /** Button text. Default is brand-neutral ("Report a problem"); set your own for white-label. */
  label?: string;
  showIcon?: boolean;
  /** Button background colour. Set to your brand accent for white-label; defaults to a neutral dark. */
  color?: string;
  /**
   * Preferred / fallback position. With `autoPlace` on (default) this is where the button sits when
   * nothing conflicts, and the tie-break winner among equally-clean spots. Widened from the legacy
   * two options to all four corners; old `'bottom-right'`/`'bottom-left'` callers are unaffected.
   */
  position?: Corner;
  /**
   * Enable dynamic collision-avoidance placement. Default `true`. Set `false` to pin statically to
   * `position` (the pre-0.5.0 behaviour).
   */
  autoPlace?: boolean;
  /**
   * Mobile shape. `'edge-tab'` (default) collapses to a compact right-edge tab — avoids the
   * bottom-center zone where mobile nav bars, checkout CTAs and browser UI live. `'inherit'` keeps
   * the corner pill on mobile too.
   */
  mobileMode?: 'edge-tab' | 'inherit';
  /** Max px width considered "mobile". Default 640. */
  mobileBreakpoint?: number;
}

const MOBILE_QUERY = (bp: number) => `(max-width: ${bp}px)`;
const RECOMPUTE_DEBOUNCE = 200;
const SIZE_PILL: Size = { width: 240, height: 48 };
const SIZE_EDGE_TAB: Size = { width: 52, height: 52 };

function memKey(isMobile: boolean): string | null {
  try {
    return `sayfix:pos:${window.location.pathname}:${isMobile ? 'm' : 'd'}`;
  } catch {
    return null;
  }
}

function readMemory(isMobile: boolean): Position | undefined {
  const key = memKey(isMobile);
  if (!key) return undefined;
  try {
    return (window.localStorage.getItem(key) as Position) || undefined;
  } catch {
    return undefined;
  }
}

function writeMemory(pos: Position, isMobile: boolean): void {
  const key = memKey(isMobile);
  if (!key) return;
  try {
    window.localStorage.setItem(key, pos);
  } catch {
    /* storage blocked (private mode / cross-origin sandbox) — placement still works, just not remembered */
  }
}

/**
 * Placement hook: owns the position state + all DOM observers. Returns the current position and a
 * ref to attach to the launcher so it can measure itself and exclude itself from the obstacle scan.
 */
function usePlacement(
  preferred: Corner,
  autoPlace: boolean,
  mobileMode: 'edge-tab' | 'inherit',
  mobileBreakpoint: number,
) {
  const [position, setPosition] = useState<Position>(preferred);
  const positionRef = useRef<Position>(preferred);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const sizeRef = useRef<Size>(SIZE_PILL);

  useEffect(() => {
    if (!autoPlace || typeof window === 'undefined') {
      // Static mode: honour the configured corner exactly.
      if (positionRef.current !== preferred) {
        positionRef.current = preferred;
        setPosition(preferred);
      }
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const recompute = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const isMobile = window.matchMedia(MOBILE_QUERY(mobileBreakpoint)).matches;

      // Measure the actual rendered launcher when available; fall back to a form-appropriate estimate.
      const el = anchorRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) sizeRef.current = { width: r.width, height: r.height };
      } else {
        sizeRef.current =
          isMobile && mobileMode === 'edge-tab' ? SIZE_EDGE_TAB : SIZE_PILL;
      }

      const candidates: Position[] = isMobile
        ? mobileMode === 'edge-tab'
          ? DEFAULT_MOBILE_CANDIDATES
          : [preferred, ...DEFAULT_DESKTOP_CANDIDATES.filter((c) => c !== preferred)]
        : [preferred, ...DEFAULT_DESKTOP_CANDIDATES.filter((c) => c !== preferred)];

      let obstacles: Obstacle[];
      try {
        obstacles = collectObstacles(document, viewport);
      } catch {
        obstacles = [];
      }

      const result = computePlacement({
        viewport,
        button: sizeRef.current,
        obstacles,
        isMobile,
        candidates,
        preferred,
        remembered: readMemory(isMobile),
      });

      if (result.position !== positionRef.current) {
        positionRef.current = result.position;
        setPosition(result.position);
      }
      writeMemory(result.position, isMobile);
    };

    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, RECOMPUTE_DEBOUNCE);
    };

    // Initial placement (after paint so the launcher can be measured).
    recompute();

    // Runtime adaptation: watch the DOM for new floaters/banners/route changes, and the viewport.
    const observer = new MutationObserver(debounced);
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
      });
    }
    window.addEventListener('resize', debounced);
    window.addEventListener('orientationchange', debounced);
    window.addEventListener('popstate', debounced); // SPA back/forward → re-key memory + re-place

    const mql = window.matchMedia(MOBILE_QUERY(mobileBreakpoint));
    const onMedia = () => debounced();
    // addEventListener is the modern API; addListener the legacy Safari fallback.
    if (mql.addEventListener) mql.addEventListener('change', onMedia);
    else if (mql.addListener) mql.addListener(onMedia);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', debounced);
      window.removeEventListener('orientationchange', debounced);
      window.removeEventListener('popstate', debounced);
      if (mql.removeEventListener) mql.removeEventListener('change', onMedia);
      else if (mql.removeListener) mql.removeListener(onMedia);
    };
  }, [preferred, autoPlace, mobileMode, mobileBreakpoint]);

  return { position, anchorRef };
}

function positionStyle(position: Position, margin = 24): CSSProperties {
  switch (position) {
    case 'bottom-right':
      return { bottom: margin, right: margin };
    case 'bottom-left':
      return { bottom: margin, left: margin };
    case 'top-right':
      return { top: margin, right: margin };
    case 'top-left':
      return { top: margin, left: margin };
    case 'right-edge-tab':
      return { top: '50%', right: 0, transform: 'translateY(-50%)' };
    default:
      return { bottom: margin, right: margin };
  }
}

export function SayFixWidget({
  repo,
  label = 'Report a problem',
  showIcon = true,
  position = 'bottom-right',
  color = '#1c1917',
  autoPlace = true,
  mobileMode = 'edge-tab',
  mobileBreakpoint = 640,
}: SayFixWidgetProps) {
  const sayfixUrl = `https://sayfix.vercel.app/welcome?product=${encodeURIComponent(repo)}`;
  const { position: placed, anchorRef } = usePlacement(
    position,
    autoPlace,
    mobileMode,
    mobileBreakpoint,
  );
  const [expanded, setExpanded] = useState(false);

  const isEdgeTab = placed === 'right-edge-tab';
  const showLabel = !isEdgeTab || expanded;

  const style: CSSProperties = {
    position: 'fixed',
    ...positionStyle(placed),
    zIndex: 2147483000,
    display: 'inline-flex',
    alignItems: 'center',
    gap: showLabel ? 8 : 0,
    background: color,
    color: '#ffffff',
    padding: isEdgeTab && !expanded ? '12px 12px' : '12px 18px',
    // Edge-tab rounds only its left side (it's flush to the right viewport edge).
    borderRadius: isEdgeTab ? '9999px 0 0 9999px' : 9999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
    fontWeight: 500,
    fontSize: 15,
    lineHeight: 1.2,
    fontFamily: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'padding 150ms ease, gap 150ms ease',
    maxWidth: isEdgeTab && !expanded ? 48 : 360,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  };

  return (
    <a
      ref={anchorRef}
      data-sayfix-widget=""
      href={sayfixUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
      aria-label={label}
      title="Report a problem — opens SayFix in a new tab"
      onMouseEnter={() => isEdgeTab && setExpanded(true)}
      onMouseLeave={() => isEdgeTab && setExpanded(false)}
      onFocus={() => isEdgeTab && setExpanded(true)}
      onBlur={() => isEdgeTab && setExpanded(false)}
    >
      {showIcon && <MessageSquare size={18} />}
      {showLabel && label}
    </a>
  );
}
