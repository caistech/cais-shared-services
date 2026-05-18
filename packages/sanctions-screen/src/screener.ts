/**
 * @caistech/sanctions-screen — Screener orchestration.
 */

import { jaroWinkler, normaliseName, tokenOverlap } from './matching.js';
import type {
  NormalisedSanctionsEntry,
  SanctionsHit,
  SanctionsList,
  SanctionsListProvider,
  SanctionsScreenRequest,
  SanctionsScreenResult,
  ScreenSubject,
  SubjectScreenResult,
} from './types.js';

const FUZZY_THRESHOLD_BALANCED = 0.92;
const FUZZY_THRESHOLD_LENIENT = 0.85;
const TOKEN_OVERLAP_THRESHOLD = 0.6;

export interface SanctionsScreener {
  screen(req: SanctionsScreenRequest): Promise<SanctionsScreenResult>;
  refresh(list?: SanctionsList): Promise<void>;
  getCacheStatus(): Partial<Record<SanctionsList, { refreshed_at: string; entry_count: number } | null>>;
}

export function createScreener(providers: SanctionsListProvider[]): SanctionsScreener {
  const providerMap = new Map<SanctionsList, SanctionsListProvider>();
  const cachedEntries = new Map<SanctionsList, NormalisedSanctionsEntry[]>();
  for (const p of providers) providerMap.set(p.list, p);

  async function loadList(list: SanctionsList): Promise<NormalisedSanctionsEntry[]> {
    if (cachedEntries.has(list)) return cachedEntries.get(list)!;
    const provider = providerMap.get(list);
    if (!provider) return [];
    const entries = await provider.fetch();
    cachedEntries.set(list, entries);
    return entries;
  }

  return {
    async screen(req) {
      const targetLists: SanctionsList[] = req.lists ?? [...providerMap.keys()];
      const matchMode = req.matchMode ?? 'balanced';

      const fetchErrors: Array<{ list: SanctionsList; error: string }> = [];
      const listVersions: Partial<Record<SanctionsList, { refreshed_at: string; entry_count: number }>> = {};
      const listsChecked: SanctionsList[] = [];

      const loaded: Array<{ list: SanctionsList; entries: NormalisedSanctionsEntry[] }> = [];
      for (const list of targetLists) {
        try {
          const entries = await loadList(list);
          loaded.push({ list, entries });
          listsChecked.push(list);
          const provider = providerMap.get(list);
          const refreshed = provider?.lastRefreshed?.() ?? null;
          listVersions[list] = {
            refreshed_at: refreshed?.toISOString() ?? new Date(0).toISOString(),
            entry_count: entries.length,
          };
        } catch (err) {
          fetchErrors.push({
            list,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const results: SubjectScreenResult[] = req.subjects.map((subject) => {
        const hits: SanctionsHit[] = [];
        for (const { entries } of loaded) {
          for (const entry of entries) {
            const hit = matchSubjectAgainstEntry(subject, entry, matchMode);
            if (hit) hits.push(hit);
          }
        }
        return { subject, hits, clean: hits.length === 0 };
      });

      return { results, listsChecked, fetchErrors, listVersions };
    },

    async refresh(list) {
      if (list) {
        const provider = providerMap.get(list);
        if (provider?.refresh) {
          const fresh = await provider.refresh();
          cachedEntries.set(list, fresh);
        } else {
          cachedEntries.delete(list);
        }
        return;
      }
      cachedEntries.clear();
      await Promise.all(
        [...providerMap.values()].map(async (p) => {
          if (p.refresh) {
            try {
              cachedEntries.set(p.list, await p.refresh());
            } catch {
              // swallow; reported on next screen() call
            }
          }
        }),
      );
    },

    getCacheStatus() {
      const out: Partial<Record<SanctionsList, { refreshed_at: string; entry_count: number } | null>> = {};
      for (const [list, provider] of providerMap.entries()) {
        const cached = cachedEntries.get(list);
        const refreshed = provider.lastRefreshed?.();
        out[list] = cached
          ? {
              refreshed_at: refreshed?.toISOString() ?? new Date(0).toISOString(),
              entry_count: cached.length,
            }
          : null;
      }
      return out;
    },
  };
}

function matchSubjectAgainstEntry(
  subject: ScreenSubject,
  entry: NormalisedSanctionsEntry,
  matchMode: 'strict' | 'balanced' | 'lenient',
): SanctionsHit | null {
  // Type filter — don't match a person against an entity record and vice versa
  if (subject.type !== entry.type) return null;

  const normSubject = normaliseName(subject.name);
  const normPrimary = normaliseName(entry.primary_name);

  // 1. Exact normalised match
  if (normSubject === normPrimary) {
    return {
      list: entry.list,
      matchType: 'exact',
      matchScore: 1,
      matchedEntry: entry,
    };
  }

  // 2. Alias exact match
  for (const alias of entry.aliases) {
    if (normaliseName(alias) === normSubject) {
      return {
        list: entry.list,
        matchType: 'alias',
        matchScore: 1,
        matchedEntry: entry,
      };
    }
  }

  // Subject's own aliases
  if (subject.aliases) {
    for (const a of subject.aliases) {
      const na = normaliseName(a);
      if (na === normPrimary) {
        return { list: entry.list, matchType: 'alias', matchScore: 1, matchedEntry: entry };
      }
      for (const ea of entry.aliases) {
        if (normaliseName(ea) === na) {
          return { list: entry.list, matchType: 'alias', matchScore: 1, matchedEntry: entry };
        }
      }
    }
  }

  if (matchMode === 'strict') return null;

  // 3. Fuzzy match — Jaro-Winkler against primary + aliases
  const fuzzyThreshold = matchMode === 'balanced' ? FUZZY_THRESHOLD_BALANCED : FUZZY_THRESHOLD_LENIENT;
  let bestFuzzy = jaroWinkler(normSubject, normPrimary);
  for (const alias of entry.aliases) {
    const score = jaroWinkler(normSubject, normaliseName(alias));
    if (score > bestFuzzy) bestFuzzy = score;
  }
  if (bestFuzzy >= fuzzyThreshold) {
    return {
      list: entry.list,
      matchType: 'fuzzy',
      matchScore: bestFuzzy,
      matchedEntry: entry,
    };
  }

  // 4. Token overlap — only in lenient mode
  if (matchMode === 'lenient') {
    const overlap = Math.max(
      tokenOverlap(normSubject, normPrimary),
      ...entry.aliases.map((a) => tokenOverlap(normSubject, normaliseName(a))),
    );
    if (overlap >= TOKEN_OVERLAP_THRESHOLD) {
      return {
        list: entry.list,
        matchType: 'token_overlap',
        matchScore: overlap,
        matchedEntry: entry,
      };
    }
  }

  return null;
}
