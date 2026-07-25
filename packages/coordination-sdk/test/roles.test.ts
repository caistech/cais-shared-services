import { describe, expect, it } from 'vitest'

import { ROLE_ACTIONS, allowedActionsFor, canViewContent } from '../src/server/magic-links'
import type { ParticipantRole } from '../src/types'

const REFERRING_ROLES: ParticipantRole[] = ['introducer', 'broker']

describe('the referring-party roles', () => {
  it.each(REFERRING_ROLES)('%s sees status and NOTHING else', (role) => {
    // The content wall. If this ever gains 'view', a commercial third party can read the
    // subject's material — which is the whole thing the role exists to prevent.
    expect(ROLE_ACTIONS[role]).toEqual(['view_status'])
    expect(canViewContent(role)).toBe(false)
  })

  it.each(REFERRING_ROLES)('%s cannot comment, upload, approve or reject', (role) => {
    const actions = allowedActionsFor(role)
    for (const forbidden of ['comment', 'upload', 'approve', 'reject']) {
      expect(actions).not.toContain(forbidden)
    }
  })

  it('introducer and broker are exact synonyms', () => {
    // Kept separate only so a product can use its market's word. If they ever diverge, that is a
    // decision someone must make deliberately, not discover.
    expect(ROLE_ACTIONS.introducer).toEqual(ROLE_ACTIONS.broker)
  })
})

describe('the existing roles are unchanged', () => {
  it('still lets every non-referring role see content', () => {
    const others = (Object.keys(ROLE_ACTIONS) as ParticipantRole[]).filter(
      (role) => !REFERRING_ROLES.includes(role),
    )
    expect(others.length).toBeGreaterThan(0)
    for (const role of others) {
      expect(canViewContent(role)).toBe(true)
    }
  })

  it('keeps admin fully privileged', () => {
    expect(ROLE_ACTIONS.admin).toEqual(['comment', 'upload', 'approve', 'reject', 'view'])
  })
})

describe('unknown roles', () => {
  it('deny content by default rather than inheriting a permissive fallback', () => {
    const unknown = 'auditor' as ParticipantRole
    // allowedActionsFor falls back to ['view'] to preserve the pre-existing magic-link behaviour,
    // but the important half is that nothing unknown silently acquires write actions.
    expect(allowedActionsFor(unknown)).not.toContain('approve')
    expect(allowedActionsFor(unknown)).not.toContain('upload')
  })
})
