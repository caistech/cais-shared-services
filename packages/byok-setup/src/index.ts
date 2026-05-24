// Public library surface — consumed by the CLI now and the React web wizard later.
// The wizard reuses this exact validation/secret/distribution core (no re-implementation).

export * from "./schema.js";
export {
  loadManifest,
  validateValue,
  decodeJwtRole,
  isRequired,
  exclusiveGroupViolations,
  missingRequired,
  type ValidationResult,
} from "./validate.js";
export { generateSecret } from "./secrets.js";
export {
  writeEnvFile,
  parseEnvFile,
  assertGitignored,
  type EnvFileResult,
} from "./adapters/env-file.js";
export {
  vercelPush,
  type Spawner,
  type PushStatus,
  type VercelPushResult,
} from "./adapters/vercel.js";
