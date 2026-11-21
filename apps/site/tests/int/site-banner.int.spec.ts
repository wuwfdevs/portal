import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bannerOf } from '@/lib/banner'

// The site banner global (it was the Home page global's Banner tab): what the rules in `lib/banner` make of what an editor saved, and what a save refuses.

let payload: Payload
let saved: Record<string, unknown>
const ctx = { disableRevalidate: true }
const set = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'site-banner', data: data as never, overrideAccess: true, context: ctx })
const read = async () => bannerOf((await payload.findGlobal({ slug: 'site-banner', depth: 0, overrideAccess: false })) as never)

describe('the site banner', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    saved = (await payload.findGlobal({ slug: 'site-banner', depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
  })
  afterAll(async () => {
    await set({ active: false, scope: 'home', style: 'emergency', label: null, headline: null, body: null, linkLabel: null, linkHref: null, ...(saved.active ? saved : {}) }).catch(() => undefined)
  })

  it('shows only while it is switched on and has a headline, and keeps where and how', async () => {
    await set({ active: true, scope: 'all', style: 'notice', label: 'Road closure', headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' })
    expect(await read()).toEqual({ scope: 'all', style: 'notice', label: 'Road closure', headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' })
    await set({ active: true, scope: 'home', style: 'emergency', label: null, headline: 'Shelters open at noon' })
    expect(await read()).toMatchObject({ scope: 'home', style: 'emergency', label: 'Emergency coverage' })
    await set({ active: false })
    expect(await read()).toBeNull()
  })

  it('is readable by the public, and writable only by a publisher', async () => {
    const access = (await import('@/globals/SiteBanner')).SiteBanner.access
    expect(access?.read?.({ req: {} } as never)).toBe(true)
    expect(await Promise.resolve(access?.update?.({ req: { user: null } } as never))).toBe(false)
  })

  it('refuses a headline-less banner that is on, and a link that is not a page here, an https address or mailto', async () => {
    await expect(set({ active: true, headline: '  ' })).rejects.toThrow()
    await expect(set({ active: true, headline: 'x', linkHref: 'javascript:alert(1)' })).rejects.toThrow()
  })
})
