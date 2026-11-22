import { describe, expect, it, vi } from 'vitest'
import { LISTENING_AUTHORING_PATHS, verifyRequestSignature } from '@wuwf/portal-contracts'

import { callStaffActionWith } from '../portal-staff/call'
import { readStaffActionsConfig } from '../portal-staff/config'
import { BROWSER_ACTIONS, portalBodyFor } from './authoring-request'

const ME = '11111111-1111-4111-8111-111111111111'
const SECRET = 'a'.repeat(40)
const CONFIG = { origin: 'https://tools.example.org', secret: SECRET }

describe('readStaffActionsConfig', () => {
  const env = { PORTAL_STAFF_ACTIONS_SECRET: SECRET, PORTAL_ORIGIN: 'https://tools.example.org' }
  it('needs the staff actions secret: the listening one does not count', () => {
    expect(readStaffActionsConfig(env)).toEqual(CONFIG)
    expect(readStaffActionsConfig({ PORTAL_LISTENING_SECRET: SECRET, PORTAL_ORIGIN: env.PORTAL_ORIGIN })).toBeNull()
    expect(readStaffActionsConfig({ ...env, PORTAL_STAFF_ACTIONS_SECRET: 'short' })).toBeNull()
  })
  it('uses the Site settings address over the variable, and refuses an address that is not an origin', () => {
    expect(readStaffActionsConfig(env, 'https://portal.wuwf.org')?.origin).toBe('https://portal.wuwf.org')
    expect(readStaffActionsConfig(env, 'https://portal.wuwf.org/path')).toBeNull()
  })
})

describe('portalBodyFor: what the browser may say', () => {
  it('puts the signed-in person as the actor and ignores any actor the browser sends', () => {
    expect(portalBodyFor('get', { publicId: 'abcd1234efgh5678', actor: { portalUserId: 'someone-else' } }, ME)).toEqual({ actor: { portalUserId: ME }, publicId: 'abcd1234efgh5678' })
    expect(portalBodyFor('list', { actor: { portalUserId: 'x' } }, ME)).toEqual({ actor: { portalUserId: ME } })
  })
  it('forwards only the named fields of a save', () => {
    const body = portalBodyFor('save', { publicId: 'abcd1234efgh5678', query: { internalTitle: 'a', createdBy: 'x', status: 'open' }, questions: [{ prompt: 'q', id: 'i', secret: 1 }] }, ME)
    expect(body).toEqual({ actor: { portalUserId: ME }, publicId: 'abcd1234efgh5678', query: { internalTitle: 'a' }, questions: [{ prompt: 'q', id: 'i' }] })
  })
  it('refuses what is not shaped like a request', () => {
    expect(portalBodyFor('get', {}, ME)).toBeNull()
    expect(portalBodyFor('save', { query: {}, questions: 'no' }, ME)).toBeNull()
    expect(portalBodyFor('set-status', { publicId: 'abcd1234efgh5678', status: 'published' }, ME)).toBeNull()
    expect(portalBodyFor('save', { query: {}, questions: [1] }, ME)).toBeNull()
  })
  it('has one browser action for each Portal path', () => {
    expect(Object.values(BROWSER_ACTIONS).map((a) => a.path).sort()).toEqual(Object.values(LISTENING_AUTHORING_PATHS).sort())
  })
})

describe('callStaffActionWith', () => {
  it('signs the exact body for the exact path, with the staff actions secret', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, queries: [] })))
    const result = await callStaffActionWith(CONFIG, fetchImpl, LISTENING_AUTHORING_PATHS.list, { actor: { portalUserId: ME } }, 1_700_000_000)
    expect(result).toEqual({ ok: true, queries: [] })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://tools.example.org/api/site/staff/listening/list')
    const h = init.headers as Record<string, string>
    const verified = await verifyRequestSignature(
      { method: 'POST', path: LISTENING_AUTHORING_PATHS.list, body: init.body as string, signature: h['x-wuwf-signature']!, timestamp: h['x-wuwf-timestamp']!, version: h['x-wuwf-contract-version']! },
      SECRET,
      1_700_000_000,
    )
    expect(verified).toEqual({ ok: true })
  })
  it('passes on a refusal with the Portal\'s sentence, and treats the rest as unavailable', async () => {
    const refused = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'invalid', message: 'Give the query an internal title.' }), { status: 400 }))
    expect(await callStaffActionWith(CONFIG, refused, LISTENING_AUTHORING_PATHS.save, {})).toEqual({ ok: false, error: 'invalid', message: 'Give the query an internal title.' })
    const junk = vi.fn(async () => new Response('<html>', { status: 502 }))
    expect(await callStaffActionWith(CONFIG, junk, LISTENING_AUTHORING_PATHS.save, {})).toEqual({ ok: false, error: 'unavailable' })
    const down = vi.fn(async () => { throw new Error('boom') })
    expect(await callStaffActionWith(CONFIG, down, LISTENING_AUTHORING_PATHS.save, {})).toEqual({ ok: false, error: 'unavailable' })
    expect(await callStaffActionWith(null, down, LISTENING_AUTHORING_PATHS.save, {})).toEqual({ ok: false, error: 'not_set_up' })
  })
})

describe('callStaffActionWith: only this channel\'s paths are signed', () => {
  it('refuses to sign a path outside the staff actions prefix with the staff secret', async () => {
    await expect(callStaffActionWith(CONFIG, vi.fn(), '/api/site/listening/start', {})).rejects.toThrow(/prefix/)
    await expect(callStaffActionWith(CONFIG, vi.fn(), '/api/site/staffer/x', {})).rejects.toThrow(/prefix/)
  })
})
