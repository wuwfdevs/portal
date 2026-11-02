import { describe, expect, it } from 'vitest'

import {
  STAFF_SESSION_COOKIE, STAFF_SESSION_SECONDS, deriveSessionKey, expiredSessionCookie, isSessionRevoked, mintStaffSession,
  readCookie, sessionCookie, verifyStaffSession,
} from './staff-session'

const APP_SECRET = 'a'.repeat(64)
const NOW = 1_800_000_000

describe('staff session', () => {
  it('round-trips the user and the times', async () => {
    const key = await deriveSessionKey(APP_SECRET)
    const token = await mintStaffSession({ userId: 42, now: NOW }, key)
    const r = await verifyStaffSession(token, key, NOW + 10)
    expect(r).toEqual({ ok: true, claims: { sub: '42', iat: NOW, exp: NOW + STAFF_SESSION_SECONDS } })
  })

  it('uses a key only this purpose can produce', async () => {
    const key = await deriveSessionKey(APP_SECRET)
    expect(key).not.toBe(APP_SECRET)
    expect(await deriveSessionKey(APP_SECRET)).toBe(key)
    expect(await deriveSessionKey('b'.repeat(64))).not.toBe(key)
  })

  it('expires, and is never valid for longer than the maximum', async () => {
    const key = await deriveSessionKey(APP_SECRET)
    const token = await mintStaffSession({ userId: 1, now: NOW, ttlSeconds: 10 * STAFF_SESSION_SECONDS }, key)
    expect(await verifyStaffSession(token, key, NOW + STAFF_SESSION_SECONDS - 1)).toMatchObject({ ok: true })
    expect(await verifyStaffSession(token, key, NOW + STAFF_SESSION_SECONDS)).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses another key, an edited body, and malformed input without throwing', async () => {
    const key = await deriveSessionKey(APP_SECRET)
    const token = await mintStaffSession({ userId: 1, now: NOW }, key)
    expect(await verifyStaffSession(token, await deriveSessionKey('b'.repeat(64)), NOW)).toEqual({ ok: false, reason: 'bad_signature' })
    const [, sig] = token.split('.')
    const forged = `${btoa(JSON.stringify({ sub: '99', iat: NOW, exp: NOW + 100 })).replace(/=+$/, '')}.${sig}`
    expect(await verifyStaffSession(forged, key, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
    for (const bad of ['', 'x', 'a.b.c', '!!.!!', 'e30.e30']) expect((await verifyStaffSession(bad, key, NOW)).ok, bad).toBe(false)
  })

  it('a staff-session token is not an identity token, so one cannot stand in for the other', async () => {
    const key = await deriveSessionKey(APP_SECRET)
    const { mintIdentityToken } = await import('@wuwf/portal-contracts')
    const identity = await mintIdentityToken({ userId: 'u', email: 'a@wuwf.org', name: 'A', roles: ['editor'], now: NOW }, APP_SECRET)
    expect((await verifyStaffSession(identity, key, NOW)).ok).toBe(false)
  })
})

describe('revocation', () => {
  it('kills sessions issued before the cutoff and keeps later ones', () => {
    const cutoff = new Date((NOW + 100) * 1000).toISOString()
    expect(isSessionRevoked(NOW, cutoff)).toBe(true)
    expect(isSessionRevoked(NOW + 100, cutoff)).toBe(false)
    expect(isSessionRevoked(NOW + 200, cutoff)).toBe(false)
  })
  it('revokes nothing when there is no cutoff, and everything when the cutoff cannot be read', () => {
    expect(isSessionRevoked(NOW, null)).toBe(false)
    expect(isSessionRevoked(NOW, undefined)).toBe(false)
    expect(isSessionRevoked(NOW, 'not a date')).toBe(true)
  })
})

describe('cookies', () => {
  it('is HttpOnly, Lax, site-wide, and Secure when asked', () => {
    const c = sessionCookie('tok', { secure: true })
    expect(c).toContain(`${STAFF_SESSION_COOKIE}=tok`)
    for (const part of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', `Max-Age=${STAFF_SESSION_SECONDS}`]) expect(c).toContain(part)
    expect(sessionCookie('tok', { secure: false })).not.toContain('Secure')
  })
  it('expires by Max-Age 0', () => {
    expect(expiredSessionCookie(true)).toContain('Max-Age=0')
  })
  it('reads one cookie out of a header and ignores look-alikes', () => {
    const h = `a=1; ${STAFF_SESSION_COOKIE}=abc.def; x${STAFF_SESSION_COOKIE}=nope`
    expect(readCookie(h, STAFF_SESSION_COOKIE)).toBe('abc.def')
    expect(readCookie('a=1', STAFF_SESSION_COOKIE)).toBeNull()
    expect(readCookie(null, STAFF_SESSION_COOKIE)).toBeNull()
    expect(readCookie(`${STAFF_SESSION_COOKIE}=`, STAFF_SESSION_COOKIE)).toBeNull()
  })
})
