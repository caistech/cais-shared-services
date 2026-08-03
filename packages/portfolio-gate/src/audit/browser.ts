/**
 * Shared browser transport for the audits that need a RENDERED page rather than served HTML.
 *
 * WHY THIS IS SHARED. Two audits now need a browser — input-response, because the defect is in
 * what happens on submit, and tax-suffix, because a client-rendered price is invisible to a fetch.
 * The launch sequence is fiddly in a way that is easy to get subtly wrong (see the fallback below),
 * and the portfolio's own rule is that the second occurrence is the extraction trigger. A second
 * hand-rolled copy would drift, and the one that drifts is always the one nobody is watching.
 *
 * Playwright is an OPTIONAL peer. Callers decide what its absence means: input-response fails
 * (the repo opted in by marking a page, and an unexercised input is the bug), while tax-suffix
 * degrades to fetch and says so, because server-rendered prices are still worth checking.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BrowserHandle {
  browser: any
  /** Which launch path succeeded — worth printing, since they behave differently. */
  via: 'bundled' | 'system-chrome'
}

export interface BrowserLoadFailure {
  browser: null
  reason: string
}

/**
 * Launch headless chromium, preferring the bundled build and falling back to an installed Chrome.
 *
 * THE FALLBACK IS NOT A NICETY. Playwright pins its browser build to its exact version, so a
 * machine with four cached chromium builds and a working system Chrome still refuses to launch
 * after a playwright bump until someone re-runs `playwright install`. A check that cannot start
 * is a check that gets switched off, and these already cost a browser to run.
 *
 * Never throws. A caller that cannot get a browser gets a reason string to report.
 */
export async function launchChromium(
  factory?: () => Promise<unknown>,
): Promise<BrowserHandle | BrowserLoadFailure> {
  let playwright: any
  try {
    playwright = factory ? await factory() : await import('playwright')
  } catch {
    return {
      browser: null,
      reason:
        'playwright is not installed. Add it (`npm i -D playwright && npx playwright install chromium`).',
    }
  }

  try {
    return { browser: await playwright.chromium.launch({ headless: true }), via: 'bundled' }
  } catch (bundledErr) {
    try {
      return {
        browser: await playwright.chromium.launch({ headless: true, channel: 'chrome' }),
        via: 'system-chrome',
      }
    } catch {
      const first =
        bundledErr instanceof Error ? bundledErr.message.split('\n')[0] : String(bundledErr)
      return {
        browser: null,
        reason: `no browser could be launched. Bundled chromium failed (${first}) and no system Chrome was found. Run \`npx playwright install chromium\`.`,
      }
    }
  }
}

/**
 * Render a page and return what a reader would actually SEE.
 *
 * `innerText`, deliberately, not `textContent`: innerText respects `display:none` and friends, so
 * copy that is in the DOM but hidden — an inactive tab, a collapsed accordion, the losing half of
 * an A/B switch — is excluded. A price nobody can see is not a price on the page, and flagging one
 * is the kind of unprovable finding that gets an audit distrusted.
 *
 * Never throws; a failure comes back as `{ text: null, error }` so one bad route cannot abort a run.
 */
export async function renderVisibleText(
  browser: any,
  url: string,
  opts: { settleMs?: number; timeoutMs?: number } = {},
): Promise<{ text: string | null; error?: string }> {
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs ?? 30_000 })
    // Hydration, then whatever the page fetches to fill itself in. The prices this exists to see
    // are computed after mount, so 'domcontentloaded' plus a settle is the point, not a shortcut.
    await page.waitForTimeout(opts.settleMs ?? 3_000)
    const text: string = await page.evaluate(() => document.body?.innerText ?? '')
    return { text: text.replace(/\s+/g, ' ').trim() }
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message.split('\n')[0] : String(err) }
  } finally {
    await page.close().catch(() => undefined)
  }
}
