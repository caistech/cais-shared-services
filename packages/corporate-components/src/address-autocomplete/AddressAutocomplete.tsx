"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  forwardSearch,
  reverseSearch,
  parseCoordinates,
  featureToGeocodedAddress,
} from "@caistech/mapbox";
import type { MapboxFeature, GeocodedAddress } from "@caistech/mapbox";

// Dependency-light by design: no shadcn/ui Input, no lucide-react. The only
// runtime dep is @caistech/mapbox (the Geocoding layer, token via
// NEXT_PUBLIC_MAPBOX_TOKEN). Styling uses neutral Tailwind utilities so it
// drops into any consumer; override the input via `inputClassName`.

export interface AddressAutocompleteProps {
  /** Fired when the user picks a suggestion. */
  onSelect: (address: GeocodedAddress) => void;
  placeholder?: string;
  defaultValue?: string;
  /** Replaces the default input styling so it matches the host form. */
  inputClassName?: string;
  id?: string;
  name?: string;
}

const DEFAULT_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-4 w-4 shrink-0 text-gray-400"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-6-5.686-6-10a6 6 0 1112 0c0 4.314-6 10-6 10z"
      />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

export function AddressAutocomplete({
  onSelect,
  placeholder = "Start typing an address…",
  defaultValue = "",
  inputClassName,
  id,
  name,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const coords = parseCoordinates(q);
      const results = coords
        ? await reverseSearch(coords.lat, coords.lng)
        : await forwardSearch(q);
      setSuggestions(results);
      setOpen(results.length > 0);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(feature: MapboxFeature) {
    const geocoded = featureToGeocodedAddress(feature);
    setQuery(geocoded.formatted_address);
    setSuggestions([]);
    setOpen(false);
    onSelect(geocoded);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        name={name}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName ?? DEFAULT_INPUT_CLASS}
      />

      {open && suggestions.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={() => handleSelect(feature)}
            >
              <PinIcon />
              <span className="truncate">{feature.place_name}</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
        </div>
      )}
    </div>
  );
}
