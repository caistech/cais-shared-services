import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { createConvaiWebhookRoutes } from '../src/routes'

// The tool secret guards the memory endpoints. Identity on those routes is derived from a PUBLIC
// agent id — one that is shipped to the browser — so without the header anyone holding an agent id
// can read and write that user's conversation memory.
//
// The failure these tests exist to prevent is not a wrong secret. It is a guard that is quietly
// INERT: the option shipped in 0.6.0 and exactly one consumer ever passed it, so every other
// product had open memory endpoints while the code looked correct.

const base = {
  supabase: {} as never,
  tableNames: { conversations: 'c', messages: 'm', memory: 'mem', agents: 'a' } as never,
}

describe('tool-secret resolution', () => {
  const original = process.env.CONVAI_TOOL_SECRET

  beforeEach(() => {
    delete process.env.CONVAI_TOOL_SECRET
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CONVAI_TOOL_SECRET
    else process.env.CONVAI_TOOL_SECRET = original
    vi.restoreAllMocks()
  })

  it('falls back to CONVAI_TOOL_SECRET so the guard is reachable by CONFIG, not a code change', () => {
    // The whole reason 0.6.0's guard ran in one repo: it required every consumer to discover an
    // option and pass it. An env fallback is what makes "turn it on" an ops action.
    process.env.CONVAI_TOOL_SECRET = 'from-env'
    createConvaiWebhookRoutes({ ...base } as never)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('prefers an explicit option over the environment', () => {
    process.env.CONVAI_TOOL_SECRET = 'from-env'
    createConvaiWebhookRoutes({ ...base, toolSecret: 'explicit' } as never)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('WARNS LOUDLY when no secret resolves — an inert guard must not be silent', () => {
    createConvaiWebhookRoutes({ ...base } as never)
    expect(console.error).toHaveBeenCalledOnce()
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('UNAUTHENTICATED')
  })

  it('warns once at construction, not per request', () => {
    // Per-request logging is noise nobody reads, which is its own kind of silence.
    createConvaiWebhookRoutes({ ...base } as never)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('THROWS at construction when requireToolSecret is set and nothing resolves', () => {
    // Fail the deploy, not the first request. Routes that build and then serve unauthenticated
    // traffic have already lost.
    expect(() => createConvaiWebhookRoutes({ ...base, requireToolSecret: true } as never)).toThrow(
      /Refusing to serve memory endpoints without authentication/,
    )
  })

  it('constructs cleanly when requireToolSecret is satisfied from the environment', () => {
    process.env.CONVAI_TOOL_SECRET = 'set'
    expect(() =>
      createConvaiWebhookRoutes({ ...base, requireToolSecret: true } as never),
    ).not.toThrow()
  })
})
