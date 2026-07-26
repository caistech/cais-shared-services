/**
 * Static audit — does a voice repo actually wire the semantic-memory leg?
 *
 * WHY THIS IS STATIC AND NOT PART OF THE PROBE
 *
 * `probeMemoryLoop` drives the deployed webhook routes and asserts save → recall → auth →
 * isolation → continuity. All five pass against the product's OWN store — and say nothing about
 * whether distilled facts also reach Mnemo, because that dual-write happens in the POST-CALL path,
 * which the probe never triggers. A product that omits the semantic leg passes 5/5 with no semantic
 * index at all. That is precisely how one product's leg went missing without anyone noticing.
 *
 * Some checks are only expressible statically. This is one.
 *
 * THE OPT-OUT IS POSITIVE, NOT SILENT
 *
 * A product may legitimately have no cross-session memory (a transient clarifier). It says so, in
 * `memory-loop.config.json`:
 *
 *   { "semanticMemory": false }
 *
 * Absence of the leg AND absence of that declaration is the failure. The point is that "we don't
 * index to Mnemo" has to be a decision someone recorded, not a thing that quietly never happened.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface VoiceMemoryAuditResult {
  outcome: 'pass' | 'fail' | 'skipped';
  reason: string;
  /** Files where the canonical pipeline is called. */
  callSites: string[];
}

const SOURCE_DIRS = ['lib', 'src', 'app'];
const SOURCE_EXT = /\.(ts|tsx|mts|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'coverage']);

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || !existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) walk(full, out, depth + 1);
      else if (SOURCE_EXT.test(entry)) out.push(full);
    } catch {
      /* unreadable entry — not the audit's problem */
    }
  }
  return out;
}

function declaresVoicePackage(cwd: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      pkg.dependencies?.['@caistech/elevenlabs-convai'] ??
        pkg.devDependencies?.['@caistech/elevenlabs-convai'],
    );
  } catch {
    return false;
  }
}

function declaredOptOut(cwd: string): boolean {
  try {
    const cfg = JSON.parse(readFileSync(resolve(cwd, 'memory-loop.config.json'), 'utf8')) as {
      semanticMemory?: boolean;
    };
    return cfg.semanticMemory === false;
  } catch {
    return false;
  }
}

/**
 * Does this call to the pipeline pass a `semantic` option?
 *
 * Deliberately crude: find the call, take a window of text after it, look for the key. A parser
 * would be more precise, but the failure this catches is a whole missing option — not a subtle
 * mis-shaping — and a crude check that runs everywhere beats a precise one that needs a TS program.
 */
function callPassesSemantic(source: string): boolean {
  const idx = source.indexOf('completeConversationMemory(');
  if (idx === -1) return false;
  const window = source.slice(idx, idx + 1600);
  return /\bsemantic\s*:/.test(window);
}

export function auditVoiceMemory(cwd: string = process.cwd()): VoiceMemoryAuditResult {
  if (!declaresVoicePackage(cwd)) {
    return {
      outcome: 'skipped',
      reason: 'no @caistech/elevenlabs-convai dependency — not a voice repo',
      callSites: [],
    };
  }

  const files = SOURCE_DIRS.flatMap((d) => walk(resolve(cwd, d)));
  const callSites: string[] = [];
  let anyWithSemantic = false;

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!source.includes('completeConversationMemory(')) continue;
    callSites.push(file.replace(cwd, '').replace(/^[\\/]/, ''));
    if (callPassesSemantic(source)) anyWithSemantic = true;
  }

  if (declaredOptOut(cwd)) {
    return {
      outcome: 'pass',
      reason: 'semanticMemory:false declared in memory-loop.config.json — opt-out is on the record',
      callSites,
    };
  }

  if (callSites.length === 0) {
    return {
      outcome: 'fail',
      reason:
        'voice repo does not call completeConversationMemory() — the canonical post-call memory ' +
        'pipeline (distil → dedupe → index). Either wire it, or declare "semanticMemory": false ' +
        'in memory-loop.config.json if this product genuinely has no cross-session memory.',
      callSites,
    };
  }

  if (!anyWithSemantic) {
    return {
      outcome: 'fail',
      reason:
        'completeConversationMemory() is called WITHOUT a `semantic` option, so distilled facts ' +
        'never reach Mnemo. The memory-loop probe cannot catch this — it asserts against the ' +
        "product's own store only. Pass `semantic: { scopePrefix: '<product>-user-' }`, or " +
        'declare "semanticMemory": false in memory-loop.config.json if the omission is deliberate.',
      callSites,
    };
  }

  return { outcome: 'pass', reason: 'canonical pipeline wired with the semantic leg', callSites };
}

export function formatVoiceMemoryAudit(result: VoiceMemoryAuditResult): string {
  const head =
    result.outcome === 'skipped'
      ? 'voice-memory: SKIPPED'
      : result.outcome === 'pass'
        ? 'voice-memory: PASS'
        : 'voice-memory: FAIL';
  const sites = result.callSites.length ? `\n  call sites: ${result.callSites.join(', ')}` : '';
  return `${head} — ${result.reason}${sites}`;
}
