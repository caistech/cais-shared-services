/**
 * Input-response audit — when a visitor types something and submits it, do they get ANYTHING back?
 *
 * WHY THIS EXISTS. Two products, found independently on the same day, same shape:
 *
 *   - Kira put a voice agent on its public page. With no microphone it degraded to a text box.
 *     A tester typed the question his whole purchase turned on — "Who else can see what I tell you?
 *     My staff don't know I'm selling." — and pressed Send. The box cleared. Nothing came back. No
 *     answer, no thinking indicator, no error. NOT ONE NETWORK REQUEST LEFT THE PAGE. The widget's
 *     text fallback hands the value to an optional `onTextFallbackSubmit` callback and clears the
 *     input regardless; the consumer had never supplied one.
 *   - ExecutorAI rendered its assistant on every surface while `/api/convai/agent` answered 503.
 *
 * WHAT DEFEATED THE EXISTING CHECKS, and it is the reason this file is worth its cost: the
 * portfolio's `voice-agent` audit passes on BOTH. Its own docstring says it "Scans for: Import of
 * VoiceWidget ... Presence on any page." It is a PRESENCE check, and both products presented a
 * widget that was present and did nothing. The same day, a report described the Kira widget as
 * "launcher x 2, panel x 1 — the voice agent is live". Both numbers were true.
 *
 * That is TESTING_STANDARD §2.2 — proving presence and reporting function — and no amount of
 * writing it down fixed it, because the presence check is the easy one to write and it goes green.
 * So: if a control accepts input, this submits input and asserts the RESPONSE.
 *
 * ⚠️ SIDE EFFECTS — READ BEFORE MARKING A PAGE. This check TYPES INTO AND SUBMITS the inputs on
 * every page you mark, against whatever base URL you point it at, which is normally production.
 * Marking a signup form creates accounts. Marking a forgot-password box sends real mail to whatever
 * address is typed. Marking an outreach or contact form sends real messages to real people.
 *
 * The marker is therefore a STATEMENT OF CONSENT, not merely a target: `@accepts-input` means "it
 * is safe to submit junk into this surface repeatedly, forever, on every push." Mark the assistant
 * box; do not mark the signup form. There is deliberately no "mark everything" mode, and that is
 * why the check is opt-in per page rather than inheriting `@public-route`.
 *
 * A launcher may guard the input (Kira's box only appears after clicking "Talk to the assistant"),
 * so the marker takes an optional selector to click first:
 *
 *     // @accepts-input open=".convai-launch"
 *
 * REQUIRES PLAYWRIGHT, which is already an optional peer of this package. Unlike first-paint, the
 * defect is not in the served HTML — the markup is perfectly correct and the failure is in what
 * happens on submit — so there is no cheaper transport that could see it. SKIPS when no page is
 * marked (genuine non-applicability). FAILS when a page IS marked and playwright is absent: the
 * repo asked for this check, and a check that quietly does nothing is indistinguishable from one
 * that passed.
 */
import { relative, resolve } from 'node:path'
import { type AuditFinding, type AuditResult, readFileOptional, walkFiles } from './shared.js'
import { urlPathForRoute } from './machine-routes.js'

export const INPUT_MARKER = '@accepts-input'

const APP_DIRS = ['src/app', 'app']

/** What we type. Recognisable in a log, and obviously not a real person's data. */
export const PROBE_TEXT = 'portfolio-gate input probe: does this answer?'

/** How long to wait after submitting before deciding nothing came back. */
const DEFAULT_SETTLE_MS = 5_000

/**
 * Growth in visible text that counts as "something came back".
 *
 * Low on purpose. An error message is a PASS here — "we could not answer that" is the product
 * degrading honestly, which is the documented requirement. Silence is the defect.
 */
const MIN_RESPONSE_CHARS = 12

/**
 * How many times each marked page is exercised.
 *
 * Five, not one, because a single run cannot distinguish a working surface from one that works
 * two times in five — and not twenty, because each attempt costs a page load, a click and a settle
 * window, and a gate nobody wants to wait for is a gate that gets removed from CI.
 */
export const DEFAULT_ATTEMPTS = 5

/**
 * Fraction of attempts that must answer.
 *
 * Not 1.0. A hard requirement of perfection makes one transient network blip a red build, which
 * trains people to re-run the gate until it passes — and a gate you re-run until it goes green is
 * not a gate. Silence is judged separately and is never tolerated at any rate.
 */
export const DEFAULT_MIN_PASS_RATE = 0.8

/**
 * Fraction of attempts allowed to open with nothing to type into.
 *
 * Tighter than the answer threshold, deliberately. A slow endpoint is bad luck; a control that
 * opens empty is the product visibly not working, and one visitor in ten is far too many for the
 * surface a landing page invites everyone to click.
 */
export const REVEAL_TOLERANCE = 0.1

export interface InputResponseOptions {
  rootDir?: string
  baseUrl?: string
  settleMs?: number
  /** Times to exercise each page. Defaults to DEFAULT_ATTEMPTS. */
  attempts?: number
  /** Fraction of attempts that must answer. Defaults to DEFAULT_MIN_PASS_RATE. */
  minPassRate?: number
  /** Injected for tests — a function returning a playwright-like module. */
  browserFactory?: () => Promise<unknown>
}

export interface MarkedInputRoute {
  file: string
  urlPath: string
  /** Optional selector clicked before looking for inputs (a launcher / disclosure control). */
  openSelector: string | null
}

/**
 * Parse `@accepts-input [open="<selector>"]` out of a source file.
 *
 * Exported because the parsing, not the browser work, is what a regression would silently break:
 * a marker whose selector stopped being read would leave the check probing a page whose input is
 * still behind an unclicked launcher, finding no inputs, and reporting a pass.
 */
export function parseInputMarker(src: string): { marked: boolean; openSelector: string | null } {
  const line = src.split(/\r?\n/).find((l) => l.includes(INPUT_MARKER))
  if (!line) return { marked: false, openSelector: null }
  const open = /open\s*=\s*["']([^"']+)["']/.exec(line)
  return { marked: true, openSelector: open?.[1] ?? null }
}

export async function findMarkedInputRoutes(rootDir: string): Promise<MarkedInputRoute[]> {
  const marked: MarkedInputRoute[] = []
  for (const appDir of APP_DIRS) {
    const abs = resolve(rootDir, appDir)
    let files: string[] = []
    try {
      files = await walkFiles(abs, { extensions: ['.ts', '.tsx', '.js', '.jsx'] })
    } catch {
      continue
    }
    for (const file of files) {
      if (!/[\\/]page\.(ts|tsx|js|jsx)$/.test(file)) continue
      const src = await readFileOptional(file)
      if (!src) continue
      const { marked: isMarked, openSelector } = parseInputMarker(src)
      if (!isMarked) continue
      marked.push({
        file: relative(rootDir, file),
        urlPath: urlPathForRoute(rootDir, appDir, file),
        openSelector,
      })
    }
  }
  return marked
}

export interface ProbeOutcome {
  inputsFound: number
  requestsAfterSubmit: string[]
  textGrowth: number
  error?: string
}

export interface AttemptSummary {
  attempts: number
  /** Attempts that actually reached the page. THE denominator for every rate. */
  exercised: number
  answered: number
  silent: number
  noInput: number
  errored: number
  /** answered / exercised, or 0 when nothing could be exercised. */
  rate: number
  firstError: string | null
}

/**
 * Tally a set of attempts into the numbers every verdict is computed from.
 *
 * Extracted so the arithmetic is testable without a browser, because this is precisely where the
 * check's worst defect lived: the rate was `answered / attempts`, so five attempts that never
 * reached the site reported "answered in only 0 of 5 attempts (0%)" — a confident accusation about
 * a product it had never contacted. An error is not a product failure, and that distinction lives
 * entirely in the denominator.
 */
export function summariseAttempts(outcomes: ProbeOutcome[]): AttemptSummary {
  const errored = outcomes.filter((o) => o.error)
  const reached = outcomes.filter((o) => !o.error)
  const noInput = reached.filter((o) => o.inputsFound === 0)
  const submitted = reached.filter((o) => o.inputsFound > 0)
  const answered = submitted.filter(
    (o) => o.requestsAfterSubmit.length > 0 || o.textGrowth >= MIN_RESPONSE_CHARS
  )
  const silent = submitted.filter(
    (o) => o.requestsAfterSubmit.length === 0 && o.textGrowth < MIN_RESPONSE_CHARS
  )
  const exercised = reached.length
  return {
    attempts: outcomes.length,
    exercised,
    answered: answered.length,
    silent: silent.length,
    noInput: noInput.length,
    errored: errored.length,
    rate: exercised > 0 ? answered.length / exercised : 0,
    firstError: errored[0]?.error ?? null,
  }
}

/**
 * Drive one page: open it, reveal the input if a launcher is named, type, submit, and watch.
 *
 * Records BOTH signals — network and rendered text — because either one alone is wrong. A page
 * that answers from cached client state fires no request; a page that fires a request and renders
 * nothing has still left the visitor staring at a cleared box, which is the original defect.
 */
async function probePage(
  browser: { newPage: () => Promise<Record<string, (...args: never[]) => unknown>> },
  url: string,
  route: MarkedInputRoute,
  settleMs: number
): Promise<ProbeOutcome> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const page: any = await (browser as any).newPage()
  const requests: string[] = []
  let submitted = false

  page.on('request', (req: any) => {
    const type = req.resourceType?.()
    if (submitted && (type === 'xhr' || type === 'fetch')) requests.push(req.url())
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(1_500) // let hydration attach its handlers

    if (route.openSelector) {
      // WAIT for the launcher, then click, and let a failure be a failure.
      //
      // This was `if (await launcher.count()) { click().catch(() => undefined) }`, which is three
      // silent no-ops in one line: a launcher that has not rendered yet counts 0 and is never
      // clicked, and a click that throws is swallowed. Either way the run continued to "no input
      // found" and blamed the page. The audit spent three runs accusing a working widget.
      const launcher = page.locator(route.openSelector).first()
      try {
        await launcher.waitFor({ state: 'visible', timeout: 15_000 })
        await launcher.click({ timeout: 10_000 })
      } catch (err) {
        return {
          inputsFound: 0,
          requestsAfterSubmit: [],
          textGrowth: 0,
          error:
            `the launcher "${route.openSelector}" could not be clicked — ` +
            `${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
        }
      }
      await page.waitForTimeout(1_500)
    }

    // Find the field by walking `input, textarea` and testing each, NOT with a clever selector.
    //
    // The first version used `input:not([type]):visible`, which matched the real control on some
    // runs and not others — the audit passed once and failed the next time against an unchanged
    // page. A flaky gate is worse than no gate, because it gets switched off. The widget's box is
    // an `<input>` with NO type attribute (placeholder "Type your question"), which is exactly the
    // case `:not([type])` was reaching for and exactly the case it handled unreliably.
    //
    // Playwright's auto-waiting is used deliberately here rather than a fixed sleep: waiting for
    // the first candidate to attach is what makes this deterministic.
    const candidates = page.locator('input, textarea')
    await candidates.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined)

    const total: number = await candidates.count()
    let target: any = null
    let count = 0
    for (let i = 0; i < total; i += 1) {
      const el = candidates.nth(i)
      const type = ((await el.getAttribute('type')) ?? 'text').toLowerCase()
      // Only fields a person types prose into. A checkbox or a submit button is not an input in
      // the sense this audit means, and filling one proves nothing.
      if (!['text', 'search', 'email', 'tel', 'url', ''].includes(type)) continue
      if (!(await el.isVisible().catch(() => false))) continue
      if (!(await el.isEditable().catch(() => false))) continue
      count += 1
      if (!target) target = el
    }

    if (!target) {
      return { inputsFound: 0, requestsAfterSubmit: [], textGrowth: 0 }
    }
    const before: string = await page.evaluate(() => document.body.innerText || '')

    await target.fill(PROBE_TEXT)
    submitted = true
    await target.press('Enter')
    await page.waitForTimeout(settleMs)

    const after: string = await page.evaluate(() => document.body.innerText || '')

    // The probe text itself is not a response — an input echoing what was typed proves nothing.
    const growth = after.replace(PROBE_TEXT, '').length - before.length

    return { inputsFound: count, requestsAfterSubmit: requests, textGrowth: growth }
  } catch (err) {
    return {
      inputsFound: 0,
      requestsAfterSubmit: requests,
      textGrowth: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await page.close().catch(() => undefined)
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function runInputResponseAudit(
  options: InputResponseOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const minPassRate = options.minPassRate ?? DEFAULT_MIN_PASS_RATE
  const findings: AuditFinding[] = []

  const marked = await findMarkedInputRoutes(rootDir)

  if (marked.length === 0) {
    return {
      audit: 'input-response',
      rule: 'R20',
      passed: true,
      skipped: true,
      skipReason:
        `No pages marked ${INPUT_MARKER}. If this product has an assistant, a search box or any ` +
        'surface a visitor types into, mark it — the presence checks in this package all pass ' +
        'over a control that renders perfectly and swallows what is typed into it. Do NOT mark a ' +
        'form with side effects (signup, password reset, contact): this check really submits.',
      findings,
      durationMs: Date.now() - start,
    }
  }

  if (!options.baseUrl) {
    return {
      audit: 'input-response',
      rule: 'R20',
      passed: false,
      findings: [
        {
          severity: 'fail',
          message: `${marked.length} page(s) marked ${INPUT_MARKER} but no base URL was supplied — nothing was submitted.`,
          detail:
            'Pass --base-url, or PORTFOLIO_GATE_PREVIEW_URL / PUBLIC_ALIAS in the environment.',
        },
      ],
      durationMs: Date.now() - start,
    }
  }

  let playwright: { chromium: { launch: (o: unknown) => Promise<unknown> } }
  try {
    playwright = options.browserFactory
      ? ((await options.browserFactory()) as typeof playwright)
      : ((await import('playwright')) as unknown as typeof playwright)
  } catch {
    return {
      audit: 'input-response',
      rule: 'R20',
      passed: false,
      findings: [
        {
          severity: 'fail',
          message: `${marked.length} page(s) marked ${INPUT_MARKER} but playwright is not installed — no input was ever submitted.`,
          detail:
            'Install it (`npm i -D playwright && npx playwright install chromium`). This FAILS ' +
            'rather than skips because the repo opted in by marking a page: an unexercised input ' +
            'is the bug this audit exists to find, and a silent skip looks exactly like a pass.',
        },
      ],
      durationMs: Date.now() - start,
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // Bundled chromium first; an installed Chrome second.
  //
  // The fallback is not a nicety. Playwright ships a browser build pinned to its exact version, so
  // a machine with four cached chromium builds and a system Chrome still refuses to launch after a
  // playwright bump until someone runs `playwright install` again. A check that cannot start is a
  // check that gets switched off, and this one costs a browser to run already.
  let browser: any
  try {
    browser = await (playwright.chromium as any).launch({ headless: true })
  } catch (bundledErr) {
    try {
      browser = await (playwright.chromium as any).launch({ headless: true, channel: 'chrome' })
    } catch {
      return {
        audit: 'input-response',
        rule: 'R20',
        passed: false,
        findings: [
          {
            severity: 'fail',
            message: `${marked.length} page(s) marked ${INPUT_MARKER} but no browser could be launched — no input was submitted.`,
            detail:
              `Bundled chromium failed (${bundledErr instanceof Error ? bundledErr.message.split('\n')[0] : 'unknown'}) ` +
              'and no system Chrome was found. Run `npx playwright install chromium`. Failing ' +
              'rather than skipping: the repo opted in, and an unexercised input is the bug.',
          },
        ],
        durationMs: Date.now() - start,
      }
    }
  }
  try {
    for (const route of marked) {
      const url = `${options.baseUrl.replace(/\/+$/, '')}${route.urlPath}`

      // ATTEMPT N TIMES AND REPORT A RATE, rather than deciding on one run.
      //
      // This is not defensive padding against a flaky check — it is the only honest way to judge a
      // surface that behaves differently run to run, and Kira's does. Ten hand probes of one
      // widget: the panel opened 10/10 and the text box appeared in FOUR. The other six showed the
      // launcher again, so most visitors click "Talk to the assistant", get a panel and find
      // nothing to type into.
      //
      // A single-run verdict against that is a coin toss. It passed once and failed the next three
      // times against unchanged code, and a gate that does that is switched off within a week —
      // at which point the defect it was built for ships freely. The rate turns "this surface is
      // unreliable" from a thing a person notices into a number the gate can state.
      const outcomes: ProbeOutcome[] = []
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        outcomes.push(await probePage(browser, url, route, settleMs))
      }

      // AN ERROR IS NOT A PRODUCT FAILURE, and the denominator is where that distinction lives.
      // The arithmetic is in summariseAttempts() so it can be regression-tested without a browser —
      // see the top of that function for the defect it exists to prevent recurring.
      const s = summariseAttempts(outcomes)
      const { exercised, rate } = s
      const errored = outcomes.filter((o) => o.error)
      const noInput = { length: s.noInput }
      const answered = { length: s.answered }
      const silent = { length: s.silent }
      const breakdown =
        `${attempts} attempts: ${s.answered} answered, ${s.silent} took the text and ` +
        `said nothing, ${s.noInput} had no input to type into, ${s.errored} errored`

      if (exercised === 0) {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} could NOT be exercised — all ${attempts} attempts errored before reaching the page.`,
          file: route.file,
          detail:
            `${breakdown}. This says nothing about the product: the browser never got there. ` +
            'Usual causes are a dropped network, a navigation timeout, or an unreachable base URL. ' +
            'It still FAILS, because a run that established nothing must never be reported as a ' +
            `pass — but fix the connection, not the page. First error: ${errored[0]?.error ?? 'unknown'}`,
        })
        continue
      }

      // Silence is the original defect and is never acceptable at any rate: the visitor typed the
      // question their purchase turns on and the box cleared. One occurrence is a failure.
      if (silent.length > 0) {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} accepted a submission and gave nothing back in ${silent.length} of ${exercised} exercised attempts.`,
          file: route.file,
          detail:
            `${breakdown}. The value was taken and the page neither called anything nor said ` +
            'anything. This is the failure a presence check cannot see: the control renders, so ' +
            'it looks live. If the surface genuinely cannot answer, it must SAY so — an honest ' +
            'refusal passes this audit, silence does not.',
        })
      }

      // THE REVEAL RATE IS ITS OWN VERDICT, separate from whether the thing answered.
      //
      // Collapsing them hides the more visible bug. "The endpoint was slow" and "the visitor
      // clicked your front door and the panel opened empty" are different failures with different
      // owners, and only the second one is what a person actually experiences as the product being
      // broken. Measured on Kira: the panel opened 10/10 while the text box appeared 4/10 on one
      // sweep and 8/10 an hour later — so a run of five can pass on luck while a fifth of real
      // visitors are getting nothing.
      const revealFailures = noInput.length
      if (revealFailures > 0 && revealFailures / exercised > REVEAL_TOLERANCE) {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} opened without any text input in ${revealFailures} of ${exercised} exercised attempts (${Math.round((revealFailures / exercised) * 100)}%).`,
          file: route.file,
          detail:
            `${breakdown}. The control was clicked and revealed nothing to type into. This is a ` +
            'race in the control revealing itself, not a backend problem — chasing the endpoint ' +
            'will find nothing wrong with it. Those visitors clicked the thing you asked them to ' +
            'click and got an empty box; they do not report it, they leave.',
        })
      }

      if (rate < minPassRate) {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} answered in only ${answered.length} of ${exercised} exercised attempts (${Math.round(rate * 100)}%, minimum ${Math.round(minPassRate * 100)}%).`,
          file: route.file,
          detail:
            `${breakdown}. A surface that works some of the time is not a working surface: the ` +
            'visitors it fails are the ones who leave, and they do not report it. If the rate is ' +
            'high but not perfect, the bug is a race in the control revealing itself, not an ' +
            'outage — chase the reveal, not the endpoint.',
        })
      } else if (rate < 1) {
        findings.push({
          severity: 'warn',
          message: `${route.urlPath} answered in ${answered.length} of ${exercised} exercised attempts (${Math.round(rate * 100)}%).`,
          file: route.file,
          detail: `${breakdown}. Above the threshold, but not every visitor is getting through.`,
        })
      }

      // Errors are reported separately from the rate, because "the launcher could not be clicked"
      // is a different problem from "it was clicked and answered nothing", and collapsing them
      // sends whoever reads this to the wrong place.
      for (const e of errored.slice(0, 2)) {
        findings.push({
          severity: 'warn',
          message: `${route.urlPath}: an attempt could not be exercised — ${e.error}`,
          file: route.file,
        })
      }

      if (noInput.length === exercised) {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} is marked ${INPUT_MARKER} but no visible text input was found in ANY of ${exercised} exercised attempts.`,
          file: route.file,
          detail: route.openSelector
            ? `Clicked "${route.openSelector}" first and still found nothing. Either the selector ` +
              'is stale or the control no longer renders — both mean a visitor cannot type here.'
            : 'If the input only appears after clicking a launcher, name it: ' +
              `\`// ${INPUT_MARKER} open=".your-launcher"\`.`,
        })
      }
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    audit: 'input-response',
    rule: 'R20',
    passed: findings.every((f) => f.severity !== 'fail'),
    findings,
    durationMs: Date.now() - start,
  }
}
