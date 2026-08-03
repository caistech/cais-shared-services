/**
 * Regression tests for the input-response audit.
 *
 * As with first-paint, every case is a defect that shipped. The worst one is at the bottom: the
 * check reported "answered in only 0 of 5 attempts (0%)" about a product it had never managed to
 * contact, because a dropped network counted as a product failure. A gate that cries wolf on a
 * blip is a gate somebody disables, which costs more than the check was ever worth.
 */
import { describe, expect, it } from 'vitest'
import {
  type ProbeOutcome,
  parseInputMarker,
  summariseAttempts,
} from '../src/audit/input-response.js'

const answeredByNetwork = (): ProbeOutcome => ({
  inputsFound: 1,
  requestsAfterSubmit: ['https://example.com/api/ask'],
  textGrowth: 0,
})
const answeredByText = (): ProbeOutcome => ({
  inputsFound: 1,
  requestsAfterSubmit: [],
  textGrowth: 120,
})
const swallowed = (): ProbeOutcome => ({
  inputsFound: 1,
  requestsAfterSubmit: [],
  textGrowth: 0,
})
const noInput = (): ProbeOutcome => ({ inputsFound: 0, requestsAfterSubmit: [], textGrowth: 0 })
const errored = (msg = 'net::ERR_NETWORK_IO_SUSPENDED'): ProbeOutcome => ({
  inputsFound: 0,
  requestsAfterSubmit: [],
  textGrowth: 0,
  error: msg,
})

describe('parseInputMarker', () => {
  it('reads a bare marker', () => {
    expect(parseInputMarker('// @accepts-input')).toEqual({ marked: true, openSelector: null })
  })

  it('reads the open selector in either quote style and with loose spacing', () => {
    // If the selector silently stops being read, the audit probes a page whose input is still
    // behind an unclicked launcher, finds nothing, and blames the page. It did exactly that for
    // three consecutive runs against a working widget.
    expect(parseInputMarker('// @accepts-input open=".convai-btn"').openSelector).toBe('.convai-btn')
    expect(parseInputMarker("// @accepts-input open='.x'").openSelector).toBe('.x')
    expect(parseInputMarker('// @accepts-input  open = "button.launch"').openSelector).toBe(
      'button.launch'
    )
  })

  it('does not mark an unrelated file', () => {
    expect(parseInputMarker('// nothing to see').marked).toBe(false)
  })
})

describe('summariseAttempts', () => {
  it('counts a response from EITHER a network call or new visible text', () => {
    // Either signal alone is wrong: a page answering from cached state fires no request, and a page
    // that fires a request while rendering nothing still leaves the visitor at a cleared box.
    expect(summariseAttempts([answeredByNetwork()]).answered).toBe(1)
    expect(summariseAttempts([answeredByText()]).answered).toBe(1)
  })

  it('counts a cleared box with no request as SILENT — the original defect', () => {
    const s = summariseAttempts([swallowed()])
    expect(s.silent).toBe(1)
    expect(s.answered).toBe(0)
  })

  it('separates "no input to type into" from "typed and got silence"', () => {
    // Different bugs with different owners. Collapsing them sends whoever reads the failure to the
    // wrong place — the reveal race looks like a backend outage and the endpoint checks out fine.
    const s = summariseAttempts([noInput(), swallowed()])
    expect(s.noInput).toBe(1)
    expect(s.silent).toBe(1)
  })

  it('EXCLUDES errored attempts from the denominator', () => {
    // THE defect. Two of four attempts never reached the page; the product answered both times it
    // was actually reached. The old arithmetic reported 50%; the truth is 100%.
    const s = summariseAttempts([errored(), errored(), answeredByNetwork(), answeredByText()])
    expect(s.attempts).toBe(4)
    expect(s.exercised).toBe(2)
    expect(s.errored).toBe(2)
    expect(s.rate).toBe(1)
  })

  it('reports rate 0 and exercised 0 when NOTHING could be exercised, and keeps the cause', () => {
    // This must never read as "the product answered 0% of the time" — the browser never got there.
    // The caller turns exercised === 0 into "could not be exercised", naming the connection.
    const s = summariseAttempts([errored(), errored(), errored()])
    expect(s.exercised).toBe(0)
    expect(s.rate).toBe(0)
    expect(s.firstError).toBe('net::ERR_NETWORK_IO_SUSPENDED')
  })

  it('computes the observed real-world case: 14 answered of 20, no errors', () => {
    const outcomes = [
      ...Array.from({ length: 14 }, answeredByNetwork),
      ...Array.from({ length: 6 }, noInput),
    ]
    const s = summariseAttempts(outcomes)
    expect(s.exercised).toBe(20)
    expect(s.rate).toBe(0.7)
    expect(s.noInput).toBe(6)
  })
})
