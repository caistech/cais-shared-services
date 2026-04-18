"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatAbn, type AbnLookupResult } from "@/lib/abn";
import { CheckCircle, Loader2, Search, Building2 } from "lucide-react";

interface NameSearchResult {
  abn: string;
  name: string;
  nameType: string;
  state: string;
  postcode: string;
  score: number;
  isCurrent: boolean;
}

interface AbnLookupFieldProps {
  name?: string;
  defaultValue?: string;
  label?: string;
  onResult?: (result: AbnLookupResult | null) => void;
  onSelect?: (selected: { abn: string; name: string; state: string }) => void;
}

export function AbnLookupField({
  name = "abn",
  defaultValue = "",
  label = "Company / ABN Search",
  onResult,
  onSelect,
}: AbnLookupFieldProps) {
  const [query, setQuery] = useState(defaultValue);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<NameSearchResult[]>([]);
  const [selected, setSelected] = useState<AbnLookupResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchByName = useCallback(async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/abn-lookup?name=${encodeURIComponent(searchTerm)}`
      );
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setShowDropdown(data.results.length > 0);
      }
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const selectResult = useCallback(
    async (result: NameSearchResult) => {
      setShowDropdown(false);
      setQuery(result.name);
      setIsSearching(true);
      try {
        const res = await fetch(`/api/abn-lookup?abn=${result.abn}`);
        const data = await res.json();
        if (data.abn) {
          setSelected(data);
          onResult?.(data);
          onSelect?.({ abn: data.abn, name: data.entityName, state: data.state });
        }
      } catch {
        // keep name search result
      } finally {
        setIsSearching(false);
      }
    },
    [onResult, onSelect]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const digits = val.replace(/\s/g, "");
    if (/^\d+$/.test(digits) && digits.length === 11) {
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const res = await fetch(`/api/abn-lookup?abn=${digits}`);
          const data = await res.json();
          if (data.abn) {
            setSelected(data);
            setQuery(data.entityName);
            onResult?.(data);
            onSelect?.({ abn: data.abn, name: data.entityName, state: data.state });
          }
        } finally {
          setIsSearching(false);
        }
      }, 300);
      return;
    }

    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => searchByName(val), 400);
    } else {
      setResults([]);
      setShowDropdown(false);
    }
  }

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <Label htmlFor={`${name}_search`}>{label}</Label>
      <div className="relative">
        <Input
          id={`${name}_search`}
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && !selected && setShowDropdown(true)}
          placeholder="Start typing a company name or ABN..."
          className="pr-8"
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : selected ? (
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      <input type="hidden" name={name} value={selected?.abn ?? query} />
      {selected && (
        <>
          <input type="hidden" name="entity_name_from_abn" value={selected.entityName} />
          <input type="hidden" name="entity_type_from_abn" value={selected.entityType} />
          <input type="hidden" name="acn" value={selected.acn} />
          <input type="hidden" name="abn_state" value={selected.state} />
          <input type="hidden" name="abn_postcode" value={selected.postcode} />
        </>
      )}

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-64 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.abn}-${i}`}
              type="button"
              onClick={() => selectResult(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent flex items-start gap-3 border-b last:border-0 transition-colors"
            >
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  ABN: {formatAbn(r.abn)} | {r.state} {r.postcode}
                  {r.nameType === "Business Name" && " | Trading Name"}
                </p>
              </div>
              {!r.isCurrent && (
                <Badge variant="outline" className="shrink-0 text-xs bg-red-50 text-red-600">
                  Inactive
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-emerald-900">{selected.entityName}</span>
            <Badge
              variant="outline"
              className={
                selected.abnStatus === "Active"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }
            >
              {selected.abnStatus}
            </Badge>
          </div>
          <p className="text-xs text-emerald-700">
            ABN: {formatAbn(selected.abn)}
            {selected.acn && ` | ACN: ${selected.acn}`}
            {` | ${selected.entityType}`}
            {selected.state && ` | ${selected.state} ${selected.postcode}`}
          </p>
          {selected.businessNames.length > 0 && (
            <p className="text-xs text-emerald-700">
              Trading as: {selected.businessNames.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
