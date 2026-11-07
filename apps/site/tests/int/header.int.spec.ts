// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { drawableItems, headerButtons } from '@/lib/nav/header'

// The header is configured, not coded (board 27): items are links or menus in any order, the buttons on the right can
// be hidden and relabelled, and a menu that could not be drawn cannot be saved.

let payload: Payload
let before: unknown
const ctx = { disableRevalidate: true }
const link = (label: string, url: string) => ({ link: { type: 'custom' as const, url, label } })

async function save(data: Record<string, unknown>) {
  return payload.updateGlobal({ slug: 'header', data: data as never, overrideAccess: true, context: ctx })
}

describe('header settings', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    before = await payload.findGlobal({ slug: 'header', overrideAccess: true, depth: 0 })
  }, 90_000)

  afterAll(async () => {
    const { navItems, actions, sections } = (before ?? {}) as Record<string, unknown>
    await save({ navItems: navItems ?? [], actions, sections: sections ?? [] }).catch(() => undefined)
  })

  it('keeps links and menus in the order given, with the buttons as set', async () => {
    const header = await save({
      navItems: [
        { kind: 'menu', label: 'News', heading: 'News', blurb: 'Reporting from the Gulf Coast.', links: [link('Latest', '/'), link('Weather', '/weather')] },
        { kind: 'link', ...link('Podcasts', '/podcasts') },
        { kind: 'menu', label: 'About', links: [link('Support', '/support')] },
      ],
      actions: { search: { show: false }, signIn: { label: 'Account' }, donate: { label: 'Give', href: '/support' } },
    })
    const items = drawableItems(header.navItems)
    expect(items.map((i) => (i.kind === 'menu' ? `menu:${i.label}` : `link:${i.link?.label}`))).toEqual(['menu:News', 'link:Podcasts', 'menu:About'])
    expect(items[0].links?.map((l) => l.link.label)).toEqual(['Latest', 'Weather'])
    expect(headerButtons(header.actions, true)).toEqual({ listen: null, search: null, signIn: { label: 'Account' }, donate: { label: 'Give', href: '/support' } })
  })

  it('treats an item saved without a kind as a link', async () => {
    const header = await save({ navItems: [link('Podcasts', '/podcasts')] })
    expect(header.navItems?.[0].kind).toBe('link')
  })

  it('refuses a menu with no label or no links, and a bad Donate address', async () => {
    await expect(save({ navItems: [{ kind: 'menu', links: [link('A', '/a')] }] })).rejects.toThrow()
    await expect(save({ navItems: [{ kind: 'menu', label: 'Empty', links: [] }] })).rejects.toThrow()
    await expect(save({ actions: { donate: { href: 'javascript:alert(1)' } } })).rejects.toThrow()
  })
})
