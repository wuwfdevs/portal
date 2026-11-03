import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook } from 'payload'

import { APIError, ValidationError } from 'payload'

import { userCan } from '@/access/permissions'
import { pathTaken } from '@/hooks/pathHooks'
import { checkPath } from '@/lib/paths'
import { revalidatePath } from '@/lib/revalidate'
import type { SubmissionValue } from '@/lib/events/submission'
import { EVENT_PATH_PREFIX, boundsOfStored, eventFromSubmission, eventPathBase, reviewConcerns, scheduleFromStored, type StoredSchedule } from '@/lib/events/stored'

const blank = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const idOf = (ref: unknown): string | number | null => {
  if (ref && typeof ref === 'object' && 'id' in ref) return (ref as { id: string | number }).id
  return typeof ref === 'string' || typeof ref === 'number' ? ref : null
}
type Roles = { roles?: string[] }
// A stored submission is read field by field below, defensively; its generated type is not available inside a hook's untyped data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>

// ---- events ---------------------------------------------------------------------------------------------------------------

/** The first and last date of an event's schedule, stored in two indexed columns so the calendar can ask for "not over yet" in the database. */
export const eventBoundsBeforeChange: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const merged = { ...(originalDoc?.schedule ?? {}), ...(data?.schedule ?? {}) } as StoredSchedule
  const bounds = boundsOfStored(merged)
  data.firstDate = bounds?.first ?? null
  data.lastDate = bounds?.last ?? null
  return data
}

/**
 * An event's address. A migrated event keeps Grove's exact one; a new one gets `/community-calendar/event/<title>-<first date>`
 * once, when it is first published, and then keeps it. Only a publisher can set or change it. It cannot collide with any
 * other story, page, show or event.
 */
export const eventPathBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return data
  const existing = blank(originalDoc?.path)
  const touched = data.path !== undefined
  let path = touched ? blank(data.path) : existing
  if (touched && path !== existing && req.user && !userCan(req.user as Roles, 'content.publish')) {
    throw new APIError('Only a publisher can set or change an address.', 403, undefined, true)
  }
  const id = originalDoc?.id as string | number | undefined
  const self = id !== undefined ? ({ collection: 'events', id } as const) : undefined

  const status = data._status ?? originalDoc?._status
  if (!path && status === 'published') {
    const base = eventPathBase(String(data.title ?? originalDoc?.title ?? ''), (data.firstDate ?? originalDoc?.firstDate ?? null) as string | null)
    for (let n = 1; n <= 100; n += 1) {
      const candidate = n === 1 ? base : `${base}-${n}`
      if (!(await pathTaken(req.payload, req, candidate, self))) {
        path = candidate
        break
      }
    }
    if (!path) throw new APIError('No free address could be made for this event.', 400, undefined, true)
  }

  if (path && path !== existing) {
    const fail = (message: string): never => {
      throw new ValidationError({ collection: 'events', errors: [{ message, path: 'path' }], req }, req.t)
    }
    const check = checkPath(path)
    if (!check.ok) fail(check.reason)
    if (await pathTaken(req.payload, req, path, self)) fail(`The address ${path} is already used by another story, page, show or event.`)
  }
  if (path) data.path = path
  return data
}

export const revalidateEvent: CollectionAfterChangeHook = ({ doc, previousDoc, req: { context } }) => {
  if (!context.disableRevalidate) {
    for (const p of [doc?.path, previousDoc?.path]) if (typeof p === 'string' && p) revalidatePath(p)
    revalidatePath('/community-calendar')
  }
  return doc
}
export const revalidateEventDelete: CollectionAfterDeleteHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) {
    if (typeof doc?.path === 'string' && doc.path) revalidatePath(doc.path)
    revalidatePath('/community-calendar')
  }
  return doc
}

// ---- submissions ----------------------------------------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = { pending: 'pending', 'needs-info': 'needs information', approved: 'approved', rejected: 'rejected' }

/** A stored submission as the typed value the rules in `lib/events` work with. Categories stay as ids (the caller maps them). */
function valueOf(doc: Loose): SubmissionValue {
  const g = (o: unknown): Loose => (o && typeof o === 'object' ? (o as Loose) : {})
  const v = g(doc.venue)
  const o = g(doc.organization)
  const a = g(doc.artist)
  const s = g(doc.submitter)
  return {
    title: String(doc.title ?? ''),
    venue: { name: String(v.name ?? ''), street: v.street ?? null, city: v.city ?? null, state: v.state ?? null, zip: v.zip ?? null, email: v.email ?? null, phone: v.phone ?? null, website: v.website ?? null },
    schedule: scheduleFromStored(doc.schedule),
    categories: (Array.isArray(doc.categories) ? doc.categories : []).map((c: unknown) => String(idOf(c))),
    description: blank(doc.description),
    price: { text: blank(doc.price), free: Boolean(doc.free), additional: blank(doc.priceNotes) },
    ticketUrl: blank(doc.ticketUrl),
    organization: { name: o.name ?? null, email: o.email ?? null, phone: o.phone ?? null, website: o.website ?? null, designation: o.designation ?? 'n-a' },
    artist: { name: a.name ?? null, email: a.email ?? null, website: a.website ?? null },
    submitter: { name: s.name ?? null, email: String(s.email ?? ''), role: s.role ?? 'listener' },
  }
}

/**
 * The review rules for a submission, in one place:
 *  - concerns (advisory notes from the station's guidelines) are recomputed on every save;
 *  - changing the status records who and when;
 *  - an approved submission is final: the event exists, and is edited as an event;
 *  - only a publisher can approve, because approving makes the event live (a script with no signed-in user may);
 *  - approving creates the event, published, in the same transaction, and links it back. The submitter's contact details
 *    never leave the submission.
 */
export const submissionBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return data
  const before = (originalDoc?.status as string | undefined) ?? undefined
  const next = (data.status ?? before ?? 'pending') as string
  const merged = { ...(originalDoc ?? {}), ...data } as Loose

  if (before === 'approved' && next !== 'approved') {
    throw new APIError('An approved submission cannot be changed back. Edit the event it made instead.', 403, undefined, true)
  }
  const value = valueOf(merged)
  const first = boundsOfStored(merged.schedule as StoredSchedule)?.first
  let duplicate = false
  if (first && value.title) {
    const found = await req.payload.count({ collection: 'events', where: { and: [{ title: { equals: value.title } }, { firstDate: { equals: first } }] }, overrideAccess: true, req })
    duplicate = found.totalDocs > 0
  }
  data.concerns = reviewConcerns(value, { duplicate }).join('\n') || null

  if (next !== (before ?? 'pending')) {
    data.reviewedBy = req.user?.id ?? null
    data.reviewedAt = new Date().toISOString()
  }

  if (next === 'approved' && before !== 'approved') {
    if (req.user && !userCan(req.user as Roles, 'content.publish')) {
      throw new APIError(`Only a publisher can approve an event (it goes live at once). You can edit it, ask for information, or reject it. This one is ${STATUS_LABEL[before ?? 'pending']}.`, 403, undefined, true)
    }
    const problems: string[] = []
    if (value.schedule.kind === 'listed') problems.push('Give it valid dates first (see "When").')
    if (!value.title) problems.push('It needs a title.')
    if (!value.categories.length) problems.push('Choose at least one category.')
    if (problems.length) throw new ValidationError({ collection: 'event-submissions', errors: problems.map((message) => ({ message, path: 'status' })), req }, req.t)

    if (!merged.event) {
      const ids = new Map(value.categories.map((c) => [c, merged.categories.map(idOf).find((x: string | number | null) => String(x) === c)!] as const))
      const e = eventFromSubmission(value, ids)
      const created = await req.payload.create({
        collection: 'events',
        data: {
          _status: 'published',
          title: e.title,
          teaser: e.teaser,
          description: e.description as never,
          categories: e.categories as never,
          schedule: e.schedule as never,
          venue: e.venue as never,
          organization: e.organization as never,
          artist: e.artist as never,
          price: e.price,
          free: e.free,
          priceNotes: e.priceNotes,
          ticketUrl: e.ticketUrl,
          submissionId: originalDoc?.id !== undefined ? String(originalDoc.id) : null,
        },
        draft: false,
        overrideAccess: true,
        req,
      })
      data.event = created.id
    }
  }
  return data
}

export { EVENT_PATH_PREFIX }
