#!/usr/bin/env node
/**
 * bug-memory — semantic recall for the portfolio Bug Knowledge Protocol (Mnemo-backed).
 *
 * The first INSTANCE of DATA_STANDARD.md §6.1: the flat `bug-knowledge.json` grep is keyword-only,
 * so a differently-worded recurrence of a known bug doesn't surface. This wraps Mnemo (the partner
 * semantic-memory API) so "check prior bug knowledge before fixing" recalls SEMANTICALLY-related
 * prior fixes across EVERY product — one portfolio scope, cross-product recall.
 *
 * Store discipline (DATA_STANDARD I4/S4): memories are DISTILLED fix records (product + error +
 * symptoms + what worked), never raw logs/PII. bug-knowledge.json stays the durable, reviewable
 * source of truth; Mnemo is the semantic index over it (additive, fail-soft).
 *
 *   node scripts/bug-memory.mjs recall "<error text or symptom>"     # → related prior fixes
 *   node scripts/bug-memory.mjs remember '<json {product,error_pattern,error_symptoms,solution,attempts?}>'
 *   node scripts/bug-memory.mjs seed [--force]                        # migrate bug-knowledge.json → Mnemo
 *
 * Key: MNEMO_API_KEY in the env, else the on-disk token at ~/.mnemo-token (mirrors
 * ~/.supabase-token — so the protocol runs from any repo without sourcing a product .env).
 * MNEMO_API_URL optional (defaults to api.mnemohq.com).
 * Fail-soft: with no key / on any error, recall prints nothing and remember/seed no-op — the
 * protocol behaves exactly as it does today (grep the JSON) whenever Mnemo is unavailable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const API_URL = process.env.MNEMO_API_URL ?? "https://api.mnemohq.com";
// Key resolution mirrors the ~/.supabase-token pattern (see key-health.mjs): env first, then an
// on-disk token at ~/.mnemo-token. The on-disk fallback is what lets the Bug Knowledge Protocol
// run `node cais-shared-services/scripts/bug-memory.mjs recall …` from ANY repo/session without
// sourcing a product's .env — the whole point of a portfolio-wide recall.
function resolveApiKey() {
  if (process.env.MNEMO_API_KEY?.trim()) return process.env.MNEMO_API_KEY.trim();
  try {
    return readFileSync(join(homedir(), ".mnemo-token"), "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}
const API_KEY = resolveApiKey();
// One portfolio-wide container so a bug in product A surfaces when fixing a similar error in B.
// Versioned: Mnemo's add-only API means a re-seed duplicates, so a full re-seed bumps the version
// (a clean container) rather than double-writing. Normal `remember` calls just append — no dup.
const SCOPE = { type: "org", id: "caistech-bug-knowledge-v1" };
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Flatten a string | string[] | object field to a readable line. */
function flat(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(flat).filter(Boolean).join("; ");
  if (typeof v === "object") {
    // solution: {approach, answer?, code_path?}; attempt: {what/tried, ...}
    return [v.approach, v.answer, v.what, v.tried, v.code_path, v.result]
      .filter(Boolean)
      .join(" — ") || JSON.stringify(v);
  }
  return String(v);
}

/** Distil one entry/record into a single searchable memory string (no raw artifacts/PII). */
function toMemory(e) {
  const attempts = Array.isArray(e.attempts) ? e.attempts.map(flat).filter(Boolean) : [];
  return [
    `[${e.product ?? "portfolio"}] ${flat(e.error_pattern ?? e.error)}`.trim(),
    e.error_symptoms ? `Symptoms: ${flat(e.error_symptoms)}` : "",
    e.solution ? `Fix: ${flat(e.solution)}` : "",
    attempts.length ? `Tried: ${attempts.join(" | ")}` : "",
    e.fixed_at ? `(${e.fixed_at}${e.fixed_by ? ` · ${e.fixed_by}` : ""})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function mnemoAdd(contents) {
  if (!API_KEY || !contents.length) return 0;
  try {
    const res = await fetch(`${API_URL}/v1/memories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: SCOPE, items: contents.map((content) => ({ content })) }),
    });
    return res.ok ? contents.length : 0;
  } catch {
    return 0;
  }
}

async function mnemoSearch(query, limit = 5) {
  if (!API_KEY || !query?.trim()) return [];
  try {
    const res = await fetch(`${API_URL}/v1/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, scope: SCOPE, limit }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r) => r.content?.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function loadEntries() {
  const raw = readFileSync(join(REPO_ROOT, "bug-knowledge.json"), "utf-8");
  const doc = JSON.parse(raw);
  return Array.isArray(doc.entries) ? doc.entries : Array.isArray(doc) ? doc : [];
}

const [cmd, ...rest] = process.argv.slice(2);

if (!API_KEY) {
  console.error("bug-memory: MNEMO_API_KEY not set — fail-soft (falling back to grep bug-knowledge.json).");
  // Non-fatal: exit 0 so callers treat it as "no memory available", not an error.
  process.exit(0);
}

if (cmd === "recall") {
  const query = rest.join(" ");
  const hits = await mnemoSearch(query, 5);
  if (!hits.length) {
    console.log("(no related prior fixes in bug-memory — check bug-knowledge.json + the SayFix DB)");
  } else {
    console.log(`Related prior fixes (${hits.length}) for: ${query}\n`);
    hits.forEach((h, i) => console.log(`${i + 1}. ${h}\n`));
  }
} else if (cmd === "remember") {
  const entry = JSON.parse(rest.join(" ") || "{}");
  const n = await mnemoAdd([toMemory(entry)]);
  console.log(n ? "remembered." : "not remembered (Mnemo unavailable).");
} else if (cmd === "seed") {
  const entries = loadEntries();
  const memories = entries.map(toMemory).filter(Boolean);
  const n = await mnemoAdd(memories);
  console.log(`seeded ${n}/${entries.length} bug-knowledge entries into Mnemo scope ${SCOPE.id}.`);
} else {
  console.error("usage: bug-memory.mjs recall <text> | remember <json> | seed [--force]");
  process.exit(1);
}
