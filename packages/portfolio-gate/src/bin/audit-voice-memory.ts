#!/usr/bin/env node
/**
 * portfolio-gate-audit-voice-memory — is the semantic-memory leg actually wired?
 *
 * Static, because the runtime probe cannot see this: the Mnemo dual-write happens in the post-call
 * path, which `probeMemoryLoop` never triggers, so a product missing the leg passes all five
 * runtime checks with no semantic index at all.
 *
 * Exit codes:
 *   0 — wired, or a declared opt-out, or not a voice repo
 *   1 — voice repo with no semantic leg and no declared opt-out
 */
import { auditVoiceMemory, formatVoiceMemoryAudit } from '../audit/voice-memory.js';

const json = process.argv.includes('--json');
const result = auditVoiceMemory();

if (json) console.log(JSON.stringify(result, null, 2));
else console.log(formatVoiceMemoryAudit(result));

process.exit(result.outcome === 'fail' ? 1 : 0);
