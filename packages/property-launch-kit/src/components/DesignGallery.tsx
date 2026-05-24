"use client";

/**
 * Home-designs grid with lightbox-on-click. Each design renders as a
 * card with hero image, tag, name, size/beds, description, price
 * anchor, and "View plan →" link. The hero image is click-to-expand
 * into a full-screen lightbox.
 *
 * Originally extracted from f2k-projects' Seafields Home Designs
 * section.
 *
 * Styling: uses Tailwind utility classes including F2K brand colours
 * (`text-[#00B5AD]` etc). Consumers using a different brand palette
 * can pass `accentClassName` to override the accent colour, or just
 * extend Tailwind to recognise these arbitrary values.
 */

import { useState } from "react";

export interface Design {
  name: string;
  size: string;
  beds: string;
  tag: string;
  detail: string;
  /** Hero image URL — shown as the card preview. Null for placeholders. */
  hero: string | null;
  /** Primary plan URL (PDF or image) — opened in a new tab when the
   * "View plan →" link is clicked. Null hides the link. */
  plan: string | null;
  /** Optional secondary asset (e.g. elevations PDF). */
  secondary?: { label: string; href: string };
  /** Price anchor shown on the card. */
  priceFrom: string;
  /** Label shown before the price. Defaults to "H&L from". Set per design
   * when the basis differs — e.g. "House only — from" for ancillary
   * dwellings priced without land, or "" to show the price with no prefix
   * (useful for "POA" / "Price on application"). */
  priceLabel?: string;
  /** When true, the card shows a "Floor plan pending" placeholder
   * instead of the hero image, and the plan link is disabled. */
  placeholder?: boolean;
}

interface Props {
  designs: Design[];
  /** Tailwind class for accent colour. Default is F2K teal. */
  accentClassName?: string;
}

export default function DesignGallery({
  designs,
  accentClassName = "text-[#00B5AD]",
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {designs.map((d) => (
          <div
            key={d.name}
            className="bg-white border border-black/5 flex flex-col"
          >
            {d.hero && !d.placeholder ? (
              <button
                type="button"
                onClick={() => setExpanded(d.hero)}
                className="aspect-[4/3] bg-[#F0EDE6] border-b border-black/5 overflow-hidden flex items-center justify-center hover:opacity-90 transition-opacity cursor-zoom-in"
                aria-label={`Expand ${d.name} floor plan`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.hero}
                  alt={`${d.name} floor plan preview`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="aspect-[4/3] bg-[#F0EDE6] border-b border-black/5 flex items-center justify-center">
                <span className="font-archivo text-xs text-slate-500 uppercase tracking-wider">
                  Floor plan pending
                </span>
              </div>
            )}
            <div className="p-5 flex-1 flex flex-col">
              <p
                className={`font-ibm-mono text-[0.55rem] tracking-[0.3em] uppercase ${accentClassName} mb-2`}
              >
                {d.tag}
              </p>
              <h3 className="font-playfair text-xl font-black text-deep-blue mb-1">
                {d.name}
              </h3>
              <p className="font-archivo text-xs text-slate-600 uppercase tracking-wider mb-3">
                {d.beds} · {d.size}
              </p>
              <p className="font-archivo text-sm text-slate-700 leading-relaxed mb-4 flex-1">
                {d.detail}
              </p>
              <div className="mt-auto pt-3 border-t border-black/5 flex items-center justify-between gap-2 flex-wrap">
                <span className="font-archivo text-sm text-deep-blue">
                  {(d.priceLabel ?? "H&L from") !== "" && (
                    <>
                      <span className="text-slate-500 text-xs">
                        {d.priceLabel ?? "H&L from"}
                      </span>{" "}
                    </>
                  )}
                  <strong>{d.priceFrom}</strong>
                </span>
                <div className="flex items-center gap-3">
                  {d.plan ? (
                    <a
                      href={d.plan}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`font-archivo text-xs ${accentClassName} hover:underline font-semibold`}
                    >
                      View plan →
                    </a>
                  ) : (
                    <span className="font-archivo text-xs text-slate-400">
                      Plan pending
                    </span>
                  )}
                  {d.secondary && (
                    <a
                      href={d.secondary.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`font-archivo text-xs text-slate-600 hover:${accentClassName} hover:underline`}
                    >
                      {d.secondary.label} →
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setExpanded(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded floor plan"
        >
          <button
            type="button"
            onClick={() => setExpanded(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-light z-[101]"
            aria-label="Close"
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expanded}
            alt="Floor plan — enlarged view"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
