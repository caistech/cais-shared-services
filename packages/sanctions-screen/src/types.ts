/**
 * @caistech/sanctions-screen — Types.
 */

export type SanctionsList =
  | 'ofac_sdn'
  | 'un_consolidated'
  | 'au_dfat'
  | 'eu_sanctions'
  | 'uk_hm_treasury';

export type SubjectType = 'entity' | 'person';

export interface ScreenSubject {
  name: string;
  type: SubjectType;
  /** ISO 3166-1 alpha-2. Optional — narrows match scoring. */
  nationality?: string;
  /** Optional aliases / trading names known for this subject. */
  aliases?: string[];
}

export interface SanctionsScreenRequest {
  subjects: ScreenSubject[];
  /** Lists to query. Default: all configured providers. */
  lists?: SanctionsList[];
  /**
   * Match strictness.
   *   strict   — exact normalised-name match only (lowest false-positive)
   *   balanced — exact + alias + ≥0.92 fuzzy (default; recommended)
   *   lenient  — also includes ≥0.85 fuzzy + token-overlap (highest recall)
   */
  matchMode?: 'strict' | 'balanced' | 'lenient';
}

export interface NormalisedSanctionsEntry {
  list: SanctionsList;
  primary_name: string;
  aliases: string[];
  type: SubjectType;
  address?: string;
  nationality?: string;
  /** Reference id within the source list (e.g. OFAC SDN id). */
  list_reference: string;
  list_url?: string;
  notes?: string;
}

export interface SanctionsHit {
  list: SanctionsList;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'token_overlap';
  matchScore: number;
  matchedEntry: NormalisedSanctionsEntry;
}

export interface SubjectScreenResult {
  subject: ScreenSubject;
  hits: SanctionsHit[];
  clean: boolean;
}

export interface SanctionsScreenResult {
  results: SubjectScreenResult[];
  listsChecked: SanctionsList[];
  fetchErrors: Array<{ list: SanctionsList; error: string }>;
  /** Per-list refresh metadata. */
  listVersions: Partial<Record<SanctionsList, { refreshed_at: string; entry_count: number }>>;
}

export interface SanctionsListProvider {
  list: SanctionsList;
  /** Fetch (or use cached) entries from the source. */
  fetch(): Promise<NormalisedSanctionsEntry[]>;
  /** Force refresh from source, ignoring cache. */
  refresh?(): Promise<NormalisedSanctionsEntry[]>;
  /** When the cache was last populated. Null when never fetched. */
  lastRefreshed?(): Date | null;
}

export interface CacheAdapter {
  get(key: string): Promise<{ at: string; data: NormalisedSanctionsEntry[] } | null>;
  set(key: string, value: { at: string; data: NormalisedSanctionsEntry[] }): Promise<void>;
}
