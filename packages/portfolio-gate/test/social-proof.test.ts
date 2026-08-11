import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSocialProofAudit } from '../src/audit/social-proof.js'

// Written after a REGULATED-tier client's live marketing site was found carrying eight real,
// named ASX-listed builders as "Trusted Partners", three invented testimonials, and
// "100+ professionals / $2M saved" — scaffold filler that had been public for months.

async function repoWith(file: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'socialproof-'))
  await mkdir(join(dir, 'src', 'components'), { recursive: true })
  await writeFile(join(dir, 'src', 'components', file), content, 'utf8')
  return dir
}

describe('known scaffold filler', () => {
  it('fails template testimonial copy outright', async () => {
    const dir = await repoWith(
      'Testimonials.tsx',
      `export const quotes = [{ name: "Jane Doe", text: "This product changed the way we work" }]
       // @social-proof-ok: attested by someone`,
    )
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.passed).toBe(false)
  })

  it('cannot be silenced by an attestation — filler is never genuine', async () => {
    // Deliberate: the marker exists to record a human decision about REAL content. A string that
    // ships in the template cannot become true because somebody signed for it.
    const dir = await repoWith(
      'Hero.tsx',
      `// @social-proof-ok: confirmed by me
       <h2>Trusted by industry leaders</h2>`,
    )
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => /filler/i.test(f.message))).toBe(true)
  })
})

describe('attestation', () => {
  it('fails an unattested testimonials block', async () => {
    const dir = await repoWith('Reviews.tsx', `export function Testimonial() { return null }`)
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.passed).toBe(false)
    expect(result.findings[0].message).toMatch(/Unattested/)
  })

  it('fails an unattested partner / "trusted by" block — the claim with legal consequences', async () => {
    const dir = await repoWith(
      'Partners.tsx',
      `<section><h2>Our Partners</h2><Logo name="Some ASX Builder" /></section>`,
    )
    expect((await runSocialProofAudit({ cwd: dir })).passed).toBe(false)
  })

  it('fails an unattested headline metric', async () => {
    const dir = await repoWith('Stats.tsx', `<p>100+ professionals already onboard</p>`)
    expect((await runSocialProofAudit({ cwd: dir })).passed).toBe(false)
  })

  it('passes a genuine block once a human has attested it', async () => {
    // One line, once. The point is not to make the check clever — it is to make the absence of a
    // human decision visible, because at MMC nobody had ever decided those names should be there.
    const dir = await repoWith(
      'Reviews.tsx',
      `// @social-proof-ok: 3 testimonials confirmed by Karen 2026-08-05, consent on file
       export function Testimonial() { return null }`,
    )
    expect((await runSocialProofAudit({ cwd: dir })).passed).toBe(true)
  })
})

describe('quiet on ordinary code', () => {
  it('does not flag a file with no social proof in it', async () => {
    const dir = await repoWith('Button.tsx', `export function Button() { return null }`)
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('skips a repo with no UI source rather than inventing a verdict', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'socialproof-empty-'))
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.skipped).toBe(true)
    expect(result.passed).toBe(true)
  })
})

describe('comments are not claims', () => {
  // Both of these happened for real. A claim is something a VISITOR can read;
  // a source comment is read by the next maintainer, and the honest way to
  // remove a false claim is to leave a note saying what it used to be and why.
  // A checker that punishes that teaches people to delete the explanation.

  it('does not report a comment explaining why a claim was removed', async () => {
    // MMC Build, 2026-08-09: the note recording why fabricated supplier prices
    // were deleted mentioned "partner logos and testimonials", and the audit
    // reported it as TWO unattested surfaces — on a repo whose three genuine
    // findings were already waiting on a client decision, so the noise sat on
    // top of the signal.
    const dir = await repoWith(
      'SupplierPlans.tsx',
      `/**
        * The figures were removed on 2026-08-09. That is the same reasoning the
        * client accepted for the partner logos and testimonials on SCRUM-376.
        */
       export const plans = [{ name: 'Verified Supplier' }]`,
    )
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.findings).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('does not fail on a comment that QUOTES a filler string it removed', async () => {
    // The original incident, and the reason offer-claims was built excluding
    // comments from the start.
    const dir = await repoWith(
      'Hero.tsx',
      `// Removed the scaffold quote "this product changed the way we work" on 5 Aug.
       export const Hero = () => null`,
    )
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.findings).toHaveLength(0)
  })

  it('still reports the same surface when it is REAL markup, not a comment', async () => {
    // The guard must not become a way to hide a live claim. Same words, outside
    // a comment.
    const dir = await repoWith(
      'Partners.tsx',
      `export const Partners = () => <section><h2>Our partners</h2></section>`,
    )
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.passed).toBe(false)
    expect(result.findings.some((f) => /partners/i.test(f.message))).toBe(true)
  })

  it('reports the line the reader would open, since blanking preserves newlines', async () => {
    const dir = await repoWith(
      'Wall.tsx',
      `// header\n// header\nexport const W = () => <div>Trusted by</div>`,
    )
    const result = await runSocialProofAudit({ cwd: dir })
    expect(result.findings[0]?.line).toBe(3)
  })
})
