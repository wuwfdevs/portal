// Takes one public submission from the form and saves it as a draft event marked "pending review", or says why not. Server side
// only. It is the ONLY thing that writes an event for the public, and it does so through the Local API (events have no public
// create access of their own), after every check below. The route that calls it supplies the request facts (address, time).
//
// Order matters: the cheapest, quietest checks first. A bot that fills the hidden field is told "thank you" and nothing is
// saved, so it learns nothing. Nothing a submitter types is ever written to a log.

import type { Payload } from 'payload'

import sharp from 'sharp'

import { IMAGE, checkFormToken, clientKey, honeypotClean, rateDecision, sniffImage } from './abuse'
import { stationToday } from './schedule'
import { eventFromSubmission } from './stored'
import { validate, type RawForm } from './submission'

export interface SubmitInput {
  raw: RawForm
  token: string | undefined
  honeypot: string | undefined
  image: { name: string; bytes: Uint8Array } | null
  /** The first hop of the forwarded-for header, or 'unknown'. */
  address: string
  now: Date
}
export interface SubmitSecrets {
  /** Signs the form token. */
  token: string
  /** Keys the client hash. */
  client: string
}

export type SubmitOutcome =
  | { kind: 'ok' }
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'form-expired' }
  | { kind: 'too-fast' }
  | { kind: 'limited'; retryAfter: 'hour' | 'day' }

/** How long a stored client key is kept. It exists only to count recent submissions. */
const KEY_KEEP_MS = 48 * 3_600_000

export async function processSubmission(payload: Payload, input: SubmitInput, secrets: SubmitSecrets): Promise<SubmitOutcome> {
  const { now } = input

  // 1. A bot fills the field a person never sees. Say thanks, save nothing.
  if (!honeypotClean(input.honeypot)) {
    payload.logger.info('Community calendar: a submission was dropped (hidden field filled).')
    return { kind: 'ok' }
  }

  // 2. The form must have been open a human-plausible time, and not be stale or forged.
  const token = checkFormToken(input.token, now, secrets.token)
  if (!token.ok) {
    if (token.reason === 'too-fast') return { kind: 'too-fast' }
    return { kind: 'form-expired' }
  }

  // 3. Rate limit by a keyed hash of the address. Old keys are cleared as we go.
  // The keys live in their own small ledger, not on the event: events keep version history, and a hash of an address must not.
  const key = clientKey(input.address, secrets.client)
  await payload.delete({
    collection: 'submission-rate-limits',
    where: { createdAt: { less_than: new Date(now.getTime() - KEY_KEEP_MS).toISOString() } },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const since = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const [lastHour, lastDay] = await Promise.all([
    payload.count({ collection: 'submission-rate-limits', overrideAccess: true, where: { and: [{ key: { equals: key } }, { createdAt: { greater_than: since(3_600_000) } }] } }),
    payload.count({ collection: 'submission-rate-limits', overrideAccess: true, where: { and: [{ key: { equals: key } }, { createdAt: { greater_than: since(24 * 3_600_000) } }] } }),
  ])
  const rate = rateDecision({ lastHour: lastHour.totalDocs, lastDay: lastDay.totalDocs })
  if (!rate.allowed) return { kind: 'limited', retryAfter: rate.retryAfter }

  // 4. The fields.
  const categories = await payload.find({ collection: 'event-categories', depth: 0, limit: 100, overrideAccess: true, pagination: false, select: { slug: true } })
  const idBySlug = new Map(categories.docs.map((c) => [c.slug, c.id] as const))
  const checked = validate(input.raw, { categories: [...idBySlug.keys()], today: stationToday(now) })
  const errors: Record<string, string> = checked.ok ? {} : { ...checked.errors }

  // 5. The picture, if there is one: by its bytes, its size, and the pixel range the form promises.
  let image: { name: string; bytes: Uint8Array; type: string } | null = null
  if (input.image && input.image.bytes.byteLength > 0) {
    const { bytes, name } = input.image
    const type = sniffImage(bytes)
    if (bytes.byteLength > IMAGE.maxBytes) errors['event-image'] = `The picture is larger than ${IMAGE.maxBytes / 1024 / 1024} MB.`
    else if (!type) errors['event-image'] = 'The picture must be a JPEG, PNG, WebP or GIF file.'
    else {
      const meta = await sharp(Buffer.from(bytes)).metadata().catch(() => null)
      if (!meta?.width || !meta.height) errors['event-image'] = 'That picture could not be read.'
      else if (Math.min(meta.width, meta.height) < IMAGE.minPixels || Math.max(meta.width, meta.height) > IMAGE.maxPixels)
        errors['event-image'] = `The picture should be at least ${IMAGE.minPixels} by ${IMAGE.minPixels} pixels and no bigger than ${IMAGE.maxPixels} by ${IMAGE.maxPixels}.`
      else image = { name, bytes, type }
    }
  }
  if (!checked.ok || Object.keys(errors).length) return { kind: 'invalid', errors }

  // 6. Save it as a DRAFT event marked "pending review": private until a publisher publishes it. The file name is made here; the
  // submitter's is never used.
  const v = checked.value
  const e = eventFromSubmission(v, idBySlug)
  const imageDoc = image
    ? await payload.create({
        collection: 'event-submission-images',
        data: {},
        file: { data: Buffer.from(image.bytes), mimetype: image.type, name: `submitted-${now.getTime().toString(36)}.${image.type.split('/')[1]!.replace('jpeg', 'jpg')}`, size: image.bytes.byteLength },
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    : null
  await payload.create({
    collection: 'events',
    draft: true,
    data: {
      _status: 'draft',
      review: { status: 'pending' },
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
      ...(imageDoc ? { submittedImage: imageDoc.id } : {}),
      submitter: v.submitter,
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await payload.create({ collection: 'submission-rate-limits', data: { key }, overrideAccess: true, context: { disableRevalidate: true } })
  return { kind: 'ok' }
}
