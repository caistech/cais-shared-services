#!/usr/bin/env node
/**
 * promise-bars.mjs — automate the promise-attribute-bar pipeline.
 *
 * The loop (Fable-once -> cheap-score-forever), with the operator approval gate kept in the middle:
 *
 *   1. detect         list gap products needing bars, classified (pure)
 *   2. draft [slugs]  Fable-draft bars -> promise-attributes-PROPOSAL.json + .md
 *                     (calls the API headlessly if ANTHROPIC_API_KEY is set; else emits the
 *                      ready-to-run prompt for a Fable session/agent to execute)
 *   --- OPERATOR REVIEWS THE PROPOSAL, PICKS WHICH SLUGS TO ACCEPT (the gate) ---
 *   3. merge <slugs>  merge accepted products into canonical + regenerate the migration SQL (pure)
 *   4. apply          ref-probe both instances, apply the latest migration, verify (pure)
 *
 * Usage:
 *   node promise-bars.mjs detect
 *   node promise-bars.mjs draft f2k-projects lessonslearned      # or `draft --all-gaps`
 *   node promise-bars.mjs merge f2k-projects lessonslearned
 *   node promise-bars.mjs apply
 *
 * Files (all in this dir): promise-attributes.json (canonical) · promise-attributes-PROPOSAL.json/.md
 *   · promise-attributes-NEW-<YYYY-MM-DD>.sql (generated migration)
 * DB: promise_attributes table on BOTH cockpit + pipeline instances (D2-collapse synced copies).
 * Token: ~/.supabase-token (sbp_...).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CANON = path.join(DIR, "promise-attributes.json");
const PROPOSAL = path.join(DIR, "promise-attributes-PROPOSAL.json");
const PROPOSAL_MD = path.join(DIR, "promise-attributes-PROPOSAL.md");

// promise_attributes lives identically on both instances (keep them in sync).
const REFS = {
  "tfgtfhwvrswjvkyeyvsp": "cockpit + cais-shared-services",
  "fslkzhmqcrjsswyrgwnc": "pipeline (post-D2-collapse copy)",
};

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const die = (m) => { console.error("ERROR: " + m); process.exit(1); };

// A product still needs bars when none of its attributes carry a real quality_bar.
const hasBars = (p) => Array.isArray(p.attributes) && p.attributes.some((a) => a && a.quality_bar);

// Products the operator explicitly dropped — never draft/offer Gate-1 bars for these.
// (2026-07-10: universal-interviews, leadspark, aiftis, mova, storyverse.)
const DROPPED = new Set(["universal-interviews", "leadspark", "aiftis", "mova", "storyverse"]);

// Classify a gap product so the operator (and Fable) know how to treat it.
function classify(p) {
  const promise = (p.promise || "").trim();
  if (DROPPED.has(p.slug)) return "SKIP";                                          // operator-dropped
  if (p.needed === "N" || /^\[SUBSTRATE/i.test(promise)) return "SKIP";           // infra / parked / substrate
  if (/\(define\)/i.test(promise) || promise.length < 12) return "NEEDS_PROMISE"; // passion-lane / undefined
  return "GENERATE";                                                              // real promise -> draftable
}

// ---------------------------------------------------------------- detect
function detect() {
  const c = readJSON(CANON);
  const done = c.products.filter(hasBars);
  const gaps = c.products.filter((p) => !hasBars(p));
  const byClass = { GENERATE: [], NEEDS_PROMISE: [], SKIP: [] };
  for (const p of gaps) byClass[classify(p)].push(p);

  console.log(`\npromise-attributes: ${done.length}/${c.products.length} products have bars.\n`);
  const show = (label, arr) => {
    console.log(`-- ${label} (${arr.length}) --`);
    for (const p of arr) console.log(`   ${p.slug.padEnd(24)} needed=${p.needed}  "${(p.promise || "").slice(0, 62)}"`);
    console.log("");
  };
  show("GENERATE  (real promise -> `draft` these)", byClass.GENERATE);
  show("NEEDS_PROMISE  (define the promise first — operator call)", byClass.NEEDS_PROMISE);
  show("SKIP  (substrate / parked / needed=N)", byClass.SKIP);
  if (byClass.GENERATE.length)
    console.log(`Next: node promise-bars.mjs draft ${byClass.GENERATE.map((p) => p.slug).join(" ")}\n`);
  return byClass;
}

// ---------------------------------------------------------------- draft
function buildPrompt(targets) {
  const c = readJSON(CANON);
  const ex = ["singify", "connexions"].map((s) => c.products.find((p) => p.slug === s)).filter(Boolean);
  const exBlock = ex.map((p) =>
    `${p.tab} (RATIFIED — match this bar):\n` +
    p.attributes.map((a) => `  - ${a.attribute} -> "${a.quality_bar}"`).join("\n")
  ).join("\n\n");
  const ctxPath = path.join(DIR, "product-context.json");
  const ctx = fs.existsSync(ctxPath) ? readJSON(ctxPath) : {};
  const tgtBlock = targets.map((p) => {
    const cls = classify(p);
    const hint = ctx[p.slug] ? `\n  Operator context: ${ctx[p.slug]}` : "";
    return `- ${p.slug} (tab "${p.tab}", needed=${p.needed}, class=${cls})\n  Promise seed: "${p.promise}"\n  Distributor seed: "${p.distributor || "(infer a NAMED operator archetype)"}"${hint}`;
  }).join("\n");

  return `You are generating promise-attribute "X, not Y" quality bars for a distributor-first B2B2C product portfolio's Gate-1 validation rubric. Cheaper models will score products against these forever, so match the ratified bar exactly.

A "promise" is what the product IS, broken into 3-6 load-bearing attributes a viewer must FEEL in a 3-minute demo. Each attribute gets a bar in "X, not Y" form: the passing bar AND the tempting-but-failing version. Rules: falsifiable + observable (concrete thresholds/behaviours, not vague adjectives); tests EXPERIENCE not scale-infra; product-specific (no generic reusable bars); include one distributor-pull attribute (what the reselling operator feels). "verify" is NAIVE, JUDGE, or NAIVE/JUDGE. Every attribute approved:false.

RATIFIED EXAMPLES TO MATCH:
${exBlock}

PRODUCTS TO PROCESS:
${tgtBlock}

For class=GENERATE: draft full bars. For class=NEEDS_PROMISE: propose a candidate promise from the seed but set _proposal_status NEEDS_PROMISE_DEFINITION and flag what the operator must decide; if the promise seed literally says "(define)", DO NOT fabricate one — empty attributes, _proposal_status NEEDS_PROMISE_DEFINITION, say only the operator can define it.

Output shape per product: { tab, slug, needed, promise, distributor, attributes:[{attribute, quality_bar, claude_draft, verify, approved:false, notes}], bars_filled, _proposal_status:"GENERATED|NEEDS_PROMISE_DEFINITION", _rationale }

Write TWO files:
  ${PROPOSAL}  ->  { "generated_by":"fable-5", "for_review":true, "products":[ ... ] }
  ${PROPOSAL_MD}  ->  a review sheet: 2-line summary, one section per product (promise + a | attribute | quality_bar | table + _rationale), GENERATED first.
Do NOT modify ${CANON}. Return a short summary + the key assumptions to check.`;
}

async function draft(slugs) {
  const c = readJSON(CANON);
  let targets;
  if (slugs.includes("--all-gaps")) {
    targets = c.products.filter((p) => !hasBars(p) && classify(p) !== "SKIP");
  } else {
    targets = slugs.map((s) => c.products.find((p) => p.slug === s) || die(`unknown slug: ${s}`));
  }
  if (!targets.length) die("no target products");
  const prompt = buildPrompt(targets);

  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`Calling claude-fable-5 headlessly for: ${targets.map((t) => t.slug).join(", ")} ...`);
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: "claude-fable-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt + "\n\nSince you cannot write files here, RETURN ONLY the proposal JSON object described above (no prose)." }],
      });
      const text = msg.content.map((b) => b.text || "").join("");
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json);
      fs.writeFileSync(PROPOSAL, JSON.stringify(parsed, null, 2) + "\n");
      console.log(`Wrote ${PROPOSAL} (${parsed.products.length} products). Review it, then: node promise-bars.mjs merge <slugs>`);
    } catch (e) {
      console.error("Headless draft failed (" + e.message + "). Falling back to prompt emit below.\n");
      emitPrompt(prompt);
    }
  } else {
    console.log("No ANTHROPIC_API_KEY — emitting the Fable prompt. Run it through a Fable-5 session/agent");
    console.log("(Agent tool, model: fable), which will write the proposal files, then `merge`.\n");
    emitPrompt(prompt);
  }
}
function emitPrompt(prompt) {
  const out = path.join(DIR, "_fable-draft-prompt.txt");
  fs.writeFileSync(out, prompt);
  console.log("----- FABLE DRAFT PROMPT (also saved to _fable-draft-prompt.txt) -----\n");
  console.log(prompt);
}

// ---------------------------------------------------------------- merge
function sqlQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

function merge(slugs) {
  if (!slugs.length) die("merge needs explicit slugs (the ones you approve). e.g. merge f2k-projects lessonslearned");
  if (!fs.existsSync(PROPOSAL)) die("no proposal file — run `draft` first");
  const c = readJSON(CANON);
  const prop = readJSON(PROPOSAL);
  const accepted = [];
  for (const slug of slugs) {
    const src = prop.products.find((p) => p.slug === slug) || die(`slug not in proposal: ${slug}`);
    if (src._proposal_status && src._proposal_status !== "GENERATED")
      die(`${slug} is ${src._proposal_status} — resolve its promise before merging (not auto-mergeable)`);
    if (!src.attributes || !src.attributes.some((a) => a.quality_bar)) die(`${slug} has no drafted bars`);
    const dst = c.products.find((p) => p.slug === slug) || die(`slug not in canonical: ${slug}`);
    dst.promise = src.promise;
    dst.distributor = src.distributor;
    dst.needed = "Y";
    dst.attributes = src.attributes.map((a) => ({
      attribute: a.attribute, quality_bar: a.quality_bar, claude_draft: a.claude_draft,
      verify: a.verify, approved: true, notes: a.notes,   // operator-greenlit at merge time
    }));
    dst.bars_filled = dst.attributes.length;
    accepted.push(dst);
  }
  c.products_with_bars = c.products.filter(hasBars).length;
  fs.writeFileSync(CANON, JSON.stringify(c, null, 2) + "\n");

  // regenerate the migration SQL for the accepted slugs
  const today = new Date().toISOString().slice(0, 10);
  const sqlPath = path.join(DIR, `promise-attributes-NEW-${today}.sql`);
  const rows = [];
  for (const p of accepted)
    p.attributes.forEach((a, i) =>
      rows.push(`  (${sqlQuote(p.slug)}, ${sqlQuote(p.promise)}, ${sqlQuote(p.distributor)}, ${sqlQuote(a.attribute)}, ${sqlQuote(a.quality_bar)}, ${sqlQuote(a.verify)}, ${i})`));
  const sql =
    `-- promise_attributes: ratified bars for ${accepted.map((p) => p.slug).join(", ")}\n` +
    `-- Fable-drafted, operator-greenlit ${today}. Idempotent (delete-then-insert).\n` +
    `DELETE FROM promise_attributes WHERE product_slug IN (${accepted.map((p) => sqlQuote(p.slug)).join(", ")});\n` +
    `INSERT INTO promise_attributes\n  (product_slug, promise, distributor, attribute, quality_bar, verify, sort_order)\nVALUES\n` +
    rows.join(",\n") + ";\n";
  fs.writeFileSync(sqlPath, sql);
  console.log(`Merged ${accepted.length} product(s): ${accepted.map((p) => p.slug).join(", ")}`);
  console.log(`Canonical now ${c.products_with_bars} with-bars. Migration -> ${path.basename(sqlPath)}`);
  console.log(`Next: node promise-bars.mjs apply`);
}

// ---------------------------------------------------------------- apply
async function sbQuery(ref, token, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${ref} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function apply() {
  const tokenPath = path.join(os.homedir(), ".supabase-token");
  if (!fs.existsSync(tokenPath)) die("no ~/.supabase-token");
  const token = fs.readFileSync(tokenPath, "utf8").trim();
  const sqls = fs.readdirSync(DIR).filter((f) => /^promise-attributes-NEW-.*\.sql$/.test(f)).sort();
  if (!sqls.length) die("no migration SQL — run `merge` first");
  const sqlFile = sqls[sqls.length - 1];
  const sql = fs.readFileSync(path.join(DIR, sqlFile), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  console.log(`Applying ${sqlFile} to ${Object.keys(REFS).length} instance(s).\n`);
  for (const [ref, label] of Object.entries(REFS)) {
    // ref-probe: only write where the table actually exists (never a blind push)
    try {
      const [{ rows: before, products: pBefore }] =
        await sbQuery(ref, token, "SELECT count(*) AS rows, count(DISTINCT product_slug) AS products FROM promise_attributes;");
      await sbQuery(ref, token, sql);
      const [{ rows: after, products: pAfter }] =
        await sbQuery(ref, token, "SELECT count(*) AS rows, count(DISTINCT product_slug) AS products FROM promise_attributes;");
      console.log(`  ${ref} (${label}): rows ${before}->${after}, products ${pBefore}->${pAfter}  OK`);
    } catch (e) {
      console.error(`  ${ref} (${label}): SKIPPED/FAILED — ${e.message}`);
    }
  }
  console.log("\nDone. (Canonical JSON + this migration are the durable record.)");
}

// ---------------------------------------------------------------- main
const [cmd, ...rest] = process.argv.slice(2);
const run = {
  detect,
  draft: () => draft(rest),
  merge: () => merge(rest),
  apply,
};
if (!run[cmd]) {
  console.log("Commands: detect | draft <slugs|--all-gaps> | merge <slugs> | apply");
  process.exit(cmd ? 1 : 0);
}
await run[cmd]();
