import type { AudioSkipReason, CandidateAudio, CandidateImage, NetworkCandidate, ParsedDocuments } from './types'

/**
 * Reads a CDS `GET /v1/documents` response into network candidates. Pure: no fetch, no Payload.
 *
 * What the rules are (CDS docs, read 2026-11-18):
 * - A document with `isRestrictedToAuthorizedOrgServiceIds: true` must not be republished, indexed or linked to publicly. It is **filtered out
 *   here**: not returned, only counted. A restricted *asset* (a picture) inside an unrestricted story is dropped and the story kept.
 * - Audio enclosures can carry the rels `tracked` (analytics), `sponsored` or `premium`. Only a clean one is chosen; if none is, the story has
 *   no audio and says why. An unavailable asset, or one past its `streamExpirationDateTime`, is not chosen either.
 * - Nothing is invented: a document with no id or no title is counted as malformed and dropped.
 *
 * Not read yet, so not handled here: the body (`layout`). That is the converter's job and it needs real documents (see ROADMAP).
 */

type Rec = Record<string, unknown>

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const rels = (v: unknown): string[] => (Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : [])
const dateString = (v: unknown): string | null => {
  const s = str(v)
  return s && !Number.isNaN(Date.parse(s)) ? s : null
}
const https = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  try {
    return new URL(s).protocol === 'https:' ? s : null
  } catch {
    return null
  }
}
const linkHrefs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(isRecord).map((l) => str(l.href)).filter((h): h is string => h !== null) : []

/** The documents array of a response. CDS's envelope is `{ resources: [...] }`; anything else is a response we do not recognise. */
export function extractResources(body: unknown): unknown[] {
  if (isRecord(body) && Array.isArray(body.resources)) return body.resources
  const detail = isRecord(body) ? ` (top-level keys: ${Object.keys(body).slice(0, 8).join(', ') || 'none'})` : ` (body was ${Array.isArray(body) ? 'an array' : typeof body})`
  throw new Error(`NPR CDS returned a response this integration does not recognise${detail}.`)
}

/** `#/assets/<id>` resolved against the document's own `assets` map. */
function resolveAsset(assets: unknown, href: unknown): Rec | null {
  const ref = str(href)
  if (!ref || !ref.startsWith('#/assets/') || !isRecord(assets)) return null
  const asset = assets[ref.slice('#/assets/'.length)]
  return isRecord(asset) ? asset : null
}

const restrictedFlag = (doc: Rec): boolean => doc.isRestrictedToAuthorizedOrgServiceIds === true

/** References in the order we prefer: those carrying a preferred rel first (in the order given), then the rest, minus the excluded rels. */
function orderedRefs(refs: unknown, prefer: string[], exclude: string[] = []): Rec[] {
  const list = Array.isArray(refs) ? refs.filter(isRecord) : []
  const allowed = list.filter((r) => !rels(r.rels).some((x) => exclude.includes(x)))
  const rank = (r: Rec): number => {
    const found = prefer.findIndex((p) => rels(r.rels).includes(p))
    return found === -1 ? prefer.length : found
  }
  return [...allowed].sort((a, b) => rank(a) - rank(b))
}

function pickImage(doc: Rec): { image: CandidateImage | null; droppedAsRestricted: boolean } {
  let droppedAsRestricted = false
  for (const ref of orderedRefs(doc.images, ['primary', 'promo-image-standard', 'promo-image-wide'], ['logo', 'premium-logo', 'headshot', 'thumbnail'])) {
    const asset = resolveAsset(doc.assets, ref.href)
    if (!asset) continue
    if (restrictedFlag(asset)) {
      droppedAsRestricted = true
      continue
    }
    const enclosures = Array.isArray(asset.enclosures) ? asset.enclosures.filter(isRecord) : []
    // Prefer an enclosure that resizes (it has a template), then the one marked primary, then the first with an https address.
    const usable = enclosures.filter((e) => https(e.href))
    const enclosure = usable.find((e) => str(e.hrefTemplate)) ?? usable.find((e) => rels(e.rels).includes('primary')) ?? usable[0]
    if (!enclosure) continue
    const template = str(enclosure.hrefTemplate)
    return {
      droppedAsRestricted,
      image: {
        href: https(enclosure.href)!,
        hrefTemplate: template && https(template.replace(/\{[^}]*\}/g, '')) ? template : null,
        width: num(enclosure.width),
        height: num(enclosure.height),
        altText: str(asset.altText),
        caption: str(asset.caption),
        credit: str(asset.producer) ?? str(asset.provider),
      },
    }
  }
  return { image: null, droppedAsRestricted }
}

const BAD_AUDIO_RELS: AudioSkipReason[] = ['premium', 'tracked', 'sponsored']

function pickAudio(doc: Rec, now: Date): { audio: CandidateAudio | null; skipped: AudioSkipReason | null } {
  let skipped: AudioSkipReason | null = null
  for (const ref of orderedRefs(doc.audio, ['primary', 'headline'], ['intro', 'promo', 'nprone-override'])) {
    const asset = resolveAsset(doc.assets, ref.href)
    if (!asset) continue
    if (restrictedFlag(asset)) {
      skipped ??= 'restricted'
      continue
    }
    if (asset.isAvailable === false) {
      skipped ??= 'unavailable'
      continue
    }
    const expires = dateString(asset.streamExpirationDateTime)
    if (expires && Date.parse(expires) <= now.getTime()) {
      skipped ??= 'expired'
      continue
    }
    const enclosures = Array.isArray(asset.enclosures) ? asset.enclosures.filter(isRecord) : []
    const withFile = enclosures.filter((e) => https(e.href))
    if (withFile.length === 0) {
      skipped ??= 'no-file'
      continue
    }
    const clean = withFile.find((e) => !rels(e.rels).some((r) => (BAD_AUDIO_RELS as string[]).includes(r)))
    if (!clean) {
      const flagged = BAD_AUDIO_RELS.find((bad) => withFile.some((e) => rels(e.rels).includes(bad)))
      skipped ??= flagged ?? 'no-file'
      continue
    }
    const duration = num(asset.duration)
    return { skipped: null, audio: { href: https(clean.href)!, mimeType: str(clean.type), durationSeconds: duration !== null && duration > 0 ? Math.round(duration) : null } }
  }
  return { audio: null, skipped }
}

/** The story profile, when the document declares profiles at all. A document with no `profiles` array is trusted (the request already filtered). */
function isStoryDocument(doc: Rec): boolean {
  if (!Array.isArray(doc.profiles)) return true
  return doc.profiles.filter(isRecord).some((p) => /\/profiles\/story$/.test(str(p.href) ?? ''))
}

export function parseDocumentsResponse(body: unknown, now: Date = new Date()): ParsedDocuments {
  const result: ParsedDocuments = { candidates: [], restricted: 0, notStory: 0, malformed: 0, seenIds: [], restrictedIds: [] }
  for (const raw of extractResources(body)) {
    if (!isRecord(raw)) {
      result.malformed += 1
      continue
    }
    const cdsId = str(raw.id)
    if (!cdsId) {
      result.malformed += 1
      continue
    }
    if (!isStoryDocument(raw)) {
      result.notStory += 1
      continue
    }
    result.seenIds.push(cdsId)
    if (restrictedFlag(raw)) {
      result.restricted += 1
      result.restrictedIds.push(cdsId)
      continue
    }
    const title = str(raw.title)
    if (!title) {
      result.malformed += 1
      continue
    }
    const { image, droppedAsRestricted } = pickImage(raw)
    const { audio, skipped } = pickAudio(raw, now)
    const canonical = Array.isArray(raw.webPages)
      ? raw.webPages.filter(isRecord).find((p) => rels(p.rels).includes('canonical'))
      : undefined
    const candidate: NetworkCandidate = {
      cdsId,
      title,
      teaser: str(raw.teaser) ?? str(raw.shortTeaser),
      publishedAt: dateString(raw.publishDateTime),
      modifiedAt: dateString(raw.editorialLastModifiedDateTime),
      ownerHrefs: linkHrefs(raw.owners),
      brandingHrefs: linkHrefs(raw.brandings ?? raw.branding),
      canonicalUrl: canonical ? https(canonical.href) : null,
      image,
      imageDroppedAsRestricted: droppedAsRestricted,
      audio,
      audioSkipped: skipped,
    }
    result.candidates.push(candidate)
  }
  return result
}

/** `https://organization.api.npr.org/v4/services/s583` -> `s583`. Null when the address has no last segment. */
export function serviceIdFromHref(href: string): string | null {
  try {
    const segments = new URL(href).pathname.split('/').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : null
  } catch {
    return null
  }
}
