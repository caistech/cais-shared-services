export { verifyApiKey } from './verifyApiKey.js'
export { checkMonthlyQuota, UNLIMITED_LIMIT } from './checkMonthlyQuota.js'
export { incrementUsage } from './incrementUsage.js'
export { logUsage } from './logUsage.js'
export { withApiKey } from './withApiKey.js'
export { generateApiKey } from './generateKey.js'
export { sha256Hex, constantTimeEqualHex } from './hash.js'

export type {
  PlanTier,
  ApiKeyRow,
  VerifyResult,
  QuotaResult,
  UsageLogInput,
  SupabaseLike,
} from './types.js'
export type { GenerateKeyOptions, GeneratedKey } from './generateKey.js'
export type { IncrementResult } from './incrementUsage.js'
export type {
  WithApiKeyOptions,
  WithApiKeyContext,
  WeightFn,
  ApiKeyHandler,
} from './withApiKey.js'
