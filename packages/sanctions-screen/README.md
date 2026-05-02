# @caistech/sanctions-screen

Multi-list sanctions screening for entities and persons. Provider pattern with built-in fetchers for major public lists, plus a pluggable provider interface for paid / authenticated lists.

Used by F2K CMPP self-registration **Gate G6 (Beneficial ownership & sanctions)** and any other portfolio project with AML / sanctions compliance obligations.

## Install

```bash
pnpm add @caistech/sanctions-screen --legacy-peer-deps
```

## Lists supported

| List | Source | Live fetch | Notes |
|------|--------|-----------|-------|
| **OFAC SDN** | https://www.treasury.gov/ofac/downloads/sdn.csv | Yes | Public CSV, no auth |
| **UN Consolidated** | https://scsanctions.un.org/resources/xml/en/consolidated.xml | Yes | Public XML, no auth |
| **UK HM Treasury (OFSI)** | Azure-hosted CSV | Yes | Public CSV, no auth |
| **AU DFAT** | DFAT-published XLSX | **Stub** | XLSX needs `xlsx` lib in consumer; provider stub throws clear error |
| **EU sanctions** | EU FSF | **Stub** | Requires registration; consumer must inject auth'd download |

Stubs throw a clear error when fetched — the screener captures these in `fetchErrors[]` rather than silently passing.

## Usage

```ts
import {
  createScreener,
  createOfacSdnProvider,
  createUnConsolidatedProvider,
  createUkHmTreasuryProvider,
} from '@caistech/sanctions-screen';

// In-memory cache (use a real cache adapter in production — see below)
const memCache = new Map<string, { at: string; data: any[] }>();
const cache = {
  get: async (k: string) => memCache.get(k) ?? null,
  set: async (k: string, v: any) => { memCache.set(k, v); },
};

const screener = createScreener([
  createOfacSdnProvider({ cache }),
  createUnConsolidatedProvider({ cache }),
  createUkHmTreasuryProvider({ cache }),
]);

const result = await screener.screen({
  subjects: [
    { name: 'Acme Modular Building Ltd', type: 'entity' },
    { name: 'Wang Wei', type: 'person', aliases: ['王伟'] },
  ],
  matchMode: 'balanced',
});

// result.results[0].clean === true  (no sanctions hits)
// result.results[1].hits === [{ list: 'ofac_sdn', matchType: 'fuzzy', matchScore: 0.94, ... }]
// result.fetchErrors === []
// result.listVersions.ofac_sdn === { refreshed_at: '2026-05-02T...', entry_count: 13284 }
```

## Match modes

| Mode | Logic | False-positive | Recall |
|------|-------|---------------|--------|
| `strict` | Exact normalised + alias only | Lowest | Lowest |
| `balanced` (default) | Strict + Jaro-Winkler ≥ 0.92 | Low | Medium |
| `lenient` | Balanced + Jaro-Winkler ≥ 0.85 + token-overlap ≥ 0.6 | Medium | Highest |

For F2K CMPP G6: use `balanced` for automated screening. Any hit triggers human review by F2K compliance — never auto-NO-GO without a person looking at the matched entry. (The cost of a false positive is a delayed manufacturer; the cost of a false negative is a sanctions breach.)

## Caching

Provide any object matching `CacheAdapter`:

```ts
interface CacheAdapter {
  get(key: string): Promise<{ at: string; data: NormalisedSanctionsEntry[] } | null>;
  set(key: string, value: { at: string; data: NormalisedSanctionsEntry[] }): Promise<void>;
}
```

Default TTL: 24h per list. Adjust per provider:

```ts
createOfacSdnProvider({ cache, cacheTtlMs: 6 * 60 * 60 * 1000 });  // 6h
```

For production: back this with Supabase, Redis, or filesystem. Don't refetch the OFAC SDN list (~5MB, ~13k entries) per request.

## Force refresh

```ts
await screener.refresh();              // refresh all
await screener.refresh('ofac_sdn');    // refresh one
```

Useful as a daily cron — run once at 04:00 in your timezone before the work day.

## Custom providers

For lists not covered (AU DFAT, EU, regional lists, in-house watchlists), implement the `SanctionsListProvider` interface:

```ts
import type { SanctionsListProvider } from '@caistech/sanctions-screen';

const auDfatProvider: SanctionsListProvider = {
  list: 'au_dfat',
  async fetch() {
    // Fetch XLSX, parse with `xlsx` lib, normalise to NormalisedSanctionsEntry[]
    return [...];
  },
  lastRefreshed: () => myCache.lastRefreshAt,
};

const screener = createScreener([..., auDfatProvider]);
```

## Returns

`SanctionsScreenResult` — see `src/types.ts`. Key fields:

- `results[].clean: boolean` — true when subject has zero hits across all lists
- `results[].hits[]` — each hit includes the matched list, match type (`exact` / `alias` / `fuzzy` / `token_overlap`), score, and the full normalised entry (with list reference URL for human verification)
- `fetchErrors[]` — any list that failed to fetch (always check this — empty hits + failed fetch ≠ clean)
- `listVersions[]` — when each list was last refreshed + entry count (audit trail)

## Versioning

Pre-1.0 — break freely.
