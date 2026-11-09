import { describe, expect, it } from 'vitest'

import { failure, isPublicId, isUuid, pickConsent, pickDetails } from './results'

describe('failure', () => {
  it('carries the code and its sentence', () => {
    expect(failure('submission_limit')).toMatchObject({ ok: false, code: 'submission_limit' })
    expect(failure('not_set_up').message).toMatch(/not set up/)
  })
})

describe('shape checks', () => {
  it('accept a uuid and a public id, and nothing near them', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isUuid('11111111-1111-4111-8111-11111111111')).toBe(false)
    expect(isUuid("1; drop table")).toBe(false)
    expect(isPublicId('abcd1234efgh5678')).toBe(true)
    expect(isPublicId('ABCD1234EFGH5678')).toBe(false)
    expect(isPublicId('short')).toBe(false)
    expect(isPublicId(undefined)).toBe(false)
  })
})

describe('pickDetails and pickConsent', () => {
  it('keep only the named fields, so nothing extra can be smuggled into a signed body', () => {
    const picked = pickDetails({ name: 'Ada', email: null, phone: undefined, city: 'Pensacola', note: 'x', subject: { kind: 'account', id: 'victim' } })
    expect(picked).toEqual({ name: 'Ada', email: null, phone: null, city: 'Pensacola', note: 'x' })
    expect(pickConsent({ contact: true, identify: false, requestAnonymous: false, subject: 'victim' })).toEqual({ contact: true, identify: false, requestAnonymous: false })
  })

  it('refuse a wrong shape, a non-string field, or a field over its limit', () => {
    expect(pickDetails(null)).toBeNull()
    expect(pickDetails([])).toBeNull()
    expect(pickDetails({ name: 5 })).toBeNull()
    expect(pickDetails({ name: 'x'.repeat(201) })).toBeNull()
    expect(pickConsent({ contact: 'yes', identify: false, requestAnonymous: false })).toBeNull()
    expect(pickConsent({ contact: true })).toBeNull()
  })
})
