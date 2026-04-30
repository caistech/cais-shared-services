import { randomBytes } from 'node:crypto'
import { sha256Hex } from './hash.js'

export interface GeneratedKey {
  /** The plaintext API key — return ONCE to the customer, never store. */
  plaintext: string
  /** sha256(plaintext) — store in api_keys.key_hash. */
  hash: string
  /** First 12 chars of plaintext — store in api_keys.key_prefix for fast lookup + dashboard display. */
  prefix: string
}

export interface GenerateKeyOptions {
  /**
   * Brand prefix. Hub default is `cais`. Consumers SHOULD set a per-product
   * prefix so issued keys are distinguishable in logs and customer dashboards.
   *
   * Example: `productPrefix: 'props'` (property-services) yields
   * `cais_props_live_<random>` / `cais_props_test_<random>`.
   */
  productPrefix?: string
  /** 'live' or 'test'. Defaults to 'live'. */
  environment?: 'live' | 'test'
  /** Random byte length (base64url-encoded). Default 32 (256 bits of entropy). */
  randomBytes?: number
}

/**
 * Generate a new opaque API key.
 *
 * Format: `cais[_<productPrefix>]_<env>_<base64url(randomBytes)>`
 *
 * Examples:
 *   cais_live_<random>                  // hub default, no productPrefix
 *   cais_props_live_<random>            // property-services
 *   cais_deal_test_<random>             // DealFindrs test environment
 */
export function generateApiKey(opts: GenerateKeyOptions = {}): GeneratedKey {
  const env = opts.environment ?? 'live'
  const byteLen = opts.randomBytes ?? 32
  const random = randomBytes(byteLen).toString('base64url')

  const parts = ['cais']
  if (opts.productPrefix) parts.push(opts.productPrefix)
  parts.push(env, random)
  const plaintext = parts.join('_')

  const hash = sha256Hex(plaintext)
  const prefix = plaintext.slice(0, 12)

  return { plaintext, hash, prefix }
}
