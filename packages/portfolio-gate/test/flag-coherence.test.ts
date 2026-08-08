import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  countOccurrences,
  detectMode,
  findViolations,
  runFlagCoherenceAudit,
} from '../src/audit/flag-coherence.js'

// The check exists because of a real half-flip: on 8 August 2026 one environment variable switched
// MMC Build's purchase CTAs on, eight surfaces changed, and two did not — including the homepage
// hero, which went on offering a waitlist and pointing at a contact form on a site that had just
// started selling. Build green, flag correct, 200 on every page.
//
// The first test is that exact page. A simplification that stops catching it turns this red.

const MODES = {
  purchase: { markers: ['Get started', 'Contact sales'], forbidden: ['waitlist'] },
  waitlist: { markers: ['Join Waitlist', 'Join the Waitlist'], forbidden: [] },
}

const HALF_FLIPPED_HOME = {
  path: '/',
  html: `<nav><a href="/signup">Get started</a></nav>
         <a class="btn" href="/contact">Join the Waitlist</a>`,
}
const FLIPPED_HOME = {
  path: '/',
  html: `<nav><a href="/signup">Get started</a></nav><a class="btn" href="/signup">Get started</a>`,
}
const PRICING = {
  path: '/pricing',
  html: `<a href="/signup">Get started</a><a href="/contact">Contact sales</a>`,
}

describe('the half-flip it was written for', () => {
  it('catches waitlist copy surviving after the site switched to purchase', () => {
    const docs = [HALF_FLIPPED_HOME, PRICING]
    expect(detectMode(MODES, docs)).toBe('purchase')
    const violations = findViolations('purchase', MODES, docs)
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('/')
  })

  it('reports context, not just a count', () => {
    // A number says something is wrong; the snippet says WHAT. On the day it was the context that
    // revealed the survivor was a hero button pointing at /contact.
    expect(findViolations('purchase', MODES, [HALF_FLIPPED_HOME])[0].context).toContain('/contact')
  })

  it('passes once every surface is flipped', () => {
    expect(findViolations('purchase', MODES, [FLIPPED_HOME, PRICING])).toHaveLength(0)
  })
})

describe('the wording trap that hid it', () => {
  it('matches the bare token however the phrase is worded', () => {
    // The verification bug: a grep for "join waitlist" returned zero while "Join THE Waitlist"
    // sat in the hero. Only the short token finds it.
    expect(countOccurrences(HALF_FLIPPED_HOME.html, 'join waitlist')).toBe(0)
    expect(countOccurrences(HALF_FLIPPED_HOME.html, 'waitlist')).toBe(1)
  })

  it('is case-insensitive and does not overlap-count', () => {
    expect(countOccurrences('Waitlist WAITLIST', 'waitlist')).toBe(2)
    expect(countOccurrences('aaaa', 'aa')).toBe(2)
  })
})

describe('mode detection', () => {
  it('fails rather than passes when the config has gone stale', () => {
    // No declared marker appears anywhere, so the check has stopped guarding what it was written
    // for. An assertion that no longer matches reality reads as green forever.
    expect(detectMode(MODES, [{ path: '/', html: '<h1>Redesigned</h1>' }])).toBeNull()
  })

  it('reports a tie as ambiguous instead of guessing', () => {
    expect(
      detectMode(MODES, [{ path: '/', html: '<a>Get started</a><a>Join Waitlist</a>' }]),
    ).toBe('__ambiguous__')
  })
})

describe('direction', () => {
  it('catches a ROLLBACK that strands purchase copy, not just a flip', () => {
    // Flipping this class of flag back is usually the fastest rollback a product has, so guarding
    // only one direction guards the wrong half.
    const modes = {
      purchase: { markers: ['Get started'], forbidden: ['waitlist'] },
      waitlist: { markers: ['Join Waitlist'], forbidden: ['get started'] },
    }
    const docs = [
      { path: '/', html: '<a>Join Waitlist</a><a>Join Waitlist</a><a>Get started</a>' },
    ]
    expect(detectMode(modes, docs)).toBe('waitlist')
    expect(findViolations('waitlist', modes, docs)).toHaveLength(1)
  })
})

describe('runFlagCoherenceAudit', () => {
  async function configDir(config: unknown): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'flagcoh-'))
    await writeFile(join(dir, 'flag-coherence.config.json'), JSON.stringify(config), 'utf8')
    return dir
  }

  const site = (pages: string[]) => ({
    sites: [
      {
        name: 'Test site',
        baseUrl: 'https://example.test',
        pages,
        flags: [{ name: 'purchase-cta', modes: MODES }],
      },
    ],
  })

  /**
   * Serve a different body per path.
   *
   * The first version of this helper returned ONE body for every URL, which made the audit test
   * unrealistic in a way that mattered: with a single page carrying one marker of each mode the
   * scores tie, so the audit correctly reported `ambiguous` rather than `half-flipped`. Both are
   * failures, but a real site has many pages — which is exactly why the marker count resolves.
   */
  const respondByPath = (bodies: Record<string, string>, status = 200) =>
    (async (input: string | URL) => {
      const path = new URL(String(input)).pathname
      return new Response(bodies[path] ?? '', { status })
    }) as unknown as typeof fetch

  const respondWith = (body: string, status = 200) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch

  it('SKIPS when the product declares no flags — that is genuine non-applicability', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flagcoh-none-'))
    const result = await runFlagCoherenceAudit({ cwd: dir })
    expect(result.skipped).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('fails on a half-flipped live site, naming the surviving surface', async () => {
    const dir = await configDir(site(['/', '/pricing']))
    const result = await runFlagCoherenceAudit({
      cwd: dir,
      fetchImpl: respondByPath({ '/': HALF_FLIPPED_HOME.html, '/pricing': PRICING.html }),
    })
    expect(result.passed).toBe(false)
    const finding = result.findings.find((f) => /HALF-FLIPPED/.test(f.message))
    expect(finding).toBeDefined()
    expect(finding?.file).toBe('/')
  })

  it('reports AMBIGUOUS when the site shows two modes equally', async () => {
    // Also a failure, and a different one worth distinguishing: not "somebody missed a surface"
    // but "this site cannot be said to be in either mode".
    const dir = await configDir(site(['/']))
    const result = await runFlagCoherenceAudit({
      cwd: dir,
      fetchImpl: respondWith(HALF_FLIPPED_HOME.html),
    })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => /equally present/.test(f.message))).toBe(true)
  })

  it('passes on a coherent live site', async () => {
    const dir = await configDir(site(['/', '/pricing']))
    const result = await runFlagCoherenceAudit({
      cwd: dir,
      fetchImpl: respondByPath({ '/': FLIPPED_HOME.html, '/pricing': PRICING.html }),
    })
    expect(result.passed).toBe(true)
  })

  it('FAILS on an unreachable page rather than skipping it', async () => {
    // A check that quietly does nothing is indistinguishable from one that succeeded — which is
    // the whole failure mode this package exists to end.
    const dir = await configDir(site(['/']))
    const result = await runFlagCoherenceAudit({
      cwd: dir,
      fetchImpl: respondWith('nope', 503),
    })
    expect(result.passed).toBe(false)
  })
})
