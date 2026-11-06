// How a RadioLive recording can be given: a file in the video library (with captions kept here), or the address of a video on YouTube or Vimeo,
// where RadioLive's sets already live. A hosted video is shown through the site's own embed rules, so it is sandboxed, never gets a script of ours, and
// only the two named providers are accepted. Pure.

import { EMBED_FAILURE_MESSAGE, resolveEmbed, type ResolvedEmbed } from '../embeds'

/** The embed for a recording address, or a message an editor can act on. */
export function recordingEmbed(input: string | null | undefined): { ok: true; embed: ResolvedEmbed } | { ok: false; message: string } {
  const value = input?.trim() ?? ''
  if (!value) return { ok: false, message: 'Enter the address of a video.' }
  const result = resolveEmbed(value)
  if (!result.ok) return { ok: false, message: EMBED_FAILURE_MESSAGE[result.reason] }
  const { embed } = result
  if ((embed.provider !== 'youtube' && embed.provider !== 'vimeo') || embed.shape !== 'video') return { ok: false, message: 'Use the address of one video on YouTube or Vimeo (not a playlist or another site). To use another host, upload the file to the video library instead.' }
  return { ok: true, embed }
}

/** Payload field validator: empty is fine (a show may have no recording yet). */
export const validateRecordingUrl = (value: string | null | undefined): true | string => {
  if (!value || value.trim() === '') return true
  const r = recordingEmbed(value)
  return r.ok ? true : r.message
}
