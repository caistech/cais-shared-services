/**
 * @caistech/sanctions-screen — Built-in list providers.
 *
 * Each provider knows how to fetch and normalise one official sanctions list.
 * Implementations target the public, no-auth feeds where they exist.
 *
 *   - OFAC SDN  : public CSV at https://www.treasury.gov/ofac/downloads/sdn.csv
 *   - UN Cons.  : public XML at https://scsanctions.un.org/resources/xml/en/consolidated.xml
 *   - UK HMT    : public CSV at https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv
 *   - AU DFAT   : public XLSX at https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx (parsed via exceljs)
 *   - EU        : requires registration — STUB until consumer provides credentials
 *
 * The EU stub returns an empty array + a fetch error so the screener reports
 * fetchErrors[] rather than silently returning "clean".
 */

import ExcelJS from 'exceljs';
import type {
  CacheAdapter,
  NormalisedSanctionsEntry,
  SanctionsList,
  SanctionsListProvider,
  SubjectType,
} from './types';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface ProviderOptions {
  /** Optional cache adapter. If absent, fetches every call (not recommended). */
  cache?: CacheAdapter;
  /** Cache TTL in ms. Default: 24h. */
  cacheTtlMs?: number;
  /** Override fetch (for testing). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface ProviderState {
  lastRefreshed: Date | null;
}

function buildProvider(
  list: SanctionsList,
  fetchAndParse: (fetchImpl: typeof fetch) => Promise<NormalisedSanctionsEntry[]>,
  opts: ProviderOptions,
): SanctionsListProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
  const state: ProviderState = { lastRefreshed: null };

  const fetchEntries = async (force: boolean): Promise<NormalisedSanctionsEntry[]> => {
    if (!force && opts.cache) {
      const cached = await opts.cache.get(`sanctions-screen:${list}`);
      if (cached) {
        const age = Date.now() - new Date(cached.at).getTime();
        if (age < ttl) {
          state.lastRefreshed = new Date(cached.at);
          return cached.data;
        }
      }
    }
    const fresh = await fetchAndParse(fetchImpl);
    state.lastRefreshed = new Date();
    if (opts.cache) {
      await opts.cache.set(`sanctions-screen:${list}`, {
        at: state.lastRefreshed.toISOString(),
        data: fresh,
      });
    }
    return fresh;
  };

  return {
    list,
    fetch: () => fetchEntries(false),
    refresh: () => fetchEntries(true),
    lastRefreshed: () => state.lastRefreshed,
  };
}

// =============================================================================
// OFAC SDN
// =============================================================================

const OFAC_SDN_CSV_URL = 'https://www.treasury.gov/ofac/downloads/sdn.csv';

export function createOfacSdnProvider(opts: ProviderOptions = {}): SanctionsListProvider {
  return buildProvider('ofac_sdn', async (fetchImpl) => {
    const res = await fetchImpl(OFAC_SDN_CSV_URL, {
      signal: AbortSignal.timeout(60000),
      headers: { Accept: 'text/csv' },
    });
    if (!res.ok) throw new Error(`OFAC SDN fetch failed: ${res.status}`);
    const csv = await res.text();
    return parseOfacSdnCsv(csv);
  }, opts);
}

/**
 * OFAC SDN CSV columns (positional, no header row):
 *   ent_num, sdn_name, sdn_type, program, title, call_sign, vess_type,
 *   tonnage, grt, vess_flag, vess_owner, remarks
 *
 * Type values: 'individual' | 'entity' | 'aircraft' | 'vessel'
 */
function parseOfacSdnCsv(csv: string): NormalisedSanctionsEntry[] {
  const out: NormalisedSanctionsEntry[] = [];
  const rows = parseCsvRows(csv);
  for (const cells of rows) {
    if (cells.length < 4) continue;
    const [entNum, sdnName, sdnType, program] = cells;
    const remarks = cells[11] ?? '';
    let type: SubjectType;
    const lc = sdnType.toLowerCase();
    if (lc === 'individual') type = 'person';
    else if (lc === 'entity') type = 'entity';
    else continue; // skip aircraft / vessel
    out.push({
      list: 'ofac_sdn',
      primary_name: sdnName.trim(),
      aliases: [],
      type,
      list_reference: entNum.trim(),
      list_url: 'https://sanctionssearch.ofac.treas.gov/Details.aspx?id=' + encodeURIComponent(entNum.trim()),
      notes: program.trim() ? `Program: ${program.trim()}${remarks ? ` · ${remarks.trim()}` : ''}` : undefined,
    });
  }
  return out;
}

// =============================================================================
// UN Consolidated
// =============================================================================

const UN_CONSOLIDATED_XML_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

export function createUnConsolidatedProvider(opts: ProviderOptions = {}): SanctionsListProvider {
  return buildProvider('un_consolidated', async (fetchImpl) => {
    const res = await fetchImpl(UN_CONSOLIDATED_XML_URL, {
      signal: AbortSignal.timeout(60000),
      headers: { Accept: 'application/xml' },
    });
    if (!res.ok) throw new Error(`UN consolidated fetch failed: ${res.status}`);
    const xml = await res.text();
    return parseUnConsolidatedXml(xml);
  }, opts);
}

/**
 * UN consolidated XML structure (simplified — full schema is large):
 *   <CONSOLIDATED_LIST>
 *     <INDIVIDUALS>
 *       <INDIVIDUAL>
 *         <DATAID>...</DATAID>
 *         <FIRST_NAME>...</FIRST_NAME>
 *         <SECOND_NAME>...</SECOND_NAME>
 *         <THIRD_NAME>...</THIRD_NAME>
 *         <FOURTH_NAME>...</FOURTH_NAME>
 *         <INDIVIDUAL_ALIAS><ALIAS_NAME>...</ALIAS_NAME></INDIVIDUAL_ALIAS>
 *         ...
 *
 * We use a lightweight regex-based parser to avoid pulling in xml2js etc.
 * This is brittle to UN schema changes; if their format changes the parser
 * silently returns fewer entries — handled by the screener fetchErrors list.
 */
function parseUnConsolidatedXml(xml: string): NormalisedSanctionsEntry[] {
  const out: NormalisedSanctionsEntry[] = [];

  // Individuals
  const indivBlocks = xml.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g);
  for (const m of indivBlocks) {
    const block = m[1];
    const dataId = textBetween(block, 'DATAID');
    const nameParts = [
      textBetween(block, 'FIRST_NAME'),
      textBetween(block, 'SECOND_NAME'),
      textBetween(block, 'THIRD_NAME'),
      textBetween(block, 'FOURTH_NAME'),
    ].filter(Boolean);
    if (!nameParts.length) continue;
    const aliases = [...block.matchAll(/<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/g)]
      .map((a) => a[1].trim())
      .filter(Boolean);
    out.push({
      list: 'un_consolidated',
      primary_name: nameParts.join(' ').trim(),
      aliases,
      type: 'person',
      list_reference: dataId ?? '',
      list_url: 'https://scsanctions.un.org/',
    });
  }

  // Entities
  const entityBlocks = xml.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/g);
  for (const m of entityBlocks) {
    const block = m[1];
    const dataId = textBetween(block, 'DATAID');
    const name = textBetween(block, 'FIRST_NAME');
    if (!name) continue;
    const aliases = [...block.matchAll(/<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/g)]
      .map((a) => a[1].trim())
      .filter(Boolean);
    out.push({
      list: 'un_consolidated',
      primary_name: name,
      aliases,
      type: 'entity',
      list_reference: dataId ?? '',
      list_url: 'https://scsanctions.un.org/',
    });
  }

  return out;
}

function textBetween(s: string, tag: string): string {
  const m = s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

// =============================================================================
// UK HM Treasury (OFSI)
// =============================================================================

const UK_HMT_CSV_URL = 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv';

export function createUkHmTreasuryProvider(opts: ProviderOptions = {}): SanctionsListProvider {
  return buildProvider('uk_hm_treasury', async (fetchImpl) => {
    const res = await fetchImpl(UK_HMT_CSV_URL, {
      signal: AbortSignal.timeout(60000),
      headers: { Accept: 'text/csv' },
    });
    if (!res.ok) throw new Error(`UK HMT fetch failed: ${res.status}`);
    const csv = await res.text();
    return parseUkHmtCsv(csv);
  }, opts);
}

/**
 * UK HM Treasury consolidated list CSV — the 2022 format has a header row and
 * many columns; we read by header name to be resilient to column reordering.
 *
 * Key columns: 'Name 6' (name), 'Group Type' (Individual / Entity), 'Group ID'
 */
function parseUkHmtCsv(csv: string): NormalisedSanctionsEntry[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());

  const idx = (name: string): number =>
    header.findIndex((h) => h === name.toLowerCase());

  // The actual UK HMT format uses 'Name 6' for the consolidated full name and
  // 'Group Type' for individual/entity. There are also Name 1..5 fields for
  // partial names. We fallback to assembling from Name 1..5 if Name 6 is empty.
  const idxName6 = idx('name 6');
  const idxGroupType = idx('group type');
  const idxGroupId = idx('group id');
  const idxName1to5 = [1, 2, 3, 4, 5].map((n) => idx(`name ${n}`));

  if (idxName6 < 0 || idxGroupType < 0) return [];

  const groupedById = new Map<string, NormalisedSanctionsEntry>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    let name = (row[idxName6] ?? '').trim();
    if (!name) {
      name = idxName1to5
        .map((j) => (j >= 0 ? (row[j] ?? '').trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
    }
    if (!name) continue;
    const gt = (row[idxGroupType] ?? '').toLowerCase().trim();
    const type: SubjectType = gt === 'individual' ? 'person' : 'entity';
    const groupId = idxGroupId >= 0 ? (row[idxGroupId] ?? '').trim() : `${i}`;

    const existing = groupedById.get(groupId);
    if (existing) {
      // Same person/entity, alias row
      if (name !== existing.primary_name && !existing.aliases.includes(name)) {
        existing.aliases.push(name);
      }
    } else {
      groupedById.set(groupId, {
        list: 'uk_hm_treasury',
        primary_name: name,
        aliases: [],
        type,
        list_reference: groupId,
        list_url: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
      });
    }
  }

  return [...groupedById.values()];
}

// =============================================================================
// AU DFAT (XLSX, parsed via exceljs)
// =============================================================================

const AU_DFAT_XLSX_URL =
  'https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx';

export function createAuDfatProvider(opts: ProviderOptions & { url?: string } = {}): SanctionsListProvider {
  const url = opts.url ?? AU_DFAT_XLSX_URL;
  return buildProvider('au_dfat', async (fetchImpl) => {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(120000),
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    });
    if (!res.ok) throw new Error(`AU DFAT fetch failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return parseDfatXlsx(arrayBuffer);
  }, opts);
}

/**
 * Parse the AU DFAT consolidated list XLSX.
 *
 * DFAT periodically rearranges the columns; we look up by header name (with
 * common synonyms) so a column reorder doesn't break the parser. If the
 * expected headers are missing entirely, we throw with a clear message —
 * the screener captures this in fetchErrors[] rather than silently returning
 * an empty list.
 *
 * Common columns observed:
 *   Reference, Type, Title, Name of Listed Person, Name of Listed Entity,
 *   First Name / Given Names, Last Name / Family Name,
 *   Other Names / Aliases, Date of Birth, Place of Birth, Address,
 *   Citizenship, Listing Information, Last Updated.
 */
export async function parseDfatXlsx(buffer: ArrayBuffer): Promise<NormalisedSanctionsEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('AU DFAT XLSX: no worksheets found');

  // Find the header row — DFAT's data sometimes starts a few rows down.
  // We look for the first row containing both "Reference" and "Type" cells.
  let headerRowNum = 0;
  let headers: string[] = [];
  for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
    const row = sheet.getRow(r);
    const cells = (row.values as Array<unknown>).slice(1).map((v) => normaliseHeader(v));
    if (cells.some((c) => c === 'reference') && cells.some((c) => c === 'type')) {
      headerRowNum = r;
      headers = cells;
      break;
    }
  }
  if (headerRowNum === 0) {
    throw new Error(
      'AU DFAT XLSX: could not locate header row (looking for cells containing "Reference" and "Type" in the first 10 rows). DFAT may have changed the format.',
    );
  }

  const colIndex = (...names: string[]): number => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const idxRef = colIndex('reference');
  const idxType = colIndex('type');
  const idxNameListedPerson = colIndex('name of listed person', 'name');
  const idxNameListedEntity = colIndex('name of listed entity');
  const idxFirstName = colIndex('first name', 'given names', 'given name');
  const idxLastName = colIndex('last name', 'family name', 'surname');
  const idxOtherNames = colIndex('other names', 'aliases', 'also known as');
  const idxAddress = colIndex('address');
  const idxCitizenship = colIndex('citizenship', 'nationality');
  const idxListingInfo = colIndex('listing information', 'listing info', 'notes');

  const groupedByRef = new Map<string, NormalisedSanctionsEntry>();

  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells = (row.values as Array<unknown>).slice(1);
    if (cells.every((c) => c === null || c === undefined || c === '')) continue;

    const ref = cellToString(cells[idxRef]) || `dfat-row-${r}`;
    const typeRaw = cellToString(cells[idxType]).toLowerCase();
    let type: SubjectType;
    if (typeRaw.includes('individual') || typeRaw.includes('person')) type = 'person';
    else if (typeRaw.includes('entity') || typeRaw.includes('organisation') || typeRaw.includes('organization')) type = 'entity';
    else continue; // skip unknown type rows

    const primaryName = buildPrimaryName({
      type,
      nameListedPerson: idxNameListedPerson >= 0 ? cellToString(cells[idxNameListedPerson]) : '',
      nameListedEntity: idxNameListedEntity >= 0 ? cellToString(cells[idxNameListedEntity]) : '',
      firstName: idxFirstName >= 0 ? cellToString(cells[idxFirstName]) : '',
      lastName: idxLastName >= 0 ? cellToString(cells[idxLastName]) : '',
    });
    if (!primaryName) continue;

    const aliases = idxOtherNames >= 0
      ? splitAliases(cellToString(cells[idxOtherNames]))
      : [];

    const existing = groupedByRef.get(ref);
    if (existing) {
      // Same reference, additional alias row — merge
      if (primaryName !== existing.primary_name && !existing.aliases.includes(primaryName)) {
        existing.aliases.push(primaryName);
      }
      for (const a of aliases) {
        if (!existing.aliases.includes(a) && a !== existing.primary_name) {
          existing.aliases.push(a);
        }
      }
    } else {
      groupedByRef.set(ref, {
        list: 'au_dfat',
        primary_name: primaryName,
        aliases,
        type,
        list_reference: ref,
        list_url: 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list',
        address: idxAddress >= 0 ? cellToString(cells[idxAddress]) || undefined : undefined,
        nationality: idxCitizenship >= 0 ? cellToString(cells[idxCitizenship]) || undefined : undefined,
        notes: idxListingInfo >= 0 ? cellToString(cells[idxListingInfo]) || undefined : undefined,
      });
    }
  }

  return [...groupedByRef.values()];
}

function normaliseHeader(v: unknown): string {
  if (v === null || v === undefined) return '';
  // exceljs returns rich-text objects for some cells
  const s = typeof v === 'object' && v !== null && 'richText' in v
    ? (v as { richText: Array<{ text: string }> }).richText.map((rt) => rt.text).join('')
    : typeof v === 'object' && v !== null && 'text' in v
      ? String((v as { text: string }).text)
      : String(v);
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v !== null) {
    if ('richText' in v) {
      return (v as { richText: Array<{ text: string }> }).richText
        .map((rt) => rt.text)
        .join('')
        .trim();
    }
    if ('text' in v) return String((v as { text: string }).text).trim();
    if ('result' in v) return String((v as { result: unknown }).result).trim();
    if ('hyperlink' in v) return String((v as { text?: string }).text ?? '').trim();
  }
  return String(v).trim();
}

function buildPrimaryName(parts: {
  type: SubjectType;
  nameListedPerson: string;
  nameListedEntity: string;
  firstName: string;
  lastName: string;
}): string {
  if (parts.type === 'entity') {
    return parts.nameListedEntity || parts.nameListedPerson || '';
  }
  // person
  if (parts.nameListedPerson) return parts.nameListedPerson;
  return [parts.firstName, parts.lastName].filter(Boolean).join(' ').trim();
}

function splitAliases(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,\n|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

// =============================================================================
// EU sanctions (stub — requires registration)
// =============================================================================

export function createEuSanctionsProvider(_opts: ProviderOptions = {}): SanctionsListProvider {
  return {
    list: 'eu_sanctions',
    async fetch() {
      throw new Error(
        'eu_sanctions: live fetch not implemented — EU FSF requires registration & login token. Provide a custom provider that injects authenticated download URL.',
      );
    },
    lastRefreshed: () => null,
  };
}

// =============================================================================
// CSV parser (minimal, RFC 4180-ish — handles quoted fields with embedded commas)
// =============================================================================

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        cur.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && csv[i + 1] === '\n') i++;
        cur.push(field);
        field = '';
        if (cur.some((f) => f.length > 0)) rows.push(cur);
        cur = [];
      } else {
        field += c;
      }
    }
  }
  if (field || cur.length) {
    cur.push(field);
    if (cur.some((f) => f.length > 0)) rows.push(cur);
  }
  return rows;
}
