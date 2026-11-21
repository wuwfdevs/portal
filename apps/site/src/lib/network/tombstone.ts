/**
 * What is left of a network story once it is dismissed, or turns out to be restricted: its CDS id and its status, and nothing about the
 * story. The id stays so the story is not found and queued again while the source still lists it. Pure.
 */

export const TOMBSTONE_TITLE = 'Dismissed'

const emptyImage = { href: null, hrefTemplate: null, width: null, height: null, altText: null, caption: null, credit: null }
const emptyAudio = { href: null, mimeType: null, durationSeconds: null }

/** The field values that blank a story's content. `title` is required, so it is a fixed word, never the story's own. */
export function tombstoneFields(): Record<string, unknown> {
  return {
    title: TOMBSTONE_TITLE,
    teaser: null,
    publishedAt: null,
    modifiedAt: null,
    canonicalUrl: null,
    ownerHrefs: null,
    brandingHrefs: null,
    image: { ...emptyImage },
    imageDroppedAsRestricted: false,
    audio: { ...emptyAudio },
    audioSkipped: null,
  }
}
