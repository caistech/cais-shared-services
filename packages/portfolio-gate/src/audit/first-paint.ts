/**
 * First-paint content audit — does the page the visitor lands on actually SHOW them anything
 * before the JavaScript arrives?
 *
 * WHY THIS EXISTS. Kira shipped three pages behind its three main CTAs that rendered a header, a
 * footer, and nothing in between: `/plan` blank for ~15s, `/genome` 8s+, `/login` ~7s. No spinner,
 * no skeleton, no console error. The tester's verdict is the whole argument for this file:
 *
 *   "Fifteen seconds of white on the page where you ask for my card is not a slow page, it's a
 *    broken one, and I have no way to tell the difference."
 *
 * WHAT DEFEATED THE EXISTING CHECKS. Every reachability signal was green and correct. The pages
 * answered **200**, served the right commit, carried the product name, and were not redirected —
 * so `deploy-status`, `smoke-routes` and `public-routes` all passed over them, because each of
 * those asks whether the page RESPONDS, and this asks whether it says anything. A page that is
 * `'use client'` at the top level serves its shell from the server and paints its content only
 * after hydration, which is invisible to every status-code assertion in this package.
 *
 * THE TRAP THIS FILE EXISTS TO AVOID, and the reason the obvious implementation is wrong: those
 * blank pages were NOT empty documents. They served a full site header and a full site footer.
 * A check that asks "does the response contain visible text" therefore PASSES on the exact defect
 * it was written for. So the assertion is deliberately narrower:
 *
 *   **visible text OUTSIDE the page chrome**, where chrome = <header>, <footer> and <nav>.
 *
 * That is not a refinement, it is the check. Counting all body text reproduces the false negative.
 *
 * NO BROWSER REQUIRED, which is why this is cheap enough to run on every push. The defect lives in
 * the server response itself — the shell arrives with the content missing — so a plain `fetch` of
 * the HTML sees precisely what the visitor sees in second one. Measuring time-to-paint in a real
 * browser would catch the same thing more expensively and more flakily.
 *
 * SCOPE reuses the existing `@public-route` marker rather than inventing a second one. A marker
 * nobody remembers to add is worse than no marker, and any page worth publishing is worth painting.
 *
 * SKIPS when no routes are marked (genuine non-applicability, matching public-routes). FAILS when
 * routes ARE marked but no base URL was supplied — an unverified page is the bug itself, and a
 * check that quietly does nothing is indistinguishable from one that passed.
 */
import { type AuditFinding, type AuditResult } from './shared.js'
import { findMarkedPublicRoutes, probePublicRoute } from './public-routes.js'

/**
 * Minimum characters of visible, non-chrome text a painted page must serve.
 *
 * Deliberately generous. The observed failures served ZERO; a real content page serves thousands.
 * The gap between them is wide enough that a low bar catches the defect without ever arguing with
 * a legitimately sparse page.
 */
export const DEFAULT_MIN_CHARS = 200

/**
 * Minimum characters in a heading for it to count as "the visitor can tell where they are".
 * Guards against an empty or single-character <h1> used as a layout device.
 */
export const MIN_HEADING_CHARS = 8

/** Elements whose text is page chrome, not page content. */
const CHROME_TAGS = new Set(['header', 'footer', 'nav'])

/** Elements that name the page to its visitor. */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3'])

/** Elements whose text content is never visible to a reader. */
const MUTED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head'])

export interface FirstPaintOptions {
  rootDir?: string
  /** Public production/preview origin to probe. Required once any route is marked. */
  baseUrl?: string
  /** Minimum non-chrome visible characters. Defaults to DEFAULT_MIN_CHARS. */
  minChars?: number
  timeoutMs?: number
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export interface PaintMeasurement {
  /** Visible characters anywhere in the body, chrome included. */
  totalChars: number
  /** Visible characters outside <header>/<footer>/<nav>. THE number this audit judges. */
  contentChars: number
  /** Text of the first <h1>/<h2>/<h3> outside the chrome, if any. */
  heading: string
  /** First ~80 characters of the content text, for a legible failure message. */
  sample: string
}

/**
 * Measure visible text in an HTML document, separating page content from page chrome.
 *
 * Hand-written scanner rather than a regex, because chrome nests: a `<header>` containing a `<nav>`
 * breaks any non-greedy `<header>.*?</header>` pattern, and getting that wrong silently under-counts
 * chrome — which would reintroduce the very false negative documented at the top of this file.
 * Depth counting is the only way to be right about it without taking a parser dependency.
 */
export function measureVisibleText(html: string): PaintMeasurement {
  let total = ''
  let content = ''
  let heading = ''
  let chromeDepth = 0
  let mutedDepth = 0
  let headingDepth = 0
  let index = 0

  while (index < html.length) {
    const nextTag = html.indexOf('<', index)

    if (nextTag === -1) {
      const text = html.slice(index)
      if (mutedDepth === 0) {
        total += text
        if (chromeDepth === 0) {
          content += text
          if (headingDepth > 0) heading += text
        }
      }
      break
    }

    if (nextTag > index) {
      const text = html.slice(index, nextTag)
      if (mutedDepth === 0) {
        total += text
        if (chromeDepth === 0) {
          content += text
          if (headingDepth > 0) heading += text
        }
      }
    }

    // Comments carry no visible text and may contain anything, including stray '>' characters.
    if (html.startsWith('<!--', nextTag)) {
      const end = html.indexOf('-->', nextTag)
      index = end === -1 ? html.length : end + 3
      continue
    }

    const tagEnd = html.indexOf('>', nextTag)
    if (tagEnd === -1) break

    const raw = html.slice(nextTag + 1, tagEnd)
    const closing = raw.startsWith('/')
    const selfClosing = raw.endsWith('/')
    const name = raw.replace(/^\//, '').split(/[\s/>]/, 1)[0]?.toLowerCase() ?? ''

    if (!selfClosing) {
      if (CHROME_TAGS.has(name)) {
        if (closing) chromeDepth = Math.max(0, chromeDepth - 1)
        else chromeDepth += 1
      } else if (HEADING_TAGS.has(name)) {
        // Only the FIRST heading is kept: it is the one that names the page. Later headings belong
        // to content, which the character count already measures.
        if (closing) headingDepth = Math.max(0, headingDepth - 1)
        else if (heading.trim().length === 0) headingDepth += 1
      } else if (MUTED_TAGS.has(name)) {
        if (closing) mutedDepth = Math.max(0, mutedDepth - 1)
        else mutedDepth += 1
      }
    }

    index = tagEnd + 1
  }

  const clean = (value: string): string =>
    value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      // Numeric character references, BOTH forms. Handling only the decimal one was a real bug:
      // Next.js emits apostrophes as the HEX form (`&#x27;`), so "what&#x27;s" was counted as
      // eleven visible characters instead of six — inflating every measurement on any page with
      // an apostrophe in it, which is most of them.
      .replace(/&#x[0-9a-f]+;/gi, "'")
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const contentText = clean(content)
  return {
    totalChars: clean(total).length,
    contentChars: contentText.length,
    heading: clean(heading),
    sample: contentText.slice(0, 80),
  }
}

/**
 * Does this measurement count as a painted page?
 *
 * Extracted from the audit runner so it can be tested without a deployment. The disjunction below
 * is a decision with a rationale, and a decision buried inside a network-bound loop is a decision
 * nobody can regression-test — which is how three defects reached production in checks written to
 * catch defects reaching production.
 */
export function paintPasses(
  measurement: PaintMeasurement,
  minChars: number = DEFAULT_MIN_CHARS
): boolean {
  return (
    measurement.contentChars >= minChars || measurement.heading.length >= MIN_HEADING_CHARS
  )
}

export async function runFirstPaintAudit(
  options: FirstPaintOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS
  const findings: AuditFinding[] = []

  const marked = await findMarkedPublicRoutes(rootDir)

  if (marked.length === 0) {
    return {
      audit: 'first-paint',
      rule: 'R2',
      passed: true,
      skipped: true,
      skipReason:
        'No pages marked @public-route. Mark the pages behind your primary CTAs — a page that ' +
        'answers 200 with its content missing passes every status-code check in this package.',
      findings,
      durationMs: Date.now() - start,
    }
  }

  if (!options.baseUrl) {
    return {
      audit: 'first-paint',
      rule: 'R2',
      passed: false,
      findings: [
        {
          severity: 'fail',
          message: `${marked.length} route(s) marked @public-route but no base URL was supplied — first paint was NOT verified.`,
          detail:
            'Pass --base-url <public production or preview origin>, or PORTFOLIO_GATE_PREVIEW_URL / ' +
            'PUBLIC_ALIAS in the environment. This FAILS rather than skips, for the same reason ' +
            'public-routes does: a check that quietly does nothing looks identical to one that passed.',
        },
      ],
      durationMs: Date.now() - start,
    }
  }

  let measuredRoutes = 0
  let unmeasuredRoutes = 0

  for (const route of marked) {
    const probe = await probePublicRoute(options.baseUrl, route.urlPath, route.file, {
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    })

    if (probe.error) {
      findings.push({
        severity: 'fail',
        message: `${route.urlPath} could not be reached: ${probe.error}`,
        file: route.file,
      })
      continue
    }

    // Reachability is public-routes' verdict, not this one — reporting a 307-to-login as a
    // first-paint defect would double-count one bug and obscure which check established what.
    //
    // But NOT MEASURED MUST NOT READ AS PASSED. Skipping silently is how this check reported a
    // clean green against a Vercel-protected preview that redirected all eleven routes to an SSO
    // wall: 0 findings, exit 0, nothing whatsoever verified. That is the exact failure the rest of
    // this package rails against, reintroduced here on the first run. So an unmeasurable route is
    // recorded as a warning, and the run FAILS below if none could be measured at all.
    if (probe.status !== 200) {
      unmeasuredRoutes += 1
      findings.push({
        severity: 'warn',
        message: `${route.urlPath} answered ${probe.status} — first paint could NOT be measured.`,
        file: route.file,
        detail:
          'Whether the route should answer 200 is public-routes’ verdict, not this one. What ' +
          'matters here is that this page was not checked, which is not the same as it passing. A ' +
          'protected preview redirects everything to an SSO wall and would otherwise score green.',
      })
      continue
    }
    measuredRoutes += 1

    const measured = measureVisibleText(probe.body)

    // A page passes on EITHER signal, and the disjunction is deliberate.
    //
    // A character count alone is wrong at both ends. A sign-in page is legitimately sparse — a
    // heading, a subtitle and two fields — and holding it to a prose threshold pressures whoever
    // is fixing it to pad the page with copy written to satisfy an assertion, which is a worse
    // outcome than the defect. Meanwhile a heading alone is a weak signal on a page that is
    // supposed to be selling something.
    //
    // So: enough text, OR a heading that tells the visitor where they are. That is the line the
    // tester actually drew — "fifteen seconds of white ... and I have no way to tell the
    // difference." Having no way to tell is the defect; sparseness is not.
    if (paintPasses(measured, minChars)) continue

    // Compare chrome against the CONTENT, not against the minimum. "A header and a footer with
    // nothing between them" is the diagnosis worth printing, and it is true whenever chrome
    // outweighs content — even on a page whose chrome is itself small.
    const chromeChars = measured.totalChars - measured.contentChars
    const chromeOnly = chromeChars >= 50 && chromeChars > measured.contentChars
    findings.push({
      severity: 'fail',
      message:
        `${route.urlPath} answered 200 but served only ${measured.contentChars} characters of ` +
        `visible content (minimum ${minChars}).`,
      file: route.file,
      detail: chromeOnly
        ? `The response carries ${chromeChars} characters of chrome and ${measured.contentChars} of content — a header and a footer ` +
          'with nothing between them. That is what a client-rendered page looks like before ' +
          'hydration, and it is what the visitor stares at until the JavaScript arrives. Check for ' +
          "a top-level 'use client' on this route and server-render the first screen; if the page " +
          'renders static content, the directive can usually move down to the one interactive child.'
        : 'The response carries almost no visible text at all. Either the page renders entirely on ' +
          `the client, or it is genuinely empty. Observed content: "${measured.sample}".`,
    })
  }

  // Nothing was measured, so nothing was established. Reporting a pass here would be a lie told
  // with a green tick, and it is the shape of lie this whole package was built to stop.
  if (measuredRoutes === 0) {
    findings.push({
      severity: 'fail',
      message: `First paint was verified on ZERO of ${marked.length} marked route(s) — ${unmeasuredRoutes} could not be measured.`,
      detail:
        'Every marked route answered something other than 200, so this audit checked nothing. The ' +
        'usual cause is a preview behind Vercel deployment protection, which answers a redirect ' +
        'or an SSO page for every path: supply a Protection-Bypass-for-Automation token, or point ' +
        '--base-url at a publicly reachable deployment. Failing is deliberate — an audit that ' +
        'verified nothing must never be reported as one that passed.',
    })
  }

  return {
    audit: 'first-paint',
    rule: 'R2',
    passed: findings.every((f) => f.severity !== 'fail'),
    findings,
    durationMs: Date.now() - start,
  }
}
