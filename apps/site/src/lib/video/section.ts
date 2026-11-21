/**
 * The short videos for a section's page: the newest clips whose story is filed under that section. A clip has no section of its own (an editor
 * would have to say it twice, and a clip's story already says it), so a clip with no story, or whose story has no section, is on `/video` and the
 * home page but on no section page. `clips` is newest first and the order is kept.
 */
export const SECTION_CLIP_COUNT = 6

export function clipsForSection<T extends { sectionId: string | number | null }>(clips: readonly T[], sectionId: string | number | null | undefined, count = SECTION_CLIP_COUNT): T[] {
  if (sectionId == null || sectionId === 0) return []
  return clips.filter((c) => c.sectionId != null && String(c.sectionId) === String(sectionId)).slice(0, Math.max(0, count))
}
