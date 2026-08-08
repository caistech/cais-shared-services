#!/usr/bin/env node
//
// driplet-harvest.mjs — candidate harvester for the "Ship It, It's Fine." series.
//
// Reads the four places a lesson actually gets written down, emits candidates into a
// review queue, and refuses to let anything unsanitised through. Deterministic: no LLM
// anywhere in this file. Drafting is a separate, later step that consumes the queue —
// keeping the harvest free of a model is what makes it testable, and what stops it
// paying a model to rediscover conclusions that were already written at the time.
//
//   node scripts/driplet-harvest.mjs                 harvest, merge into the queue
//   node scripts/driplet-harvest.mjs --dry-run       show what would change, write nothing
//   node scripts/driplet-harvest.mjs --since 2026-07-01
//   node scripts/driplet-harvest.mjs --self-test     exercise the pure functions, exit 1 on fail
//
// THE FOUR SOURCES, and why it is four and not one:
//
//   bug-knowledge  the durable bug record. Rich (it keeps `attempts`, the only field that
//                  stops you re-walking a dead end) but written in batches, so it lags.
//   memory         ~/.claude/projects/<slug>/memory/*.md — per-project distilled lessons.
//                  The densest seam; already reduced to what mattered.
//   standards      TESTING_STANDARD / SHARED_SERVICES / PRODUCT_STANDARDS / DATA_STANDARD.
//                  Where the STRUCTURAL lessons go — and several are already written in
//                  something close to the four-beat shape.
//   commits        commit bodies. Current, complete, and never harvested by anything.
//
// The reverse pass exists because of what an audit on 2026-08-08 found: the largest
// lessons of the preceding ten days (an account-takeover path, blank first-paint pages,
// a doubled tax suffix, an autofilled honeypot) were absent from bug-knowledge.json
// entirely. They had all been written up carefully — in standards docs, in memory, in
// commit bodies — by people who correctly believed they had done the job. The store did
// not fail through neglect; it failed through ROUTING. So every candidate sourced from a
// commit or a standards doc is checked against bug-knowledge and flagged `kbGap` when
// nothing there covers it. The pipeline that produces the posts also keeps the knowledge
// base honest, which is the only version that works, because the alternative depends on
// somebody remembering.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(REPO, 'driplets', 'config.json');
const QUEUE_PATH = join(REPO, 'driplets', 'queue.json');

const expand = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);

// ---------------------------------------------------------------- pure functions
// Everything below this line is exercised by --self-test. Kept free of I/O on purpose:
// the parts that decide whether a client's name reaches a public post are the parts that
// must be testable without a filesystem.

/**
 * Flatten the config's grouped denylist into one lowercase term list.
 * Grouping in the JSON is for humans reviewing it; the gate does not care.
 */
export function denyTerms(config) {
  return Object.values(config.denylist ?? {}).flat().map((t) => String(t).toLowerCase());
}

/**
 * THE SANITISATION GATE. Returns the matched terms — empty means clean.
 *
 * Word-boundary matched so "ray" does not fire on "array" and "sda" does not fire on
 * "usda". Allowlisted terms are removed from the text before matching rather than
 * excluded from the denylist, so an allowlisted word can safely be a substring of a
 * blocked one.
 *
 * This returns TERMS, not a boolean, because a reviewer needs to know what tripped it —
 * "blocked" alone is the kind of verdict that gets a gate switched off.
 */
export function sanitiseMatches(text, config) {
  const allow = (config.allowlist ?? []).map((a) => String(a).toLowerCase());
  let haystack = String(text ?? '').toLowerCase();
  for (const a of allow) {
    haystack = haystack.split(a).join(' ');
  }
  const hits = new Set();
  for (const term of denyTerms(config)) {
    // Escape regex metacharacters in the term, then bound it.
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${safe}\\b`).test(haystack)) hits.add(term);
  }
  return [...hits].sort();
}

/** Distinctive tokens for dedupe + gap matching. Stopwords and short words removed. */
const STOP = new Set(
  ('the a an and or but if then that this these those is was were be been being it its of to in on ' +
   'for with as at by from we our us you your they their he she his her not no did does do done ' +
   'has have had will would could should can may might one two three when what why how which who')
    .split(' '),
);

export function tokens(text) {
  return [
    ...new Set(
      String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    ),
  ];
}

/** Stable dedupe signature: the 12 most distinctive tokens, sorted. */
export function dedupeKey(text) {
  return tokens(text).sort().slice(0, 12).join('.');
}

/**
 * Reverse pass. Does bug-knowledge already cover this lesson?
 *
 * Overlap-ratio rather than exact match, because the same defect is described in
 * different words in a commit body and in a bug entry — which is the entire reason a
 * flat grep over bug-knowledge.json misses recurrences and Mnemo exists.
 */
export function coveredByKnowledgeBase(material, kbTokenSets, threshold = 0.34) {
  const mine = tokens(material);
  if (mine.length < 5) return true; // too thin to judge; do not cry gap on noise
  for (const kb of kbTokenSets) {
    const shared = mine.filter((t) => kb.has(t)).length;
    // Normalise against the SMALLER set, not against `mine`.
    //
    // Dividing by mine.length has a length bias that made the check dishonest: a 6,000
    // character standards block has hundreds of distinct tokens, so its overlap ratio
    // with any single bug entry is diluted below any useful threshold and it is reported
    // as a gap FOREVER. Caught by backfilling twelve entries covering twelve named gaps
    // and watching the count fall from 50 to 49 — the backfill was fine, the measurement
    // was not. Against min(), the question becomes the one actually being asked: is this
    // known lesson substantially contained in this block?
    if (shared / Math.min(mine.length, kb.size) >= threshold) return true;
  }
  return false;
}

/**
 * How lesson-shaped is this text? Returns a count of DISTINCT failure markers.
 *
 * A count rather than a boolean, because the first run over the real corpus harvested
 * 1,174 candidates and left 376 marked ready — which is not a review queue, it is a
 * second job, and a queue nobody can finish reading is a queue nobody reads. The count
 * ranks them so the ones worth a human's attention float.
 */
export function lessonScore(text, config) {
  const hay = String(text ?? '').toLowerCase();
  return (config.failureMarkers ?? []).filter((m) => hay.includes(String(m).toLowerCase())).length;
}

/**
 * Minimum markers before a candidate is admitted, by source.
 *
 * bug-knowledge is exempt (0): every entry there is BY DEFINITION a recorded failure, so
 * filtering it on prose markers would drop real lessons for writing style. The other
 * three are prose corpora that mostly are not lessons, and need the bar.
 */
const LESSON_FLOOR = { 'bug-knowledge': 0, memory: 3, standards: 3, commit: 3 };

export function makeCandidate({ source, origin, product, date, title, material }, config, kbTokenSets) {
  const blockedBy = sanitiseMatches(`${title}\n${material}`, config);
  const needsGapCheck = source === 'commit' || source === 'standards';
  return {
    id: `${source}:${dedupeKey(title + ' ' + material).slice(0, 48)}`,
    source,
    origin,
    product: product ?? null,
    date: date ?? null,
    title: String(title ?? '').slice(0, 160),
    // A blocked candidate keeps its identity and its reason, and DROPS its material.
    // The queue is a new file; there is no case for it accumulating a second copy of
    // text that mentions a client, when the whole point of the gate is that this text
    // must not travel.
    material: blockedBy.length ? null : material,
    score: lessonScore(`${title}\n${material}`, config),
    dedupeKey: dedupeKey(material),
    status: blockedBy.length ? 'blocked' : 'new',
    blockedBy,
    kbGap: needsGapCheck ? !coveredByKnowledgeBase(material, kbTokenSets) : false,
  };
}

/** Admitted? Applies the per-source floor. */
export function admits(candidate) {
  return candidate.score >= (LESSON_FLOOR[candidate.source] ?? 3);
}

/**
 * Merge harvested candidates into the existing queue.
 *
 * An existing id keeps its status, always. A candidate you rejected must not come back
 * as `new` on the next run — that is how a review queue trains you to stop reading it.
 * The one exception is `blocked`: sanitisation is re-evaluated every run, so pruning a
 * denylist term actually releases the candidates it was holding.
 */
export function mergeQueue(existing, harvested) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const seenKeys = new Set(existing.map((e) => e.dedupeKey));
  let added = 0;
  let reblocked = 0;
  let released = 0;

  for (const cand of harvested) {
    const prior = byId.get(cand.id);
    if (prior) {
      if (cand.status === 'blocked' && prior.status !== 'blocked') {
        prior.status = 'blocked';
        prior.blockedBy = cand.blockedBy;
        reblocked++;
      } else if (prior.status === 'blocked' && cand.status !== 'blocked') {
        prior.status = 'new';
        prior.blockedBy = [];
        released++;
      }
      prior.kbGap = cand.kbGap;
      continue;
    }
    if (seenKeys.has(cand.dedupeKey)) continue; // same lesson, different source
    seenKeys.add(cand.dedupeKey);
    byId.set(cand.id, cand);
    added++;
  }
  return { queue: [...byId.values()], added, reblocked, released };
}

// ---------------------------------------------------------------- harvesters (I/O)

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function harvestBugKnowledge(config) {
  const path = join(REPO, config.sources.bugKnowledge);
  const doc = readJson(path);
  const entries = doc?.entries ?? [];
  return entries.map((e) => ({
    source: 'bug-knowledge',
    origin: `${config.sources.bugKnowledge}#${e.id ?? ''}`,
    product: e.product ?? null,
    date: e.fixed_at ?? e.date ?? null,
    title: e.error_pattern ?? e.id ?? 'untitled',
    material: [
      e.error_pattern && `PATTERN: ${e.error_pattern}`,
      e.error_symptoms && `SYMPTOMS: ${JSON.stringify(e.error_symptoms)}`,
      e.attempts && `ATTEMPTS: ${JSON.stringify(e.attempts)}`,
      e.solution && `SOLUTION: ${JSON.stringify(e.solution)}`,
      e.generalises_to && `GENERALISES: ${e.generalises_to}`,
    ].filter(Boolean).join('\n'),
  }));
}

function harvestMemory(config) {
  const root = expand(config.sources.memoryGlobRoot);
  if (!existsSync(root)) return [];
  const out = [];
  for (const slug of readdirSync(root)) {
    const dir = join(root, slug, 'memory');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md') || file === 'MEMORY.md') continue;
      const body = readFileSync(join(dir, file), 'utf8');
      if (body.length < config.minMaterialChars) continue;
      out.push({
        source: 'memory',
        origin: `${slug}/memory/${file}`,
        product: slug.replace(/^C--Users-denni-PycharmProjects-/, '') || null,
        date: (body.match(/modified:\s*(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? null,
        title: (body.match(/^description:\s*"?(.+?)"?$/m) ?? [])[1] ?? basename(file, '.md'),
        material: body,
      });
    }
  }
  return out;
}

/**
 * Standards docs hold the structural lessons, but they are long and mostly not lessons.
 * Split on headings and keep only blocks that trip enough failure markers — a cheap
 * filter that is wrong in both directions and honest about it: `looksLikeLesson` is a
 * heuristic, and the queue is reviewed by a human precisely because it is.
 */
function harvestStandards(config) {
  const out = [];
  for (const rel of config.sources.standardsDocs ?? []) {
    const path = join(REPO, rel);
    if (!existsSync(path)) continue;
    const body = readFileSync(path, 'utf8');
    const blocks = body.split(/\n(?=#{1,4}\s|\|\s`@caistech)/);
    for (const block of blocks) {
      if (block.length < config.minMaterialChars) continue;
      const heading = (block.match(/^#{1,4}\s+(.+)$/m) ?? [])[1] ?? block.slice(0, 90);
      out.push({
        source: 'standards',
        origin: rel,
        product: null,
        date: null,
        title: heading.replace(/[*`]/g, '').trim(),
        material: block.slice(0, 6000),
      });
    }
  }
  return out;
}

function harvestCommits(config, since) {
  const out = [];
  const pattern = new RegExp(config.sources.commitSubjectPattern ?? '.', 'i');
  for (const repoPath of config.sources.commitRepos ?? []) {
    const dir = expand(repoPath);
    if (!existsSync(join(dir, '.git'))) continue;
    let raw = '';
    try {
      raw = execFileSync(
        'git',
        ['log', `--since=${since}`, '--format=%H%x1f%ad%x1f%s%x1f%b%x1e', '--date=short'],
        { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      );
    } catch {
      continue; // a repo we cannot read is not a reason to lose the other three sources
    }
    for (const rec of raw.split('\x1e')) {
      const [sha, date, subject, body] = rec.split('\x1f');
      if (!sha || !subject || !pattern.test(subject.trim())) continue;
      if ((body ?? '').length < config.minMaterialChars) continue;
      out.push({
        source: 'commit',
        origin: `${basename(dir)}@${sha.trim().slice(0, 9)}`,
        product: basename(dir),
        date,
        title: subject.trim(),
        material: `${subject.trim()}\n\n${body.trim()}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- self-test

function selfTest(config) {
  const fails = [];
  const check = (name, cond) => { if (!cond) fails.push(name); };

  // The gate must fire on a real name...
  check('denylist fires on a person', sanitiseMatches('a call with Gareth about it', config).includes('gareth'));
  // ...and must not fire on a substring of an unrelated word. "ray" inside "array" is the
  // exact false positive that gets a sanitisation gate disabled by an annoyed operator.
  check('word boundary holds', sanitiseMatches('we iterated over the array', config).length === 0);
  check('allowlisted product passes', sanitiseMatches('Kira could not recall it', config).length === 0);
  check('clean text is clean', sanitiseMatches('the check returned 200 and nobody could open it', config).length === 0);
  check('multiple hits are reported', sanitiseMatches('Gareth and Shah', config).length === 2);
  check('regex metacharacters are escaped', sanitiseMatches('deal-findrs broke', config).includes('deal-findrs'));

  // Dedupe: same lesson in different words should collide; different lessons should not.
  check('identical text dedupes', dedupeKey('the widget swallowed input') === dedupeKey('the widget swallowed input'));
  check('different text does not', dedupeKey('memory recall returned nothing') !== dedupeKey('stripe webhook fired twice'));

  // Reverse pass.
  const kb = [new Set(tokens('voice agent does not remember a prior conversation recall memory'))];
  check('covered lesson is not a gap', coveredByKnowledgeBase('agent recall memory conversation prior remember voice', kb));
  check('uncovered lesson IS a gap', !coveredByKnowledgeBase('stripe arrears billing meter lookup frozen checkout copy', kb));
  check('thin material never cries gap', coveredByKnowledgeBase('two words', kb));

  // Merge semantics: a rejected candidate must never return as new.
  const prior = [{ id: 'x', dedupeKey: 'k', status: 'rejected', blockedBy: [], kbGap: false }];
  const merged = mergeQueue(prior, [{ id: 'x', dedupeKey: 'k', status: 'new', blockedBy: [], kbGap: false }]);
  check('rejected stays rejected', merged.queue[0].status === 'rejected');
  const rel = mergeQueue(
    [{ id: 'y', dedupeKey: 'k2', status: 'blocked', blockedBy: ['gareth'], kbGap: false }],
    [{ id: 'y', dedupeKey: 'k2', status: 'new', blockedBy: [], kbGap: false }],
  );
  check('pruning a term releases a block', rel.queue[0].status === 'new' && rel.released === 1);

  for (const f of fails) console.error(`  FAIL  ${f}`);
  console.log(fails.length ? `\nself-test: ${fails.length} FAILED` : 'self-test: 14/14 passed');
  return fails.length === 0;
}

// ---------------------------------------------------------------- main

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const since = (argv[argv.indexOf('--since') + 1] && argv.includes('--since')) ? argv[argv.indexOf('--since') + 1] : '2026-05-01';

  // Missing config FAILS rather than skips. A sanitisation gate that quietly does nothing
  // is indistinguishable from one that passed, which is the whole failure class this
  // series is about — we are not going to ship it inside the tool that reports on it.
  if (!existsSync(CONFIG_PATH)) {
    console.error(`driplet-harvest: no config at ${CONFIG_PATH}. Refusing to run — an unconfigured`);
    console.error('sanitisation gate would let every client name straight through.');
    process.exit(2);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (denyTerms(config).length === 0) {
    console.error('driplet-harvest: denylist is empty. Refusing to run.');
    process.exit(2);
  }

  if (argv.includes('--self-test')) process.exit(selfTest(config) ? 0 : 1);

  const kbDoc = readJson(join(REPO, config.sources.bugKnowledge), { entries: [] });
  const kbTokenSets = (kbDoc.entries ?? []).map((e) => new Set(tokens(JSON.stringify(e))));

  const raw = [
    ...harvestBugKnowledge(config),
    ...harvestMemory(config),
    ...harvestStandards(config),
    ...harvestCommits(config, since),
  ];
  const scored = raw.map((r) => makeCandidate(r, config, kbTokenSets));
  const harvested = scored.filter(admits);
  const belowFloor = scored.length - harvested.length;

  const existing = readJson(QUEUE_PATH, { candidates: [] }).candidates ?? [];
  const merged = mergeQueue(existing, harvested);
  const queue = merged.queue.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const by = (pred) => queue.filter(pred).length;
  const perSource = {};
  for (const c of harvested) perSource[c.source] = (perSource[c.source] ?? 0) + 1;

  console.log(`\nharvested ${harvested.length}  (${Object.entries(perSource).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`dropped   ${belowFloor}  — below the lesson-marker floor for their source`);
  console.log(`queue     ${queue.length}  (+${merged.added} new, ${merged.reblocked} newly blocked, ${merged.released} released)`);
  console.log(`blocked   ${by((c) => c.status === 'blocked')}  — sanitisation, will never draft`);
  console.log(`kb gaps   ${by((c) => c.kbGap)}  — lesson exists in a commit or standard, absent from bug-knowledge`);
  console.log(`ready     ${by((c) => c.status === 'new')}\n`);

  const ready = queue.filter((c) => c.status === 'new').slice(0, 10);
  if (ready.length) {
    console.log('top candidates to draft:');
    for (const c of ready) {
      console.log(`  [${String(c.score).padStart(2)}] ${c.origin.slice(0, 32).padEnd(33)} ${c.title.slice(0, 78)}`);
    }
    console.log('');
  }

  const gaps = queue.filter((c) => c.kbGap).slice(0, 10);
  if (gaps.length) {
    console.log('knowledge-base gaps — written up somewhere, absent from bug-knowledge.json:');
    for (const g of gaps) console.log(`  [${String(g.score).padStart(2)}] ${g.origin.slice(0, 32).padEnd(33)} ${g.title.slice(0, 78)}`);
    console.log('');
  }

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }
  mkdirSync(dirname(QUEUE_PATH), { recursive: true });
  writeFileSync(
    QUEUE_PATH,
    `${JSON.stringify({
      generated: new Date().toISOString().slice(0, 10),
      note: 'status is authoritative and is never overwritten by a harvest, except that sanitisation is re-evaluated every run. blocked candidates carry no material by design.',
      candidates: queue,
    }, null, 2)}\n`,
  );
  console.log(`wrote ${QUEUE_PATH}`);
}

if (process.argv[1] && process.argv[1].endsWith('driplet-harvest.mjs')) main();
