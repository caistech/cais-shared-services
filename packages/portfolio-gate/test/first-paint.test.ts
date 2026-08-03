/**
 * Regression tests for the first-paint audit.
 *
 * EVERY CASE HERE IS A DEFECT THAT ACTUALLY SHIPPED, on the day the check was written, by someone
 * who had read the standard warning about each one. They are not illustrative examples — the
 * package had no tests at all, four defects were found by running it against production rather
 * than by reasoning about it, and all four lived in pure functions that could have been asserted
 * in milliseconds. That is `TESTING_STANDARD` §6 pointed at the tooling: mechanise what recurs.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIN_CHARS,
  MIN_HEADING_CHARS,
  measureVisibleText,
  paintPasses,
} from '../src/audit/first-paint.js'

/** The shape of the real failure: full chrome, nothing between it. */
const BLANK_PAGE_WITH_CHROME = `
<!doctype html><html><body>
  <header><nav><a href="/">Kira</a><a href="/plan">Pricing</a><a href="/login">Sign in</a></nav></header>
  <div id="__next"></div>
  <footer><p>Corporate AI Solutions. All rights reserved. Privacy. Terms.</p></footer>
  <script>window.__DATA__={a:1}</script>
</body></html>`

describe('measureVisibleText', () => {
  it('does not count chrome as content — the defect the whole check exists for', () => {
    // /plan served 180 characters of text and 16 of content. A check asking "does the response
    // contain visible text" scores it 180 and PASSES on the exact page it was written to catch.
    const m = measureVisibleText(BLANK_PAGE_WITH_CHROME)
    expect(m.totalChars).toBeGreaterThan(50)
    expect(m.contentChars).toBe(0)
  })

  it('handles NESTED chrome, where a non-greedy regex silently under-counts', () => {
    // <header> containing <nav> breaks /<header>.*?<\/header>/ — it stops at the inner close tag
    // and the rest of the header leaks into the content count, re-creating the false negative.
    const html =
      '<body><header><nav><div>Menu</div></nav>Brand name here</header><main>Real content.</main></body>'
    const m = measureVisibleText(html)
    expect(m.contentChars).toBe('Real content.'.length)
  })

  it('decodes HEX character references, not only decimal', () => {
    // Next.js emits apostrophes as &#x27;. The decoder handled &#39; only, so "what&#x27;s" counted
    // as ELEVEN visible characters instead of six — inflating every page with an apostrophe in it.
    const m = measureVisibleText('<body><main>what&#x27;s left</main></body>')
    expect(m.sample).toBe("what's left")
    expect(m.contentChars).toBe("what's left".length)
  })

  it('ignores script and style content, which is never visible to a reader', () => {
    const html = `<body><main>Hi</main><style>.a{color:red}</style><script>const x="a very long string that is not visible"</script></body>`
    expect(measureVisibleText(html).contentChars).toBe(2)
  })

  it('takes the first heading outside the chrome, not the one inside it', () => {
    const html =
      '<body><header><h1>Kira</h1></header><main><h1>Set free what is locked in your head</h1><p>x</p></main></body>'
    expect(measureVisibleText(html).heading).toBe('Set free what is locked in your head')
  })

  it('survives comments containing stray angle brackets', () => {
    const html = '<body><!-- a > b, and <not a tag> --><main>Content here.</main></body>'
    expect(measureVisibleText(html).contentChars).toBe('Content here.'.length)
  })
})

describe('paintPasses', () => {
  it('fails a page that serves only chrome', () => {
    expect(paintPasses(measureVisibleText(BLANK_PAGE_WITH_CHROME))).toBe(false)
  })

  it('passes a sparse sign-in page on its HEADING, not its character count', () => {
    // /login serves 49 characters — below the 200 minimum and NOT a blank page. Holding it to a
    // prose threshold pressures whoever fixes it into padding the page with copy written to satisfy
    // an assertion, which is a worse outcome than the defect.
    const m = measureVisibleText(
      '<body><main><h1>Welcome back</h1><p>Sign in to your Kira.</p></main></body>'
    )
    expect(m.contentChars).toBeLessThan(DEFAULT_MIN_CHARS)
    expect(paintPasses(m)).toBe(true)
  })

  it('does not accept a decorative one-character heading as "the visitor can tell where they are"', () => {
    const m = measureVisibleText('<body><main><h1>·</h1></main></body>')
    expect(m.heading.length).toBeLessThan(MIN_HEADING_CHARS)
    expect(paintPasses(m)).toBe(false)
  })

  it('passes a page with plenty of content and no heading at all', () => {
    const m = measureVisibleText(`<body><main><p>${'word '.repeat(80)}</p></main></body>`)
    expect(m.heading).toBe('')
    expect(paintPasses(m)).toBe(true)
  })
})
