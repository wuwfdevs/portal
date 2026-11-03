import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook } from 'payload'

import { APIError, ValidationError } from 'payload'

import { userCan } from '@/access/permissions'
import { pathTaken } from '@/hooks/pathHooks'
import { checkPath } from '@/lib/paths'
import { revalidatePath } from '@/lib/revalidate'
import type { SubmissionValue } from '@/lib/events/submission'
import { EVENT_PATH_PREFIX, boundsOfStored, eventPathBase, reviewConcerns, scheduleFromStored, type StoredSchedule } from '@/lib/events/stored'

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

// ---- review (an event sent in through the public form) ------------------------------------------------------------------------

/** The words of an editor's rich text, for the advisory checks (the number of links, say). */
function plainOf(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Loose
  if (typeof n.text === 'string') return n.text
  const kids = Array.isArray(n.children) ? n.children : n.root ? [n.root] : []
  return kids.map(plainOf).join(n.type === 'paragraph' ? '\n\n' : ' ')
}

/** A stored event, with the submitter and review, as the typed value the rules in `lib/events` work with. Categories stay as ids. */
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
    description: blank(plainOf(doc.description)),
    price: { text: blank(doc.price), free: Boolean(doc.free), additional: blank(doc.priceNotes) },
    ticketUrl: blank(doc.ticketUrl),
    organization: { name: o.name ?? null, email: o.email ?? null, phone: o.phone ?? null, website: o.website ?? null, designation: o.designation ?? 'n-a' },
    artist: { name: a.name ?? null, email: a.email ?? null, website: a.website ?? null },
    submitter: { name: s.name ?? null, email: String(s.email ?? ''), role: s.role ?? 'listener' },
  }
}

/**
 * The review rules for an event that has a review status (one sent in through the form), in one place. Events staff made and
 * Grove's are not touched.
 *  - concerns (advisory notes from the station's guidelines) are recomputed on every save;
 *  - changing the status records who and when;
 *  - "Approved" cannot be chosen: publishing is approving. Only a publisher can publish (the publish guard), so approval
 *    needs that permission, and it needs a title, a category and dates that could be read;
 *  - publishing marks the review approved.
 */
export const eventReviewBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return data
  const before = (originalDoc?.review as Loose | undefined)?.status as string | undefined
  const review = { ...((originalDoc?.review as Loose | undefined) ?? {}), ...((data.review as Loose | undefined) ?? {}) }
  const next = review.status as string | undefined
  if (!next) return data // not an event from the form

  const nowPublished = (data._status ?? originalDoc?._status) === 'published'
  const wasPublished = originalDoc?._status === 'published'
  if (next === 'approved' && !nowPublished) {
    throw new APIError('An event is approved by publishing it. Choose another status, or publish the event (publishers only).', 400, undefined, true)
  }

  const merged = { ...(originalDoc ?? {}), ...data } as Loose
  const value = valueOf(merged)
  const first = boundsOfStored(merged.schedule as StoredSchedule)?.first
  let duplicate = false
  if (first && value.title) {
    const others = await req.payload.count({
      collection: 'events',
      where: { and: [{ title: { equals: value.title } }, { firstDate: { equals: first } }, { _status: { equals: 'published' } }, ...(originalDoc?.id !== undefined ? [{ id: { not_equals: originalDoc.id } }] : [])] },
      overrideAccess: true,
      req,
    })
    duplicate = others.totalDocs > 0
  }
  review.concerns = reviewConcerns(value, { duplicate }).join('\n') || null

  if (nowPublished && !wasPublished) {
    const problems: string[] = []
    if (value.schedule.kind === 'listed') problems.push('Give it valid dates first (see "When").')
    if (!value.title) problems.push('It needs a title.')
    if (!value.categories.length) problems.push('Choose at least one category.')
    if (problems.length) throw new ValidationError({ collection: 'events', errors: problems.map((message) => ({ message, path: 'schedule' })), req }, req.t)
    review.status = 'approved'
    review.reviewedBy = req.user?.id ?? null
    review.reviewedAt = new Date().toISOString()
  } else if (next !== (before ?? 'pending') && next !== 'approved') {
    review.reviewedBy = req.user?.id ?? null
    review.reviewedAt = new Date().toISOString()
  }
  data.review = review
  return data
}

export { EVENT_PATH_PREFIX }
