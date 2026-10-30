import type { ProjectClip } from "@/lib/transcription/clips";

export type ClipOrder = "in_order" | "newest";

/** How many excerpts the rail draws before "Show more". */
export const CLIP_PAGE_SIZE = 20;

/** The rail only offers a filter once there are enough excerpts to need one. */
export const CLIP_FILTER_THRESHOLD = 8;

/**
 * `clips` arrive oldest-made first. "In order" follows the recording, which
 * is how a reporter reads a transcript; "Newest" puts the one just made on
 * top, which is what they want right after making it.
 */
export function orderClips(clips: ProjectClip[], order: ClipOrder): ProjectClip[] {
  if (order === "newest") return [...clips].reverse();
  return [...clips].sort((a, b) => a.startMs - b.startMs);
}

export function filterClips(clips: ProjectClip[], query: string): ProjectClip[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return clips;
  return clips.filter(
    (clip) =>
      clip.title.toLowerCase().includes(needle) || clip.excerpt.toLowerCase().includes(needle),
  );
}
