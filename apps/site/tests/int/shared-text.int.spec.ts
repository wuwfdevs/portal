import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { calendarGuidelinesOf, fellowshipPolicyOf, membershipAppealOf } from '@/lib/shared-text'
import { STARTER_CALENDAR_GUIDELINES, STARTER_FELLOWSHIP_POLICY, STARTER_MEMBERSHIP_APPEAL } from '@/lib/shared-text/starter'
import type { SharedText } from '@/payload-types'

// The words that were typed in code (the calendar's guidelines, the membership appeal, the fellowship explanation) are edited in the admin: who may
// edit them, what an edit may contain, and that the words the migration copies in read back as the screens draw them, are tested on the real database
// (the test database is built from the config, not the migrations; the migration reads the same starter module).

let payload: Payload
let before: SharedText
const staff = (roles: string[]) => ({ id: 1, collection: 'users', email: 's@wuwf.org', roles }) as never
const update = (data: Record<string, unknown>, user?: unknown) =>
  payload.updateGlobal({
    slug: 'shared-text',
    data: data as never,
    context: { disableRevalidate: true },
    ...(user ? { overrideAccess: false, user: user as never } : { overrideAccess: true }),
  })
const read = () => payload.findGlobal({ slug: 'shared-text', depth: 0, overrideAccess: false })

describe('shared text', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    before = await payload.findGlobal({ slug: 'shared-text', depth: 0, overrideAccess: true })
  }, 60_000)
  afterAll(async () => {
    await update({
      calendarGuidelines: before.calendarGuidelines ?? {},
      membershipAppeal: before.membershipAppeal ?? {},
      fellowshipPolicy: before.fellowshipPolicy ?? {},
    })
  })

  it('stores the starting words (the ones the migration copies in) and reads them back as the screens draw them', async () => {
    await update({ calendarGuidelines: STARTER_CALENDAR_GUIDELINES, membershipAppeal: STARTER_MEMBERSHIP_APPEAL, fellowshipPolicy: STARTER_FELLOWSHIP_POLICY })
    const page = await read()
    expect(calendarGuidelinesOf(page.calendarGuidelines)).toEqual({
      title: STARTER_CALENDAR_GUIDELINES.title,
      paragraphs: STARTER_CALENDAR_GUIDELINES.paragraphs,
    })
    expect(membershipAppealOf(page.membershipAppeal)?.button).toEqual({ label: 'Become a member', href: '/support' })
    expect(fellowshipPolicyOf(page.fellowshipPolicy)?.items).toEqual(STARTER_FELLOWSHIP_POLICY.items)
  })

  it('lets publishers and administrators edit, and no one else', async () => {
    const data = { membershipAppeal: { text: 'Edited.', buttonLabel: 'Join', buttonHref: '/support' } }
    await expect(update(data, staff(['publisher']))).resolves.toBeDefined()
    await expect(update(data, staff(['administrator']))).resolves.toBeDefined()
    await expect(update(data, staff(['editor']))).rejects.toThrow()
    await expect(update(data, staff(['membership']))).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'shared-text', data: data as never, overrideAccess: false })).rejects.toThrow()
  })

  it.each(['javascript:alert(1)', 'http://insecure.example.org', '//evil.example.org', 'join now'])('refuses the button address %j', async (bad) => {
    await expect(update({ membershipAppeal: { text: 'Hi', buttonLabel: 'Go', buttonHref: bad } })).rejects.toThrow()
  })

  it('needs words on every paragraph and every fellowship item', async () => {
    await expect(update({ calendarGuidelines: { paragraphs: [{ lead: 'Deadlines.' }] } })).rejects.toThrow()
    await expect(update({ fellowshipPolicy: { items: [{ term: 'Who decides' }] } })).rejects.toThrow()
  })

  it('stores an edit and reads it back as the screens draw it', async () => {
    await update({
      calendarGuidelines: { title: 'Rules', paragraphs: [{ lead: 'One.', text: 'Mail a@b.org please.' }] },
      fellowshipPolicy: { title: 'About', items: [{ term: 'T', text: 'X' }], linkLabel: 'Policy' },
    })
    const page = await read()
    expect(calendarGuidelinesOf(page.calendarGuidelines)).toEqual({ title: 'Rules', paragraphs: [{ lead: 'One.', text: 'Mail a@b.org please.' }] })
    expect(fellowshipPolicyOf(page.fellowshipPolicy)).toEqual({ title: 'About', items: [{ term: 'T', text: 'X' }], linkLabel: 'Policy' })
  })
})
