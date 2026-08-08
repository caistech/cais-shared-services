#!/usr/bin/env node
//
// driplet-draft.mjs — turn a harvested candidate into a six-beat draft.
//
//   node scripts/driplet-draft.mjs --top 5              draft the 5 highest-ranked ready candidates
//   node scripts/driplet-draft.mjs --candidate <id>     draft one specific candidate
//   node scripts/driplet-draft.mjs --top 3 --dry-run    print the prompt, call nothing
//   node scripts/driplet-draft.mjs --self-test
//
// This is the bottleneck the whole pipeline existed to remove. Harvest finds candidates,
// publish sends them; between the two sat a person writing prose, and 93 candidates times
// one writing session each is not a series, it is a second job.
//
// THE VOICE AND THE FORMAT ARE READ FROM DISK, not duplicated here. The prompt is
// assembled from foundation/_portfolio/dennis-voice.md and driplets/TEMPLATE.md at run
// time, so editing either changes what gets drafted and there is exactly one copy of the
// rules. A prompt with its own paraphrase of the template is how a series drifts.
//
// THE GUARD THAT MATTERS: a model writing about a failure will happily invent a number.
// "It was live for fifteen days" is the single most persuasive line in post №1 and it was
// established with git log -S, not estimated. So every number in a draft is checked
// against the source material, and any that does not appear there is reported. A
// fabricated specific does not just weaken a post — it destroys the only thing that makes
// this series worth a diligence reader's attention, which is that all of it is true.
//
// Nothing here publishes. Output is status:draft, for a human to approve or bin.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(REPO, 'driplets', 'config.json');
const QUEUE_PATH = join(REPO, 'driplets', 'queue.json');
const POSTS_PATH = join(REPO, 'driplets', 'posts.json');
const VOICE_PATH = join(REPO, 'foundation', '_portfolio', 'dennis-voice.md');
const TEMPLATE_PATH = join(REPO, 'driplets', 'TEMPLATE.md');

// ---------------------------------------------------------------- pure

/**
 * Every number-like token in a piece of text, normalised.
 *
 * Digits AND the small written numbers, because "fifteen days" and "15 days" are the same
 * claim and a model asked to write prose will reach for the word. Percentages, versions
 * and money are all just digit runs here — the point is not to parse them, it is to notice
 * that a specific appeared.
 */
const WORD_NUMBERS = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70',
  eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
};

export function numbersIn(text) {
  const out = new Set();
  const t = String(text ?? '').toLowerCase();
  for (const m of t.matchAll(/\d[\d,.]*/g)) {
    const n = m[0].replace(/[,.]+$/, '').replace(/,/g, '');
    if (n) out.add(n);
  }
  for (const [word, digit] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) out.add(digit);
  }
  return [...out];
}

/**
 * Numbers asserted in the draft that do not appear in the source material.
 *
 * Reported, never auto-corrected: the model may have paraphrased something real, or it may
 * have invented it, and only a person reading the source can tell. Silently stripping them
 * would hide the more important signal, which is that this candidate's material was too
 * thin to write from.
 */
export function unsupportedNumbers(draftBody, material) {
  const known = new Set(numbersIn(material));
  // Series numbers and the ordinals a post legitimately uses about itself.
  const benign = new Set(['1', '2', '3', '200', '404', '500']);
  return numbersIn(draftBody).filter((n) => !known.has(n) && !benign.has(n));
}

/** Strip a model's habit of wrapping JSON in a code fence before parsing. */
export function parseDraft(raw) {
  const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'response was not JSON' }; }
  if (!obj || typeof obj.title !== 'string' || typeof obj.body !== 'string') {
    return { ok: false, error: 'response missing title or body' };
  }
  if (!obj.body.trim()) return { ok: false, error: 'empty body' };
  return { ok: true, draft: { title: obj.title.trim(), body: obj.body.trim() } };
}

/** A stable, readable post id from the title. */
export function slugify(title) {
  return String(title ?? '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .split(/\s+/).slice(0, 7).join('-').slice(0, 60) || 'untitled';
}

export function buildPrompt({ candidate, voice, template }) {
  const system = [
    'You write one post for a LinkedIn series about engineering failures, in the voice and',
    'format defined below. Both documents are authoritative. Follow them exactly.',
    '',
    'THE THREE RULES THAT OVERRIDE EVERYTHING ELSE:',
    '',
    '1. INVENT NOTHING. Every fact, number, date and quote must come from the SOURCE',
    '   MATERIAL. If the material does not say how long something was broken, do not say.',
    '   A vague true sentence beats a specific invented one. This is not a style',
    '   preference: the series is read by people deciding whether to trust the author with',
    '   a client, and one fabricated specific ends that.',
    '2. If the material is too thin to carry a post, say so. Return',
    '   {"title":"","body":"","insufficient":"<what is missing>"} rather than padding.',
    '3. Name no company, client, partner or product except "Kira". Refer to anything else',
    '   as "one of our products".',
    '',
    'Return ONLY a JSON object: {"title": "...", "body": "..."}',
    'The body is the post text. No masthead, no footer, no series number — those are added',
    'later. No markdown. Plain text with blank lines between line-groups.',
    '',
    '=== VOICE ===',
    voice,
    '',
    '=== FORMAT ===',
    template,
  ].join('\n');

  const user = [
    'SOURCE MATERIAL — the only facts you may use.',
    '',
    `Source: ${candidate.source}`,
    `Origin: ${candidate.origin}`,
    candidate.date ? `Date: ${candidate.date}` : '',
    `Title: ${candidate.title}`,
    '',
    candidate.material,
  ].filter(Boolean).join('\n');

  return { system, user };
}

// ---------------------------------------------------------------- llm

/**
 * OpenAI-compatible chat completion over native fetch.
 *
 * Base URL is configurable, so this runs against OpenAI, a local server, or an
 * open-weight endpoint with one env var and no code change — the same portability rule the
 * rest of the portfolio follows. Unconfigured THROWS: a drafter that quietly produces
 * nothing while reporting success is the exact failure this series is about.
 */
async function complete({ system, user, model, temperature = 0.7 }) {
  const key = process.env.OPENAI_API_KEY;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!key) {
    throw new Error(
      'driplet-draft: OPENAI_API_KEY is not set. Refusing to run.\n' +
      '  Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL to point at another\n' +
      '  OpenAI-compatible endpoint, or DRIPLET_DRAFT_MODEL to change the model).',
    );
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  const fails = [];
  let ran = 0;
  const check = (n, c) => { ran++; if (!c) fails.push(n); };

  check('digits are found', numbersIn('live for 15 days').includes('15'));
  check('written numbers are found', numbersIn('live for fifteen days').includes('15'));
  check('commas are normalised', numbersIn('2,419 chars').includes('2419'));
  check('no false numbers', numbersIn('nothing numeric here').length === 0);

  check(
    'an invented number is caught',
    unsupportedNumbers('it was live for 40 days', 'the endpoint was live for fifteen days').includes('40'),
  );
  check(
    'a supported number passes',
    unsupportedNumbers('it was live for fifteen days', 'live for 15 days').length === 0,
  );
  check('series numbers are benign', unsupportedNumbers('this is post 2', 'no numbers here').length === 0);

  check('fenced JSON parses', parseDraft('```json\n{"title":"a","body":"b"}\n```').ok);
  check('plain JSON parses', parseDraft('{"title":"a","body":"b"}').ok);
  check('prose is rejected', !parseDraft('here is your post!').ok);
  check('missing body is rejected', !parseDraft('{"title":"a"}').ok);
  check('empty body is rejected', !parseDraft('{"title":"a","body":"  "}').ok);

  check('slug is readable', slugify('She told the customer she could not!') === 'she-told-the-customer-she-could-not');

  const p = buildPrompt({ candidate: { source: 's', origin: 'o', title: 't', material: 'm' }, voice: 'VOICEDOC', template: 'FORMATDOC' });
  check('prompt carries the voice doc', p.system.includes('VOICEDOC'));
  check('prompt carries the format doc', p.system.includes('FORMATDOC'));
  check('prompt forbids invention', /INVENT NOTHING/.test(p.system));
  check('material is the user turn', p.user.includes('m'));

  for (const f of fails) console.error(`  FAIL  ${f}`);
  console.log(fails.length ? `\nself-test: ${fails.length} of ${ran} FAILED` : `self-test: ${ran}/${ran} passed`);
  return fails.length === 0;
}

// ---------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const arg = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
  if (argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  for (const [label, path] of [['config', CONFIG_PATH], ['voice', VOICE_PATH], ['template', TEMPLATE_PATH]]) {
    if (!existsSync(path)) { console.error(`driplet-draft: missing ${label} at ${path}. Refusing to run.`); process.exit(2); }
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const voice = readFileSync(VOICE_PATH, 'utf8');
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const { sanitiseMatches } = await import('./driplet-harvest.mjs');
  const { render, preflight } = await import('./driplet-publish.mjs');

  const queueDoc = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  const postsDoc = JSON.parse(readFileSync(POSTS_PATH, 'utf8'));

  const one = arg('--candidate');
  const top = Number(arg('--top') ?? 3);
  const pool = queueDoc.candidates
    .filter((c) => (one ? c.id === one : c.status === 'new' && c.publishable !== false))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const chosen = one ? pool : pool.slice(0, top);
  if (!chosen.length) { console.error('nothing to draft'); process.exit(1); }

  const model = process.env.DRIPLET_DRAFT_MODEL || 'gpt-4.1';
  const dry = argv.includes('--dry-run');
  console.log(`\ndrafting ${chosen.length} candidate(s)${dry ? ' — DRY RUN' : ` with ${model}`}\n`);

  for (const candidate of chosen) {
    const { system, user } = buildPrompt({ candidate, voice, template });
    if (dry) {
      console.log(`── ${candidate.origin} ${'─'.repeat(40)}`);
      console.log(`system: ${system.length} chars (voice ${voice.length} + format ${template.length})`);
      console.log(`user:   ${user.length} chars\n${user.slice(0, 400)}…\n`);
      continue;
    }

    let raw;
    try { raw = await complete({ system, user, model }); }
    catch (e) { console.error(`\n${e.message}\n`); process.exit(2); }

    const parsed = parseDraft(raw);
    if (!parsed.ok) { console.log(`  SKIP  ${candidate.origin} — ${parsed.error}`); continue; }
    if (!parsed.draft.body) { console.log(`  SKIP  ${candidate.origin} — model reported insufficient material`); continue; }

    const post = { id: slugify(parsed.draft.title), title: parsed.draft.title, body: parsed.draft.body, masthead: true };
    const text = render({ ...post }, 99);
    const problems = preflight(text, config, sanitiseMatches);
    const invented = unsupportedNumbers(parsed.draft.body, candidate.material);

    const nextOrder = Math.max(0, ...postsDoc.posts.map((p) => p.publishOrder ?? 0)) + 1;
    postsDoc.posts.push({
      id: post.id,
      title: post.title,
      sourceCandidate: candidate.id,
      status: 'draft',
      seriesNumber: null,
      publishOrder: nextOrder,
      pin: false,
      masthead: true,
      publishedUrl: null,
      publishedAt: null,
      draftFlags: [...problems, ...invented.map((n) => `unsupported number: ${n}`)],
      body: post.body,
    });

    const flag = problems.length || invented.length ? 'FLAGGED' : 'clean  ';
    console.log(`  ${String(text.length).padStart(4)}ch ${flag}  ${post.id}`);
    if (problems.length) console.log(`         preflight: ${problems.join('; ')}`);
    if (invented.length) console.log(`         numbers not in the source: ${invented.join(', ')} — CHECK BEFORE PUBLISHING`);

    const qc = queueDoc.candidates.find((c) => c.id === candidate.id);
    if (qc) qc.status = 'drafted';
  }

  if (!dry) {
    writeFileSync(POSTS_PATH, `${JSON.stringify(postsDoc, null, 2)}\n`);
    writeFileSync(QUEUE_PATH, `${JSON.stringify(queueDoc, null, 2)}\n`);
    console.log('\nwritten as status:draft. Review with --list, read with --render, then --approve.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('driplet-draft.mjs')) main();
