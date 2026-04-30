import type { ApiKeyRow, SupabaseLike, VerifyResult } from './types.js'
import { constantTimeEqualHex, sha256Hex } from './hash.js'

/**
 * Verify a presented API key against the api_keys table.
 *
 * Lookup strategy: the first 12 chars of every key are indexed (`key_prefix`).
 * Multiple rows may share a prefix (rare but possible — base64url has ~72 bits
 * in 12 chars), so we hash-compare against every returned row in constant time.
 *
 * Returns:
 *   { ok: true, key }  — key is valid, active, and not revoked
 *   { ok: false, error: 'missing' | 'invalid' | 'revoked' | 'inactive' }
 */
export async function verifyApiKey(
  supabase: SupabaseLike,
  presentedKey: string | null | undefined
): Promise<VerifyResult> {
  if (!presentedKey || typeof presentedKey !== 'string' || presentedKey.length < 16) {
    return { ok: false, error: 'missing' }
  }

  const prefix = presentedKey.slice(0, 12)
  const presentedHash = sha256Hex(presentedKey)

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_prefix', prefix)
    .limit(10)

  if (error) {
    return { ok: false, error: `lookup_failed: ${error.message}` }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'invalid' }
  }

  for (const row of data as ApiKeyRow[]) {
    if (!constantTimeEqualHex(row.key_hash, presentedHash)) continue
    if (row.revoked_at) return { ok: false, error: 'revoked' }
    if (!row.active) return { ok: false, error: 'inactive' }
    return { ok: true, key: row }
  }

  return { ok: false, error: 'invalid' }
}
