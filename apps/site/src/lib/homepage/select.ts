// Which stories the homepage shows where. Editors curate the lead and the top stories; anything they leave empty, and
// anything they chose that is no longer published, is filled from the newest published work, and no story appears twice.
// Pure: the loader hands it already-published stories.

export interface HasId {
  id: string | number
}

export interface Arrangement<T extends HasId> {
  lead: T | null
  top: T[]
}

const unique = <T extends HasId>(items: readonly T[]): T[] => {
  const seen = new Set<string>()
  return items.filter((i) => {
    const key = String(i.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * @param curatedLead    the story an editor chose to lead, if it is still published
 * @param curatedTop     the stories an editor chose for the top list, in their order (unpublished ones already gone)
 * @param recent         the newest published stories, newest first
 * @param topCount       how many the top list holds
 */
export function arrangeHomepage<T extends HasId>(input: { curatedLead: T | null; curatedTop: readonly T[]; recent: readonly T[]; topCount: number }): Arrangement<T> {
  const lead = input.curatedLead ?? input.recent[0] ?? null
  const taken = new Set<string>(lead ? [String(lead.id)] : [])
  const chosen = unique(input.curatedTop).filter((s) => !taken.has(String(s.id))).slice(0, input.topCount)
  chosen.forEach((s) => taken.add(String(s.id)))
  const fill = input.recent.filter((s) => !taken.has(String(s.id))).slice(0, Math.max(0, input.topCount - chosen.length))
  return { lead, top: [...chosen, ...fill] }
}

/** The stories below the lead and the top list, newest first, leaving out anything already shown above. */
export function remainingStories<T extends HasId>(candidates: readonly T[], shown: readonly HasId[], limit: number): T[] {
  const taken = new Set(shown.map((s) => String(s.id)))
  return candidates.filter((s) => !taken.has(String(s.id))).slice(0, Math.max(0, limit))
}

// ---- the picture a story leads with ---------------------------------------------------------------------------------

type Rel<T> = T | string | number | null | undefined
interface MediaLike {
  id: string | number
}
interface FeaturedItem {
  blockType?: string
  media?: Rel<MediaLike>
  images?: { image?: Rel<MediaLike> }[] | null
}
interface StoryWithPicture {
  featuredMedia?: FeaturedItem[] | null
  meta?: { image?: Rel<MediaLike> } | null
}

/**
 * The picture to show for a story: its featured photo, or the first photo of its featured gallery, or the SEO image an
 * editor set. A migrated story has no SEO image, so its featured media is what gives it a picture. Only a loaded
 * (populated) media record counts; a bare id means the relationship was not loaded and is treated as no picture.
 */
export function leadPicture<M extends MediaLike>(story: StoryWithPicture): M | null {
  const asMedia = (v: Rel<MediaLike>): M | null => (v && typeof v === 'object' ? (v as M) : null)
  for (const item of story.featuredMedia ?? []) {
    if (item.blockType === 'mediaBlock') {
      const m = asMedia(item.media)
      if (m) return m
    }
    if (item.blockType === 'gallery') {
      for (const slide of item.images ?? []) {
        const m = asMedia(slide.image)
        if (m) return m
      }
    }
  }
  return asMedia(story.meta?.image)
}
