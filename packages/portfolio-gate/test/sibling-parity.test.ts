import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasDependency, runSiblingParityAudit } from '../src/audit/sibling-parity.js'

// Written after three incidents in one week that were all the same structural fact: a setting and
// the code it depends on lived in different places, and only one was visible from where the person
// was standing. Each test below is one of them.

async function workspace(repos: Record<string, { pkg: object; files?: Record<string, string> }>) {
  const root = await mkdtemp(join(tmpdir(), 'sibling-'))
  for (const [name, spec] of Object.entries(repos)) {
    await mkdir(join(root, name), { recursive: true })
    await writeFile(join(root, name, 'package.json'), JSON.stringify(spec.pkg), 'utf8')
    for (const [rel, body] of Object.entries(spec.files ?? {})) {
      const dir = join(root, name, rel.split('/').slice(0, -1).join('/'))
      if (dir !== join(root, name)) await mkdir(dir, { recursive: true })
      await writeFile(join(root, name, rel), body, 'utf8')
    }
  }
  return root
}

async function withConfig(root: string, config: unknown) {
  await writeFile(join(root, 'sibling-parity.config.json'), JSON.stringify(config), 'utf8')
  return root
}

const REPOS = [
  { name: 'app', path: 'app' },
  { name: 'marketing', path: 'marketing' },
]

describe('shared dependency — the analytics incident', () => {
  it('fails when a dependency is in one sibling and not the other', async () => {
    // Exactly what happened: Vercel Analytics was toggled on for both projects, and only one repo
    // had @vercel/analytics. The toggle was on, the dashboard agreed, and the site had nothing to
    // send. Nothing failed anywhere.
    const root = await workspace({
      app: { pkg: { dependencies: { '@vercel/analytics': '^2.0.1' } } },
      marketing: { pkg: { dependencies: {} } },
    })
    await withConfig(root, {
      siblings: [{ name: 'pair', repos: REPOS, sharedDependencies: ['@vercel/analytics'] }],
    })
    const result = await runSiblingParityAudit({ cwd: root })
    expect(result.passed).toBe(false)
    expect(result.findings[0].detail).toContain('marketing')
  })

  it('passes when both have it', async () => {
    const root = await workspace({
      app: { pkg: { dependencies: { '@vercel/analytics': '^2.0.1' } } },
      marketing: { pkg: { dependencies: { '@vercel/analytics': '^2.0.1' } } },
    })
    await withConfig(root, {
      siblings: [{ name: 'pair', repos: REPOS, sharedDependencies: ['@vercel/analytics'] }],
    })
    expect((await runSiblingParityAudit({ cwd: root })).passed).toBe(true)
  })

  it('stays quiet when NEITHER has it — that is a choice, not a drift', async () => {
    const root = await workspace({
      app: { pkg: { dependencies: {} } },
      marketing: { pkg: { dependencies: {} } },
    })
    await withConfig(root, {
      siblings: [{ name: 'pair', repos: REPOS, sharedDependencies: ['@vercel/analytics'] }],
    })
    expect((await runSiblingParityAudit({ cwd: root })).passed).toBe(true)
  })

  it('counts devDependencies and peerDependencies too', () => {
    expect(hasDependency(JSON.stringify({ devDependencies: { x: '1' } }), 'x')).toBe(true)
    expect(hasDependency(JSON.stringify({ peerDependencies: { x: '1' } }), 'x')).toBe(true)
    expect(hasDependency('not json', 'x')).toBe(false)
  })
})

describe('identical files — the drift the flag PR guarded by hand', () => {
  it('fails when a by-design-identical file has drifted', async () => {
    // purchase-cta.ts was verified byte-identical with `diff` when it was written. That works
    // exactly once. The two pricing pages had already drifted apart before anyone noticed.
    const root = await workspace({
      app: { pkg: {}, files: { 'src/purchase-cta.ts': 'export const MODE = "purchase"' } },
      marketing: { pkg: {}, files: { 'src/purchase-cta.ts': 'export const MODE = "waitlist"' } },
    })
    await withConfig(root, {
      siblings: [{ name: 'pair', repos: REPOS, identicalFiles: ['src/purchase-cta.ts'] }],
    })
    const result = await runSiblingParityAudit({ cwd: root })
    expect(result.passed).toBe(false)
    expect(result.findings[0].message).toMatch(/DRIFTED/)
  })

  it('fails when the file exists in one sibling and not the other', async () => {
    const root = await workspace({
      app: { pkg: {}, files: { 'src/purchase-cta.ts': 'same' } },
      marketing: { pkg: {} },
    })
    await withConfig(root, {
      siblings: [{ name: 'pair', repos: REPOS, identicalFiles: ['src/purchase-cta.ts'] }],
    })
    expect((await runSiblingParityAudit({ cwd: root })).passed).toBe(false)
  })

  it('passes when they match byte for byte', async () => {
    const root = await workspace({
      app: { pkg: {}, files: { 'src/purchase-cta.ts': 'same' } },
      marketing: { pkg: {}, files: { 'src/purchase-cta.ts': 'same' } },
    })
    await withConfig(root, {
      siblings: [{ name: 'pair', repos: REPOS, identicalFiles: ['src/purchase-cta.ts'] }],
    })
    expect((await runSiblingParityAudit({ cwd: root })).passed).toBe(true)
  })
})

describe('live parity — the 200 vs 404 nobody saw', () => {
  const statuses = (byHost: Record<string, number>) =>
    (async (input: string | URL) => {
      const host = new URL(String(input)).host
      return new Response('', { status: byHost[host] ?? 200 })
    }) as unknown as typeof fetch

  const group = {
    name: 'sites',
    sites: [
      { name: 'app', baseUrl: 'https://app.test' },
      { name: 'marketing', baseUrl: 'https://www.test' },
    ],
    parityPaths: ['/_vercel/insights/script.js'],
  }

  it('fails when a path answers 200 on one site and 404 on the other', async () => {
    const root = await withConfig(await mkdtemp(join(tmpdir(), 'sib-')), { siblings: [group] })
    const result = await runSiblingParityAudit({
      cwd: root,
      fetchImpl: statuses({ 'app.test': 200, 'www.test': 404 }),
    })
    expect(result.passed).toBe(false)
    expect(result.findings[0].detail).toContain('marketing=404')
  })

  it('passes when both answer the same, INCLUDING both 404', async () => {
    // Both missing is a consistent state — possibly wrong, but not a parity defect, and this audit
    // must not claim to know which features a product ought to have.
    const root = await withConfig(await mkdtemp(join(tmpdir(), 'sib-')), { siblings: [group] })
    const result = await runSiblingParityAudit({
      cwd: root,
      fetchImpl: statuses({ 'app.test': 404, 'www.test': 404 }),
    })
    expect(result.passed).toBe(true)
  })
})

describe('partial runs are reported, never silently passed', () => {
  it('warns when a sibling repo is not checked out, and still runs the live checks', async () => {
    // The CI case: one repo present. A comparison that silently compared one thing to itself
    // would pass forever, which is the failure this whole package exists to end.
    const root = await workspace({ app: { pkg: { dependencies: {} } } })
    await withConfig(root, {
      siblings: [
        {
          name: 'pair',
          repos: REPOS,
          sharedDependencies: ['@vercel/analytics'],
          sites: [
            { name: 'app', baseUrl: 'https://app.test' },
            { name: 'marketing', baseUrl: 'https://www.test' },
          ],
          parityPaths: ['/x'],
        },
      ],
    })
    const result = await runSiblingParityAudit({
      cwd: root,
      fetchImpl: (async () => new Response('', { status: 200 })) as unknown as typeof fetch,
    })
    expect(result.findings.some((f) => f.severity === 'warn' && /SKIPPED/.test(f.message))).toBe(
      true,
    )
    // The warning does not fail the build — but it IS in the output, which is the point.
    expect(result.passed).toBe(true)
  })

  it('skips entirely when no siblings are declared', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sib-none-'))
    const result = await runSiblingParityAudit({ cwd: root })
    expect(result.skipped).toBe(true)
    expect(result.passed).toBe(true)
  })
})
