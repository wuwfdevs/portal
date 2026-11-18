/**
 * Network content: one story from another station or from NPR, as the poll finds it in NPR's Content Distribution Service (CDS).
 * Pure types (no Payload, no network). The shapes follow the CDS profile pages (document, publishable, has-images, has-audio, image,
 * audio) read on 2026-11-18; `ROADMAP.md` -> *Network content* records what is documented and what is still a guess.
 */

/** The picture a story offers, already checked: https, and not flagged restricted. */
export type CandidateImage = {
  /** The file's address. Always https. */
  href: string
  /** An RFC 6570 template that resizes it (width, quality, format), when CDS offers one. Use `expandImageUrl`. */
  hrefTemplate: string | null
  width: number | null
  height: number | null
  altText: string | null
  caption: string | null
  /** Producer or provider, for the credit under the picture. */
  credit: string | null
}

/** The audio a story offers: one clean (not tracked, sponsored or premium), available, not expired enclosure. */
export type CandidateAudio = {
  href: string
  mimeType: string | null
  durationSeconds: number | null
}

/** Why a story's audio was left out, for the editor to see. `null` when audio was chosen or the story has none. */
export type AudioSkipReason = 'unavailable' | 'expired' | 'restricted' | 'premium' | 'tracked' | 'sponsored' | 'no-file'

export type NetworkCandidate = {
  /** CDS's own document id: the one stable identity. Never derived from a title. */
  cdsId: string
  title: string
  teaser: string | null
  /** RFC 3339, as CDS sent it. */
  publishedAt: string | null
  modifiedAt: string | null
  /** `owners` links (who the document is searchable under) and `brandings` links (who is credited). Organization V4 addresses. */
  ownerHrefs: string[]
  brandingHrefs: string[]
  /** The `webPages` entry with the `canonical` rel: where the original lives. It becomes the story's `rel=canonical`. */
  canonicalUrl: string | null
  image: CandidateImage | null
  /** A restricted picture was left out; the story itself is not restricted. */
  imageDroppedAsRestricted: boolean
  audio: CandidateAudio | null
  audioSkipped: AudioSkipReason | null
}

/** What a documents response holds, after the rules: restricted stories are only counted, never kept. */
export type ParsedDocuments = {
  candidates: NetworkCandidate[]
  /** Documents flagged `isRestrictedToAuthorizedOrgServiceIds: true`. Filtered out; the poll log counts them. */
  restricted: number
  /** Documents that were not stories (a collection or a podcast episode came back). */
  notStory: number
  /** Documents with no usable id or title. Never invented. */
  malformed: number
  /** The ids of every story document in the response, kept or restricted, for re-check bookkeeping. */
  seenIds: string[]
  /** The ids of the restricted ones. Only ids: nothing else about a restricted story is kept. */
  restrictedIds: string[]
}
