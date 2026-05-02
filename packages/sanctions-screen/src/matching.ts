/**
 * @caistech/sanctions-screen — Name matching.
 *
 * Conservative normalisation + Jaro-Winkler similarity. Zero deps.
 */

const COMMON_SUFFIXES = [
  'ltd', 'limited', 'inc', 'incorporated', 'llc', 'plc', 'gmbh', 'sa', 's.a.',
  'srl', 's.r.l.', 'pty', 'pty ltd', 'corp', 'corporation', 'co', 'co.', 'company',
  'group', 'holdings', 'holding',
  '有限公司', '股份有限公司', '集团', '集团有限公司',
  'cong ty', 'tnhh', 'cty',
  'sdn bhd', 'bhd', 'sdn',
  'pt', 'persero', 'tbk',
];

/**
 * Normalise a name for comparison: lowercase, strip punctuation/whitespace,
 * remove common corporate suffixes, collapse multiple spaces.
 */
export function normaliseName(name: string): string {
  let n = name.toLowerCase().trim();
  // Strip punctuation that doesn't carry meaning
  n = n.replace(/[.,;:!?'"()\[\]{}\\/_*&+]/g, ' ');
  // Strip CJK punctuation
  n = n.replace(/[，。、；：（）【】「」『』]/g, ' ');
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();
  // Strip leading/trailing common suffixes (longest match first)
  const sortedSuffixes = [...COMMON_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suffix of sortedSuffixes) {
    const re = new RegExp(`(\\s|^)${escapeRegExp(suffix)}(\\s|$)`, 'g');
    n = n.replace(re, ' ');
  }
  return n.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Jaro-Winkler similarity, returns 0–1.
 * Standard algorithm; good for short-to-medium strings (names).
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);

  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(b.length, i + matchDistance + 1);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  // Winkler boost — common prefix up to 4 chars
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Token-overlap (Jaccard) similarity. Fallback for word-rearranged names.
 */
export function tokenOverlap(a: string, b: string): number {
  const tokens = (s: string): Set<string> =>
    new Set(s.split(/\s+/).filter((t) => t.length >= 2));
  const aTok = tokens(a);
  const bTok = tokens(b);
  if (aTok.size === 0 || bTok.size === 0) return 0;
  const intersection = [...aTok].filter((t) => bTok.has(t)).length;
  const union = new Set([...aTok, ...bTok]).size;
  return intersection / union;
}
