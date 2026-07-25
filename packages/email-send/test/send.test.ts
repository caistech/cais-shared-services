import { describe, expect, it, vi } from 'vitest'

import { createEmailSender, htmlToText } from '../src/index'

const SENDER = {
  name: 'Corporate AI Solutions',
  email: 'hello@corporateaisolutions.com',
  abn: '12 345 678 901',
  postal: 'PO Box 1, Perth WA 6000',
}

function okFetch(body: unknown = { id: 're_123' }) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
}

function sentPayload(fetchMock: ReturnType<typeof okFetch>) {
  return JSON.parse(String(fetchMock.mock.calls[0][1]!.body)) as Record<string, string>
}

describe('createEmailSender', () => {
  it('posts to Resend with the verified default From and an auth header', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', fetchImpl: fetchImpl as never })

    const result = await sender.send({ to: 'owner@example.com', subject: 'Hi', html: '<p>Hi</p>' })

    expect(result.id).toBe('re_123')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer rk_test')
    // The bare apex is NOT Resend-verified; only the updates.* subdomain is.
    expect(sentPayload(fetchImpl).from).toContain('updates.corporateaisolutions.com')
  })

  it('always sends a plain-text alternative, derived from the HTML when not supplied', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', fetchImpl: fetchImpl as never })

    await sender.send({
      to: 'owner@example.com',
      subject: 'Hi',
      html: '<html><body><p>First charge is <strong>Friday</strong></p></body></html>',
    })

    expect(sentPayload(fetchImpl).text).toContain('First charge is Friday')
  })

  it('raises Resend\'s own error text so "domain is not verified" stays readable', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('The updates.example.com domain is not verified', { status: 403 }),
    )
    const sender = createEmailSender({ apiKey: 'rk_test', fetchImpl: fetchImpl as never })

    await expect(
      sender.send({ to: 'owner@example.com', subject: 'Hi', html: '<p>Hi</p>' }),
    ).rejects.toThrow(/domain is not verified/)
  })

  it('resolves the API key at send time, not construction time', () => {
    // Constructing at module scope with no key is what broke Next.js build-time page-data
    // collection in every product that used the Resend SDK directly.
    expect(() => createEmailSender({ apiKey: undefined, fetchImpl: okFetch() as never })).not.toThrow()
  })
})

describe('compliance footer', () => {
  it('appends an identification footer to transactional mail, inside <body>', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', sender: SENDER, fetchImpl: fetchImpl as never })

    await sender.send({
      to: 'owner@example.com',
      subject: 'Your first payment',
      html: '<html><body><p>Heads up</p></body></html>',
      compliance: { transactional: true },
    })

    const payload = sentPayload(fetchImpl)
    expect(payload.html).toContain('ABN 12 345 678 901')
    expect(payload.html.indexOf('ABN')).toBeLessThan(payload.html.indexOf('</body>'))
    expect(payload.text).toContain('ABN 12 345 678 901')
  })

  it('carries an unsubscribe link on commercial mail', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', sender: SENDER, fetchImpl: fetchImpl as never })

    await sender.send({
      to: 'owner@example.com',
      subject: 'News',
      html: '<p>News</p>',
      compliance: { unsubscribeUrl: 'https://kira.app/unsubscribe?t=abc', reason: 'express' },
    })

    expect(sentPayload(fetchImpl).html).toContain('https://kira.app/unsubscribe?t=abc')
  })

  it('lets a white-label send carry the distributor identity instead of the CAS one', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', sender: SENDER, fetchImpl: fetchImpl as never })

    await sender.send({
      to: 'owner@example.com',
      subject: 'News',
      html: '<p>News</p>',
      compliance: {
        transactional: true,
        sender: { name: 'Broker Co', email: 'hi@brokerco.com.au', abn: '99 999 999 999' },
      },
    })

    const html = sentPayload(fetchImpl).html
    expect(html).toContain('Broker Co')
    expect(html).not.toContain('Corporate AI Solutions')
  })

  it('omits the footer entirely when no compliance options are passed', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', sender: SENDER, fetchImpl: fetchImpl as never })

    await sender.send({ to: 'owner@example.com', subject: 'Hi', html: '<p>Hi</p>' })

    expect(sentPayload(fetchImpl).html).not.toContain('ABN')
  })
})

describe('nudge-core transport', () => {
  it('exposes an EmailTransport-shaped adapter that resolves void', async () => {
    const fetchImpl = okFetch()
    const sender = createEmailSender({ apiKey: 'rk_test', fetchImpl: fetchImpl as never })

    await expect(
      sender.transport.send({
        from: 'Kira <noreply@updates.corporateaisolutions.com>',
        to: 'owner@example.com',
        subject: 'Nudge',
        html: '<p>Nudge</p>',
      }),
    ).resolves.toBeUndefined()

    expect(sentPayload(fetchImpl).from).toContain('Kira')
  })
})

describe('htmlToText', () => {
  it('turns block tags into line breaks and decodes the common entities', () => {
    expect(htmlToText('<p>One</p><p>Two &amp; three</p>')).toBe('One\nTwo & three')
  })

  it('drops style and script content rather than dumping CSS into the text part', () => {
    expect(htmlToText('<style>.a{color:red}</style><p>Body</p>')).toBe('Body')
  })
})
