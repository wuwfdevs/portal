import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The community calendar: a public submission is a draft event marked pending review, staff review and edit it, only a publisher
// can approve (approving is publishing it), and what the public can see of it is only the event. These tests walk that path and
// the rules around it, in the one events collection.

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

const para = (t: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 }] })
const lexical = (...paras: string[]) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: paras.map(para) } })

/** What the form's server action writes: a DRAFT event marked "pending review", through the Local API with access control bypassed. */
const submit = (extra: Record<string, unknown> = {}) =>
  make<Doc>(
    'events',
    {
      _status: 'draft',
      review: { status: 'pending' },
      title: `Fall Plant Sale ${run}`,
      categories: [outdoors.id],
      teaser: 'Plants.',
      description: lexical('Plants.', 'More plants.'),
      schedule: { kind: 'once', date: '2090-11-14', start: '09:00', end: '14:00' },
      venue: { name: 'Pensacola Garden Center', street: '1850 N 9th Avenue', city: 'Pensacola', state: 'FL' },
      organization: { name: 'Garden Clubs', designation: 'not-for-profit' },
      free: true,
      submitter: { name: `Pat Submitter ${run}`, email: `pat-${run}@example.org`, role: 'venue' },
      ...extra,
    },
    { draft: true },
  )

const forPublic = <T extends Record<string, unknown>>(args: T) => ({ ...args, overrideAccess: false, context: ctx })
/** An acting user's change to an event. Drafts are saved as drafts; publishing is a separate, explicit step. */
const asDraft = (u: Doc, id: string | number, data: Record<string, unknown>) => payload.update({ collection: 'events', id, data: data as never, draft: true, user: asUser(u), overrideAccess: false, context: ctx }) as Promise<Doc>
const publish = (u: Doc, id: string | number) => payload.update({ collection: 'events', id, data: { _status: 'published' } as never, user: asUser(u), overrideAccess: false, context: ctx }) as Promise<Doc>

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

  describe('an event waiting for review is private', () => {
    it('is a draft marked pending, and the public cannot find, read or create one', async () => {
      const s = await submit()
      expect(s.review.status).toBe('pending')
      expect(s._status).toBe('draft')
      expect((await payload.find(forPublic({ collection: 'events', where: { title: { equals: `Fall Plant Sale ${run}` } } }))).docs).toEqual([])
      await rejectsWith(payload.findByID(forPublic({ collection: 'events', id: s.id })), /not found|not allowed/i)
      await rejectsWith(
        payload.create(forPublic({ collection: 'events', data: { title: 'x', categories: [outdoors.id], venue: { name: 'v' }, schedule: { kind: 'once', date: '2090-01-01', start: '10:00' }, submitter: { email: 'a@b.co' } } as never })),
        /not allowed/i,
      )
    })

    it('an editor can read and edit it, and sees who sent it', async () => {
      const s = await submit()
      const read = (await payload.findByID({ collection: 'events', id: s.id, draft: true, user: asUser(editor), overrideAccess: false })) as Doc
      expect(read.title).toBe(s.title)
      expect(read.submitter.email).toBe(`pat-${run}@example.org`)
      const edited = await asDraft(editor, s.id, { title: `Edited ${run}` })
      expect(edited.title).toBe(`Edited ${run}`)
      expect(edited.review.status).toBe('pending')
    })

    it('records the likely problems for a reviewer, from the station\'s guidelines', async () => {
      const s = await submit({ organization: { name: 'Acme Candles', designation: 'for-profit' }, price: '$20', free: false })
      expect(s.review.concerns).toMatch(/for-profit/)
      expect(s.review.concerns).toMatch(/lists a price/)
      const fine = await submit({ title: `Quiet Event ${run}`, schedule: { kind: 'once', date: '2090-12-01', start: '10:00' } })
      expect(fine.review.concerns ?? '').toBe('')
    })
  })

  describe('approval is publishing', () => {
    it('an editor can reject or ask for information, but cannot publish or choose "approved"', async () => {
      const s = await submit()
      await rejectsWith(publish(editor, s.id), /only a publisher can publish/i)
      await rejectsWith(asDraft(editor, s.id, { review: { status: 'approved' } }), /approved by publishing/i)
      const stillPending = (await payload.findByID({ collection: 'events', id: s.id, draft: true, overrideAccess: true })) as Doc
      expect(stillPending.review.status).toBe('pending')
      expect(stillPending._status).toBe('draft')
      const asked = await asDraft(editor, s.id, { review: { status: 'needs-info' } })
      expect(asked.review.status).toBe('needs-info')
      expect(asked.review.reviewedAt).toBeTruthy()
      const rejected = await asDraft(editor, s.id, { review: { status: 'rejected' } })
      expect(rejected.review.status).toBe('rejected')
    })

    it('a publisher publishes: the event is live at its address, marked approved, and the public sees nothing about who sent it', async () => {
      const s = await submit({ title: `Approve Me ${run}` })
      const approved = await publish(publisher, s.id)
      expect(approved._status).toBe('published')
      expect(approved.review.status).toBe('approved')
      expect(approved.review.reviewedBy).toBeTruthy()

      // The public reads it, as a published event, through access control.
      const live = (await payload.findByID(forPublic({ collection: 'events', id: s.id, depth: 1 }))) as Doc
      expect(live._status).toBe('published')
      expect(live.title).toBe(`Approve Me ${run}`)
      expect(live.path).toMatch(/^\/community-calendar\/event\/approve-me-.+-2090-11-14$/)
      expect(live.firstDate).toBe('2090-11-14')
      expect(live.venue.name).toBe('Pensacola Garden Center')
      expect(live.teaser).toBe('Plants.')
      expect(live.free).toBe(true)
      expect(live.categories.map((c: Doc) => c.title)).toEqual([`Outdoors ${run}`])
      // Nothing about who sent it or how it was reviewed is public, by field access, even though it is on the same record.
      const wire = JSON.stringify(live)
      expect(wire).not.toContain(`pat-${run}@example.org`)
      expect(wire).not.toContain('Pat Submitter')
      expect(live.submitter).toBeUndefined()
      expect(live.review).toBeUndefined()
      expect(live.submittedImage).toBeUndefined()
      // Staff still see it all.
      const staff = (await payload.findByID({ collection: 'events', id: s.id, user: asUser(editor), overrideAccess: false })) as Doc
      expect(staff.submitter.email).toBe(`pat-${run}@example.org`)
      expect(staff.review.status).toBe('approved')
    })

    it('the public REST-style list of events never carries submitter details either', async () => {
      const s = await submit({ title: `Listed Publicly ${run}` })
      await publish(publisher, s.id)
      const list = await payload.find(forPublic({ collection: 'events', where: { title: { equals: `Listed Publicly ${run}` } }, depth: 0 }))
      expect(list.docs).toHaveLength(1)
      expect(JSON.stringify(list)).not.toContain(`pat-${run}@example.org`)
    })

    it('will not publish an event with no usable dates, and it stays a draft', async () => {
      const noDates = await submit({ title: `No Dates ${run}`, schedule: { kind: 'once', date: '2090-02-30', start: '10:00' } })
      await rejectsWith(publish(publisher, noDates.id), /valid dates/)
      const after = (await payload.findByID({ collection: 'events', id: noDates.id, draft: true, overrideAccess: true })) as Doc
      expect(after._status).toBe('draft')
      expect(after.review.status).toBe('pending')
    })

    it('will not publish an event with no category', async () => {
      const noCategory = await submit({ title: `No Category ${run}`, categories: [] })
      await rejectsWith(publish(publisher, noCategory.id), /at least one category/)
    })

    it('flags a second submission for an event that is already on the calendar', async () => {
      const first = await submit({ title: `Twice ${run}` })
      await publish(publisher, first.id)
      const again = await submit({ title: `Twice ${run}` })
      expect(again.review.concerns).toMatch(/same title/)
    })

    it('leaves events staff made, and Grove\'s, alone: no review, no submitter, published as before', async () => {
      const e = await make<Doc>('events', { title: `Staff Made ${run}`, categories: [theater.id], schedule: { kind: 'once', date: '2090-05-01', start: '10:00' }, venue: { name: 'v' }, _status: 'published' })
      expect(e.review?.status ?? null).toBeNull()
      expect((e.review?.concerns ?? null)).toBeNull()
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
