// Placeholder pictures for the STAGING site's demonstration content, so a card, a hero or a profile shows as it will look with a real picture.
//
// The pictures are arbitrary photos already in the media library: they have nothing to do with the story they sit on, and each use says so in its
// credit and alt text. Rules, the same as the seeds beside it:
//  - Only records labelled "Demonstration" (or "Demo Artist"), never an editor's own work.
//  - Only a record with no picture yet. One that has any picture is left exactly as it is, so it is safe to run twice.
//  - It sends nothing: no email, no embedding (`disableEmbedding`), no cache refresh (a new deployment reads fresh).
//  - With no suitable photos in the library it does nothing and says so.

import type { Payload } from 'payload'

export const PLACEHOLDER_CREDIT = 'Placeholder photo (demonstration)'
export const PLACEHOLDER_ALT = 'Placeholder photo for design review'

export interface PhotoLike {
  id: string | number
  width?: number | null
  height?: number | null
  filename?: string | null
  mimeType?: string | null
}

/** Wire photos, our own demonstration art and anything that is a logo or a test shot are not what a layout review wants to look at. */
const NOT_A_PHOTO = /^(ap|demo)|wordmark|logo|test|screenshot/i

/**
 * Landscape photos from the library that suit a card or a hero: big enough, close to 3:2, not wire art. Oldest first, so the choice is the same on
 * every run. Arbitrary on purpose.
 */
export function choosePlaceholderPhotos<T extends PhotoLike>(media: readonly T[], count = Number.POSITIVE_INFINITY): T[] {
  return media
    .filter((m) => {
      const w = m.width ?? 0
      const h = m.height ?? 0
      return Boolean(m.mimeType?.startsWith('image/')) && w >= 1800 && h >= 1200 && w / h >= 1.3 && w / h <= 1.8 && !NOT_A_PHOTO.test(m.filename ?? '')
    })
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, Math.max(0, count))
}

const ctx = { disableRevalidate: true, disableEmbedding: true }

/** Adds a placeholder picture to each demonstration record that has none. Returns what it did (or, without `apply`, what it would do). */
export async function addPlaceholderPictures(payload: Payload, opts: { apply: boolean; log?: (line: string) => void }): Promise<string[]> {
  const done: string[] = []
  const note = (line: string) => {
    done.push(line)
    opts.log?.(`${opts.apply ? 'picture ' : 'would   '} ${line}`)
  }

  const library = await payload.find({ collection: 'media', where: { mimeType: { like: 'image/' } }, sort: 'id', limit: 400, depth: 0, pagination: false, overrideAccess: true })
  const photos = choosePlaceholderPhotos(library.docs as unknown as PhotoLike[], 16)
  if (photos.length === 0) {
    opts.log?.('skipped  placeholder pictures: no suitable photos in the media library')
    return done
  }
  let used = 0
  const next = () => photos[used++ % photos.length].id

  // Stories: a featured picture, as the stories seeded earlier already have.
  const posts = await payload.find({ collection: 'posts', where: { title: { like: 'Demonstration' } }, limit: 300, depth: 0, pagination: false, overrideAccess: true, draft: false })
  for (const post of posts.docs) {
    if ((post.featuredMedia?.length ?? 0) > 0 || post.meta?.image) continue
    note(`story "${post.title}"`)
    if (opts.apply) {
      await payload.update({
        collection: 'posts',
        id: post.id,
        data: { featuredMedia: [{ blockType: 'mediaBlock', media: next(), credit: PLACEHOLDER_CREDIT, altText: PLACEHOLDER_ALT, alignment: 'full' }] } as never,
        overrideAccess: true,
        context: ctx,
        draft: false,
      })
    }
  }

  // Shows, series, artists and performances: the one picture each of them has.
  const label = { productions: 'title', series: 'title', artists: 'name', performances: 'title' } as const
  const field = { productions: 'heroImage', series: 'heroImage', artists: 'photo', performances: 'photo' } as const
  for (const collection of ['productions', 'series', 'artists', 'performances'] as const) {
    const where =
      collection === 'artists' ? { name: { like: 'Demo Artist' } } : collection === 'performances' ? { title: { like: 'Demonstration' } } : { or: [{ title: { like: 'demonstration' } }, { summary: { like: 'Demonstration' } }] }
    const found = await payload.find({ collection, where: where as never, limit: 100, depth: 0, pagination: false, overrideAccess: true, draft: false })
    for (const doc of found.docs as unknown as Record<string, unknown>[]) {
      if (doc[field[collection]]) continue
      note(`${collection.replace(/s$/, '')} "${String(doc[label[collection]])}"`)
      if (opts.apply) await payload.update({ collection, id: doc.id as number, data: { [field[collection]]: next() } as never, overrideAccess: true, context: ctx, draft: false })
    }
  }
  return done
}
