import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The giving page's levels are edited in the admin, so who may edit them, and what an edit may contain, are
// tested against the real database.

let payload: Payload
const staff = (roles: string[]) => ({ id: 1, collection: 'users', email: 's@wuwf.org', roles }) as never
const update = (data: Record<string, unknown>, user?: unknown) =>
  payload.updateGlobal({
    slug: 'support-page',
    data: data as never,
    context: { disableRevalidate: true },
    ...(user ? { overrideAccess: false, user: user as never } : { overrideAccess: true }),
  })

describe('support page', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    await update({ levels: [], figures: [], commitments: [] })
  })

  it('stores editable levels in order and reads them back publicly', async () => {
    await update({
      levels: [
        { name: 'Member', amount: 'From $5/mo', description: 'First.', emphasis: 'standard' },
        { name: 'Sustaining', amount: '$8+/mo', description: 'Second.', emphasis: 'featured', ctaLabel: 'Sustain', ctaUrl: 'https://give.example.org/s' },
      ],
    })
    const page = await payload.findGlobal({ slug: 'support-page', overrideAccess: false })
    expect(page.levels?.map((l) => l.name)).toEqual(['Member', 'Sustaining'])
    expect(page.levels?.[1]?.emphasis).toBe('featured')
  })

  it('lets membership staff, publishers and administrators edit, and no one else', async () => {
    const data = { otherWays: 'Edited.' }
    await expect(update(data, staff(['membership']))).resolves.toBeDefined()
    await expect(update(data, staff(['publisher']))).resolves.toBeDefined()
    await expect(update(data, staff(['administrator']))).resolves.toBeDefined()
    await expect(update(data, staff(['editor']))).rejects.toThrow()
    await expect(update(data, staff(['sponsorship']))).rejects.toThrow()
    await expect(
      payload.updateGlobal({ slug: 'support-page', data: data as never, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it.each(['javascript:alert(1)', 'http://insecure.example.org', '//evil.example.org', 'give now'])(
    'refuses the button address %j',
    async (ctaUrl) => {
      await expect(update({ levels: [{ name: 'Bad', description: 'x', ctaLabel: 'Go', ctaUrl }] })).rejects.toThrow()
    },
  )

  it('accepts an empty address (the button is then not shown)', async () => {
    await expect(update({ levels: [{ name: 'Legacy', description: 'x', ctaLabel: 'Talk', ctaUrl: '' }] })).resolves.toBeDefined()
  })

  it('caps the figures at four', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ value: String(i), label: 'x' }))
    await expect(update({ figures: five })).rejects.toThrow()
  })
})
