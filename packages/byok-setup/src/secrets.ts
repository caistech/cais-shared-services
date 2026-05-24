import { randomBytes } from "node:crypto";
import type { AutoGenerate } from "./schema.js";

// base64url char count ≈ ceil(bytes * 4 / 3). 24→32, 36→48, 48→64.
const BYTES: Record<AutoGenerate, number> = {
  "random-32": 24,
  "random-48": 36,
  "random-64": 48,
};

/** Generate a URL-safe random secret of the requested character length. */
export function generateSecret(kind: AutoGenerate): string {
  return randomBytes(BYTES[kind]).toString("base64url");
}
