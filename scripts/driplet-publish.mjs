#!/usr/bin/env node
//
// driplet-publish.mjs — approve, render and publish a driplet.
//
//   node scripts/driplet-publish.mjs --list                 what is drafted / approved / published
//   node scripts/driplet-publish.mjs --approve <id>         mark a drafted post approved to send
//   node scripts/driplet-publish.mjs --render <id>          print the publish-ready text + fold check
//   node scripts/driplet-publish.mjs --publish <id>         send it (DRY RUN unless --live)
//   node scripts/driplet-publish.mjs --publish <id> --live  actually post
//   node scripts/driplet-publish.mjs --export                write one clean .txt per post to driplets/out/
//   node scripts/driplet-publish.mjs --self-test
//
// WHY THE HUMAN STAYS IN IT. Everything upstream of --approve is machine work: harvest,
// rank, sanitise, draft. Deciding what the portfolio says in public under one person's
// own name is not. A mis-sanitised post is not a bug you fix, it is a call you make to
// someone. So drafting is automatic, sending is automatic, and the single step between
// them is a person typing an id.
//
// THE TRANSPORT IS A SEAM, deliberately. No credentialed call is hard-wired here, so the
// whole pipeline runs today against the dry transport and wiring a real one later is one
// function with one signature. Two candidate providers, neither yet confirmed:
//   unipile  — @caistech/unipile-channels can READ LinkedIn posts (getLinkedInPosts) but
//              has NO create-post call. Adding one there is the @caistech-first route,
//              PROVIDED Unipile exposes a create-post endpoint — unverified.
//   linkedin — the official API, needs a Developer app with "Share on LinkedIn" and the
//              w_member_social scope.
//
// SANITISATION RUNS AGAIN AT SEND TIME. It already ran at harvest. It runs here too,
// against the FINAL rendered text — the only string that actually leaves — because the
// text can be edited after harvesting and the gate that matters is the one closest to the
// wire. Same reason @caistech/email-compliance throws inside the send path rather than in
// CI: CI checks the repo, the throw checks the event.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(REPO, 'driplets', 'config.json');
const QUEUE_PATH = join(REPO, 'driplets', 'queue.json');
const POSTS_PATH = join(REPO, 'driplets', 'posts.json');

export const SERIES = {
  name: "Just Ship It. It'll be Fine.",
  tagline: "What we were sure of, what happened next, and what we changed so it can't go the same way twice.",
};

// LinkedIn hard limit on a feed post. Not a style preference — the API rejects longer.
export const MAX_CHARS = 3000;
// Roughly what shows before "…see more". Approximate by design: LinkedIn does not publish
// the rule and it varies by client, so this WARNS and never blocks.
export const FOLD_CHARS = 210;

// ---------------------------------------------------------------- pure

/**
 * Assemble the final text: body, then the series footer. Markdown is stripped — LinkedIn
 * renders none of it, so asterisks would print literally.
 *
 * `footerOverride` exists for the one post that has no number: the series intro is not
 * an instalment of the thing it introduces, and "№0" reads as a mistake.
 */
export function render(post, seriesNumber) {
  const body = String(post.body ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();

  // A masthead ABOVE the hook, so a returning reader recognises the series in the feed
  // without opening it. It costs ~31 characters of the fold and the hook still fits, so
  // it is free. It lives here rather than in the body text so the name has ONE home and a
  // rename propagates — baking it into eight bodies is how a series ends up with two names.
  const masthead = post.masthead ? `${SERIES.name} №${seriesNumber}\n\n` : '';
  // The footer repeats the name and number even when a masthead is present. Tried it as
  // tagline-only on the grounds that repetition is noise; the operator wants both, and he
  // is right — the masthead is for the scroller who never opens it, the footer is for the
  // reader who finished. They are different people and each needs to be told what this is.
  const footer = post.footerOverride
    ? String(post.footerOverride)
    : `${SERIES.name} №${seriesNumber}\n${SERIES.tagline}`;

  return `${masthead}${body}\n\n—\n${footer}`;
}

/** What a reader sees before "…see more" — the only part that decides whether they open it. */
export function aboveFold(text, limit = FOLD_CHARS) {
  return String(text ?? '').slice(0, limit);
}

/**
 * Everything that must be true before a string may leave.
 * Returns problems; empty means sendable. Never throws — the caller decides.
 */
export function preflight(text, config, sanitise) {
  const problems = [];
  const t = String(text ?? '');
  if (!t.trim()) problems.push('empty body');
  if (t.length > MAX_CHARS) problems.push(`${t.length} chars — LinkedIn rejects over ${MAX_CHARS}`);
  const hits = sanitise(t, config);
  if (hits.length) problems.push(`sanitisation: ${hits.join(', ')}`);
  // A post whose opening lines say nothing loses the reader before the story starts.
  if (aboveFold(t).trim().length < 80) problems.push('nothing substantial above the fold');
  return problems;
}

/** Next series number = one past the highest already published. Gaps are not reused. */
export function nextSeriesNumber(posts) {
  const used = posts.filter((p) => p.status === 'published' && Number.isFinite(p.seriesNumber)).map((p) => p.seriesNumber);
  return used.length ? Math.max(...used) + 1 : 1;
}

// ---------------------------------------------------------------- transport

/**
 * Resolve the send function. Unconfigured FAILS — it does not fall back to a no-op that
 * reports success, which would be a publisher that silently publishes nothing while every
 * status in the queue says it went out.
 */
export function resolveTransport(name) {
  if (name === 'dry') {
    return async (text) => ({ ok: true, url: null, note: `DRY RUN — ${text.length} chars, nothing sent` });
  }
  if (name === 'unipile') {
    throw new Error(
      'transport "unipile" is not wired.\n' +
      '  @caistech/unipile-channels can READ LinkedIn posts but has no create-post call.\n' +
      '  To wire: confirm Unipile exposes a create-post endpoint, add createLinkedInPost to\n' +
      '  that package (not to this script — @caistech-first), then implement this branch.',
    );
  }
  if (name === 'linkedin') {
    throw new Error(
      'transport "linkedin" is not wired.\n' +
      '  Needs a LinkedIn Developer app with the "Share on LinkedIn" product and the\n' +
      '  w_member_social scope, plus LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN in env.',
    );
  }
  throw new Error(`unknown transport "${name}" — expected dry | unipile | linkedin`);
}

// ---------------------------------------------------------------- io

const readJson = (p, f) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return f; } };
const writePosts = (doc) => writeFileSync(POSTS_PATH, `${JSON.stringify(doc, null, 2)}\n`);

function loadPosts() {
  return readJson(POSTS_PATH, {
    note: 'Drafted posts. body is hand-written or model-drafted from a queue candidate; status is owned by a human.',
    posts: [],
  });
}

// ---------------------------------------------------------------- self-test

function selfTest(config, sanitise) {
  const fails = [];
  let ran = 0;
  const check = (n, c) => { ran++; if (!c) fails.push(n); };

  check('render strips markdown', !render({ body: '**bold** and\n## heading' }, 1).includes('**'));
  check('render appends the series footer', render({ body: 'x' }, 3).includes('№3'));
  check('footerOverride replaces the number', !render({ body: 'x', footerOverride: 'starts here' }, 3).includes('№'));
  check('masthead puts the series above the hook', render({ body: 'hook', masthead: true }, 2).startsWith(SERIES.name));
  check('masthead does not suppress the footer', render({ body: 'hook', masthead: true }, 2).split('№').length === 3);

  const long = 'word '.repeat(700);
  check('over-length is caught', preflight(long, config, sanitise).some((p) => p.includes('LinkedIn rejects')));
  check('empty is caught', preflight('', config, sanitise).includes('empty body'));
  check(
    'a client name in the FINAL text is caught',
    preflight(`${'a lesson about production. '.repeat(6)} a call with Gareth`, config, sanitise).some((p) => p.startsWith('sanitisation')),
  );
  check(
    'a clean post passes',
    preflight(`${'The check returned 200 and nobody could open the page. '.repeat(4)}`, config, sanitise).length === 0,
  );
  check('thin opening is caught', preflight('too short', config, sanitise).includes('nothing substantial above the fold'));

  check('series numbering starts at 1', nextSeriesNumber([]) === 1);
  check('series numbering continues past published', nextSeriesNumber([{ status: 'published', seriesNumber: 4 }]) === 5);
  check('drafts do not consume a number', nextSeriesNumber([{ status: 'draft', seriesNumber: 9 }]) === 1);

  // An unconfigured transport must refuse rather than quietly succeed.
  let threw = false;
  try { resolveTransport('unipile'); } catch { threw = true; }
  check('unwired transport throws rather than no-ops', threw);
  check('dry transport reports it sent nothing', typeof resolveTransport('dry') === 'function');

  for (const f of fails) console.error(`  FAIL  ${f}`);
  console.log(fails.length ? `\nself-test: ${fails.length} of ${ran} FAILED` : `self-test: ${ran}/${ran} passed`);
  return fails.length === 0;
}

// ---------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const arg = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);

  if (!existsSync(CONFIG_PATH)) {
    console.error('driplet-publish: no driplets/config.json — refusing to run without a sanitisation gate.');
    process.exit(2);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const { sanitiseMatches } = await import('./driplet-harvest.mjs');

  if (argv.includes('--self-test')) process.exit(selfTest(config, sanitiseMatches) ? 0 : 1);

  const doc = loadPosts();

  if (argv.includes('--list') || argv.length === 0) {
    const queue = readJson(QUEUE_PATH, { candidates: [] }).candidates ?? [];
    console.log(`\nposts   ${doc.posts.length}  (${doc.posts.filter((p) => p.status === 'published').length} published, ${doc.posts.filter((p) => p.status === 'approved').length} approved, ${doc.posts.filter((p) => p.status === 'draft').length} draft)`);
    console.log(`queue   ${queue.filter((c) => c.status === 'new').length} candidates ready to draft\n`);
    for (const p of doc.posts) {
      const n = p.seriesNumber ? `№${p.seriesNumber}` : '  —';
      console.log(`  ${p.status.padEnd(9)} ${n.padEnd(4)} ${p.id.padEnd(28)} ${String(p.title ?? '').slice(0, 60)}`);
    }
    if (!doc.posts.length) console.log('  (none — add drafts to driplets/posts.json)');
    console.log('');
    return;
  }

  // --export: one clean UTF-8 .txt per post, in publish order, ready to open and copy.
  //
  // LinkedIn has no bulk upload for scheduled posts — you paste into the composer and use
  // the clock icon, one at a time. So the useful thing is not an import format, it is a
  // file that copies cleanly: a terminal will happily mangle an em-dash or the № on the
  // way to the clipboard, and a post is not the place to discover that.
  if (argv.includes('--export')) {
    const outDir = join(REPO, 'driplets', 'out');
    mkdirSync(outDir, { recursive: true });
    const ordered = [...doc.posts].sort((a, b) => (a.publishOrder ?? 99) - (b.publishOrder ?? 99));
    let blocked = 0;
    for (const post of ordered) {
      const n = post.seriesNumber ?? nextSeriesNumber(doc.posts);
      const text = render(post, n);
      const problems = preflight(text, config, sanitiseMatches);
      const order = String(post.publishOrder ?? 0).padStart(2, '0');
      // A post that fails preflight is still written, but named so it cannot be pasted by
      // accident. Silently omitting it would leave a gap nobody notices.
      const name = problems.length ? `${order}-BLOCKED-${post.id}.txt` : `${order}-${post.id}.txt`;
      writeFileSync(join(outDir, name), `${text}\n`, 'utf8');
      if (problems.length) blocked++;
      console.log(`  ${String(text.length).padStart(4)}ch  ${problems.length ? 'BLOCKED' : 'clean  '}  driplets/out/${name}`);
    }
    console.log(`\n${ordered.length} file(s) written to driplets/out/${blocked ? ` — ${blocked} BLOCKED, do not paste those` : ''}`);
    console.log('Paste into the LinkedIn composer, then use the clock icon beside Post to schedule.');
    return;
  }

  const id = arg('--approve') ?? arg('--render') ?? arg('--publish');
  const post = doc.posts.find((p) => p.id === id);
  if (!post) { console.error(`no post with id "${id}" in driplets/posts.json`); process.exit(2); }

  if (argv.includes('--approve')) {
    post.status = 'approved';
    writePosts(doc);
    console.log(`approved ${post.id} — publish with: --publish ${post.id} --live`);
    return;
  }

  const seriesNumber = post.seriesNumber ?? nextSeriesNumber(doc.posts);
  const text = render(post, seriesNumber);
  const problems = preflight(text, config, sanitiseMatches);

  if (argv.includes('--render')) {
    console.log(`\n${'-'.repeat(72)}\n${text}\n${'-'.repeat(72)}`);
    console.log(`\nchars ${text.length}/${MAX_CHARS}   series №${seriesNumber}`);
    console.log(`above the fold: "${aboveFold(text).replace(/\n/g, ' ⏎ ')}"`);
    console.log(problems.length ? `\nBLOCKERS:\n  ${problems.join('\n  ')}\n` : '\npreflight: clean\n');
    return;
  }

  // --publish
  if (post.status !== 'approved') {
    console.error(`refusing: ${post.id} is "${post.status}", not "approved". A human approves before anything sends.`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`refusing to publish:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }

  const live = argv.includes('--live');
  const transportName = live ? (config.publish?.transport ?? 'unipile') : 'dry';
  let send;
  try { send = resolveTransport(transportName); } catch (e) { console.error(`\n${e.message}\n`); process.exit(2); }

  const result = await send(text);
  if (!result.ok) { console.error(`publish failed: ${result.note ?? 'unknown'}`); process.exit(1); }

  if (live) {
    post.status = 'published';
    post.seriesNumber = seriesNumber;
    post.publishedUrl = result.url ?? null;
    post.publishedAt = new Date().toISOString().slice(0, 10);
    writePosts(doc);
  }
  console.log(`${live ? 'PUBLISHED' : 'dry run'} — ${result.note ?? result.url ?? 'ok'}`);
  if (!live) console.log('add --live to send for real.');
}

if (process.argv[1] && process.argv[1].endsWith('driplet-publish.mjs')) main();
