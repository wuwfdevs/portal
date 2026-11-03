/**
 * A story's body text is required, except when the story is carried by something else: an audio file, a video, a photo or a
 * gallery (Grove has audio-only pieces such as "Gulf Stories Moment" and the 14:59 episodes). Pure, so the rule is tested
 * apart from the form.
 */
export const storyBodyMayBeEmpty = (data: { featuredAudio?: unknown; featuredMedia?: unknown } | null | undefined): boolean => {
  if (!data) return false
  const audio = data.featuredAudio
  const hasAudio = audio !== null && audio !== undefined && audio !== '' && audio !== false
  const media = data.featuredMedia
  const hasMedia = Array.isArray(media) && media.length > 0
  return hasAudio || hasMedia
}
