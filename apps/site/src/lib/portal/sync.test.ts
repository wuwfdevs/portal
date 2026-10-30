import { describe, expect, it } from 'vitest'

import { normalizeEmail, planUserSync, type ExistingUser, type Identity } from './sync'

const identity: Identity = { portalUserId: 'p-1', email: 'Leigh@WUWF.org ', name: 'Leigh Ostrander', roles: ['editor'] }
const linked: ExistingUser = { id: 7, portalUserId: 'p-1', email: 'leigh@wuwf.org' }
const unlinked: ExistingUser = { id: 1, portalUserId: null, email: 'leigh@wuwf.org' }

describe('planUserSync', () => {
  it('creates an account for a first sign-in, with the email normalised', () => {
    expect(planUserSync(identity, null, null)).toEqual({
      action: 'create',
      data: { portalUserId: 'p-1', email: 'leigh@wuwf.org', name: 'Leigh Ostrander', roles: ['editor'] },
    })
  })
  it('updates the linked account, replacing its roles wholesale so a revoked role disappears', () => {
    const plan = planUserSync({ ...identity, roles: [] }, linked, linked)
    expect(plan).toEqual({ action: 'update', id: 7, data: { email: 'leigh@wuwf.org', name: 'Leigh Ostrander', roles: [] } })
  })
  it('never takes over an existing account just because the email matches', () => {
    expect(planUserSync(identity, null, unlinked)).toEqual({ action: 'refuse', reason: 'email_belongs_to_another_account' })
  })
  it('does not merge two accounts when a linked person\'s email changed to one already in use', () => {
    const someoneElse: ExistingUser = { id: 9, portalUserId: 'p-2', email: 'new@wuwf.org' }
    expect(planUserSync({ ...identity, email: 'new@wuwf.org' }, linked, someoneElse)).toEqual({ action: 'refuse', reason: 'email_belongs_to_another_account' })
  })
  it('lets a linked person change their email to a free one', () => {
    const plan = planUserSync({ ...identity, email: 'leigh.o@wuwf.org' }, linked, null)
    expect(plan).toMatchObject({ action: 'update', id: 7, data: { email: 'leigh.o@wuwf.org' } })
  })
  it('normalises case and whitespace', () => {
    expect(normalizeEmail('  A@B.ORG ')).toBe('a@b.org')
  })
})
