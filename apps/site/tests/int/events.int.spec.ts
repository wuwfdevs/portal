import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The community calendar: a public submission waits in a private queue, staff review it, only a publisher can approve, and
// approving makes a live event. These tests walk that path and the rules around it.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }

// Documents read back from the Local API in these tests are inspected field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = { id: string | number; [k: string]: any }
let editor: Doc
let publisher: Doc
let theater: Doc
let outdoors: Doc

async function make<T extends Doc>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
// The first user in an empty table is the break-glass administrator and gets every role (Users collection), so the acting
// users are built with explicit roles, as the other suites do; the ids are real so `reviewedBy` has a row to point at.
const asUser = (u: Doc) => ({ id: u.id, collection: 'users', email: u.email, roles: u.testRoles }) as never

async function rejectsWith(promise: Promise<unknown>, reason: RegExp): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; data?: { errors?: { message: string }[] } },
  )
  expect(err, 'expected the call to be refused').not.toBeNull()
  expect([err!.message, ...(err!.data?.errors ?? []).map((e) => e.message)].join(' | ')).toMatch(reason)
}

/** What the form's server action writes: a pending submission, through the Local API with access control bypassed. */
const submit = (extra: Record<string, unknown> = {}) =>
  make<Doc>('event-submissions', {
    title: `Fall Plant Sale ${run}`,
    categories: [outdoors.id],
    description: 'Plants.\n\nMore plants.',
    schedule: { kind: 'once', date: '2090-11-14', start: '09:00', end: '14:00' },
    venue: { name: 'Pensacola Garden Center', street: '1850 N 9th Avenue', city: 'Pensacola', state: 'FL' },
    organization: { name: 'Garden Clubs', designation: 'not-for-profit' },
    free: true,
    submitter: { name: `Pat Submitter ${run}`, email: `pat-${run}@example.org`, role: 'venue' },
    clientKey: `client-${run}`,
    ...extra,
  })

const forPublic = <T extends Record<string, unknown>>(args: T) => ({ ...args, overrideAccess: false, context: ctx })

describe('community calendar', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    editor = { ...(await make('users', { email: `cal-editor-${run}@wuwf.org`, password: 'a-long-test-password-1', roles: ['editor'] })), testRoles: ['editor'] }
    publisher = { ...(await make('users', { email: `cal-publisher-${run}@wuwf.org`, password: 'a-long-test-password-2', roles: ['publisher'] })), testRoles: ['publisher'] }
    theater = await make('event-categories', { title: `Theater ${run}` })
    outdoors = await make('event-categories', { title: `Outdoors ${run}` })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  describe('the review queue is private', () => {
    it('a submission starts pending and the public cannot read, list or create one', async () => {
      const s = await submit()
      expect(s.status).toBe('pending')
      await rejectsWith(payload.find(forPublic({ collection: 'event-submissions' })), /not allowed/i)
      await rejectsWith(payload.findByID(forPublic({ collection: 'event-submissions', id: s.id })), /not allowed/i)
      await rejectsWith(
        payload.create(forPublic({ collection: 'event-submissions', data: { title: 'x', categories: [outdoors.id], venue: { name: 'v' }, schedule: { kind: 'once', date: '2090-01-01', start: '10:00' }, submitter: { email: 'a@b.co' } } as never })),
        /not allowed/i,
      )
    })

    it('an editor can read and edit a submission; the client key never comes back through the API', async () => {
      const s = await submit()
      const read = (await payload.findByID({ collection: 'event-submissions', id: s.id, user: asUser(editor), overrideAccess: false })) as Doc
      expect(read.title).toBe(s.title)
      expect(read.clientKey).toBeUndefined()
      const edited = (await payload.update({ collection: 'event-submissions', id: s.id, data: { title: `Edited ${run}` }, user: asUser(editor), overrideAccess: false, context: ctx })) as Doc
      expect(edited.title).toBe(`Edited ${run}`)
    })

    it('records the likely problems for a reviewer, from the station\'s guidelines', async () => {
      const s = await submit({ organization: { name: 'Acme Candles', designation: 'for-profit' }, price: '$20', free: false })
      expect(s.concerns).toMatch(/for-profit/)
      expect(s.concerns).toMatch(/lists a price/)
      const fine = await submit({ title: `Quiet Event ${run}`, schedule: { kind: 'once', date: '2090-12-01', start: '10:00' } })
      expect(fine.concerns ?? '').toBe('')
    })
  })

  describe('approval', () => {
    it('an editor can reject or ask for information but cannot approve', async () => {
      const s = await submit()
      await rejectsWith(payload.update({ collection: 'event-submissions', id: s.id, data: { status: 'approved' }, user: asUser(editor), overrideAccess: false, context: ctx }), /Only a publisher can approve/)
      const stillPending = (await payload.findByID({ collection: 'event-submissions', id: s.id, overrideAccess: true })) as Doc
      expect(stillPending.status).toBe('pending')
      expect(stillPending.event ?? null).toBeNull()
      const asked = (await payload.update({ collection: 'event-submissions', id: s.id, data: { status: 'needs-info' }, user: asUser(editor), overrideAccess: false, context: ctx })) as Doc
      expect(asked.status).toBe('needs-info')
      expect(asked.reviewedAt).toBeTruthy()
      const rejected = (await payload.update({ collection: 'event-submissions', id: s.id, data: { status: 'rejected' }, user: asUser(editor), overrideAccess: false, context: ctx })) as Doc
      expect(rejected.status).toBe('rejected')
    })

    it('a publisher approves: the event is live at its address, linked back, and carries nothing about the submitter', async () => {
      const s = await submit({ title: `Approve Me ${run}`, teaser: undefined })
      const approved = (await payload.update({ collection: 'event-submissions', id: s.id, data: { status: 'approved' }, user: asUser(publisher), overrideAccess: false, context: ctx })) as Doc
      expect(approved.status).toBe('approved')
      expect(approved.reviewedBy).toBeTruthy()
      const eventId = typeof approved.event === 'object' ? approved.event.id : approved.event
      expect(eventId).toBeTruthy()
      created.push({ collection: 'events', id: eventId })

      // The public reads it, as a published event, through access control.
      const live = (await payload.findByID(forPublic({ collection: 'events', id: eventId, depth: 1 }))) as Doc
      expect(live._status).toBe('published')
      expect(live.title).toBe(`Approve Me ${run}`)
      expect(live.path).toMatch(/^\/community-calendar\/event\/approve-me-.+-2090-11-14$/)
      expect(live.firstDate).toBe('2090-11-14')
      expect(live.lastDate).toBe('2090-11-14')
      expect(live.venue.name).toBe('Pensacola Garden Center')
      expect(live.teaser).toBe('Plants.')
      expect(live.free).toBe(true)
      expect(live.categories.map((c: Doc) => c.title)).toEqual([`Outdoors ${run}`])
      // Nothing about who sent it, and not even the pointer back to the submission, is public.
      const wire = JSON.stringify(live)
      expect(wire).not.toContain(`pat-${run}@example.org`)
      expect(wire).not.toContain('Pat Submitter')
      expect(live.submissionId).toBeUndefined()
      // Staff see the pointer.
      const staff = (await payload.findByID({ collection: 'events', id: eventId, user: asUser(editor), overrideAccess: false })) as Doc
      expect(staff.submissionId).toBe(String(s.id))
    })

    it('an approved submission cannot be changed back', async () => {
      const s = await submit({ title: `Final ${run}` })
      const a = (await payload.update({ collection: 'event-submissions', id: s.id, data: { status: 'approved' }, user: asUser(publisher), overrideAccess: false, context: ctx })) as Doc
      created.push({ collection: 'events', id: typeof a.event === 'object' ? a.event.id : a.event })
      await rejectsWith(payload.update({ collection: 'event-submissions', id: s.id, data: { status: 'pending' }, user: asUser(publisher), overrideAccess: false, context: ctx }), /cannot be changed back/)
    })

    it('will not approve a submission with no usable dates or no category', async () => {
      const noDates = await submit({ title: `No Dates ${run}`, schedule: { kind: 'once', date: '2090-02-30', start: '10:00' } })
      await rejectsWith(payload.update({ collection: 'event-submissions', id: noDates.id, data: { status: 'approved' }, user: asUser(publisher), overrideAccess: false, context: ctx }), /valid dates/)
      const events = await payload.count({ collection: 'events', overrideAccess: true, where: { title: { equals: `No Dates ${run}` } } })
      expect(events.totalDocs).toBe(0)
    })

    it('flags a second submission for an event that is already on the calendar', async () => {
      const first = await submit({ title: `Twice ${run}` })
      const a = (await payload.update({ collection: 'event-submissions', id: first.id, data: { status: 'approved' }, user: asUser(publisher), overrideAccess: false, context: ctx })) as Doc
      created.push({ collection: 'events', id: typeof a.event === 'object' ? a.event.id : a.event })
      const again = await submit({ title: `Twice ${run}` })
      expect(again.concerns).toMatch(/same title/)
    })
  })

  describe('events', () => {
    const event = (extra: Record<string, unknown> = {}) =>
      make<Doc>('events', { title: `Direct ${run}`, categories: [theater.id], schedule: { kind: 'daily', startDate: '2090-03-02', endDate: '2090-03-08', start: '19:30', end: '21:30' }, venue: { name: 'The Gordon' }, ...extra })

    it('a draft is private; a published event is public', async () => {
      const draft = await event({ _status: 'draft', title: `Draft Event ${run}` })
      await rejectsWith(payload.findByID(forPublic({ collection: 'events', id: draft.id })), /not found|not allowed/i)
      const asStaff = await payload.findByID({ collection: 'events', id: draft.id, draft: true, user: asUser(editor), overrideAccess: false })
      expect((asStaff as Doc).id).toBe(draft.id)
      const live = await event({ _status: 'published', title: `Public Event ${run}` })
      expect(((await payload.findByID(forPublic({ collection: 'events', id: live.id }))) as Doc).title).toBe(`Public Event ${run}`)
    })

    it('stores the first and last dates the calendar queries by, and updates them when the schedule changes', async () => {
      const e = await event({ _status: 'published', title: `Bounds ${run}` })
      expect([e.firstDate, e.lastDate]).toEqual(['2090-03-02', '2090-03-08'])
      const moved = (await payload.update({ collection: 'events', id: e.id, data: { schedule: { kind: 'daily', startDate: '2090-04-01', endDate: '2090-04-30', start: '10:00', end: '11:00' } }, overrideAccess: true, context: ctx })) as Doc
      expect([moved.firstDate, moved.lastDate]).toEqual(['2090-04-01', '2090-04-30'])
    })

    it('a listed (unreadable) schedule has no dates but the event still exists', async () => {
      const e = await event({ _status: 'published', title: `Listed ${run}`, schedule: { kind: 'listed', displayText: 'Whenever the tide is right' } })
      expect(e.firstDate ?? null).toBeNull()
      expect(e.schedule.displayText).toBe('Whenever the tide is right')
    })

    it('two events with the same title and first date get different addresses', async () => {
      const a = await event({ _status: 'published', title: `Same Name ${run}` })
      const b = await event({ _status: 'published', title: `Same Name ${run}` })
      expect(a.path).not.toBe(b.path)
      expect(b.path).toBe(`${a.path}-2`)
    })

    it('an event cannot take another story\'s or event\'s address, and an editor cannot publish or set an address', async () => {
      const a = await event({ _status: 'published', title: `Owner ${run}` })
      await rejectsWith(make('events', { title: `Thief ${run}`, categories: [theater.id], venue: { name: 'v' }, schedule: { kind: 'once', date: '2090-01-01', start: '10:00' }, _status: 'published', path: a.path }), /already used/)
      await rejectsWith(
        payload.create({ collection: 'events', data: { title: `Editor Publish ${run}`, categories: [theater.id], venue: { name: 'v' }, schedule: { kind: 'once', date: '2090-01-01', start: '10:00' }, _status: 'published' } as never, user: asUser(editor), overrideAccess: false, context: ctx }),
        /only a publisher/i,
      )
      const draft = (await payload.create({ collection: 'events', data: { title: `Editor Draft ${run}`, categories: [theater.id], venue: { name: 'v' }, schedule: { kind: 'once', date: '2090-01-01', start: '10:00' }, _status: 'draft' } as never, draft: true, user: asUser(editor), overrideAccess: false, context: ctx })) as Doc
      created.push({ collection: 'events', id: draft.id })
      await rejectsWith(payload.update({ collection: 'events', id: draft.id, data: { path: '/community-calendar/event/mine' } as never, draft: true, user: asUser(editor), overrideAccess: false, context: ctx }), /only a publisher/i)
    })

    it('categories are public to read and only a publisher can change them', async () => {
      expect((await payload.find(forPublic({ collection: 'event-categories', where: { id: { equals: theater.id } } }))).docs).toHaveLength(1)
      await rejectsWith(payload.update({ collection: 'event-categories', id: theater.id, data: { title: 'Renamed' }, user: asUser(editor), overrideAccess: false, context: ctx }), /not allowed/i)
    })
  })
})
