import { isCadenceChannelId } from './schedule'

/**
 * The live channels (board 26), read safely from the Listen live settings. Pure. A channel without a usable https
 * stream is left out, so the player never offers a stream it cannot play.
 */

export type LiveChannel = {
  /** Stable key for the page and the player: the Cadence channel ID when there is one, else the position. */
  key: string
  name: string
  /** A short form for the bar: "88.1", "HD2". */
  short: string
  streamUrl: string
  cadenceChannelId: string | null
  description: string | null
}

type Raw = {
  name?: string | null
  short?: string | null
  streamUrl?: string | null
  cadenceChannelId?: string | null
  description?: string | null
}

export function isStreamUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function validateStreamUrl(value: string | null | undefined): true | string {
  return isStreamUrl(value?.trim()) ? true : 'Use the stream’s full https:// address.'
}

export function validateCadenceChannelId(value: string | null | undefined): true | string {
  if (!value) return true
  return isCadenceChannelId(value.trim()) ? true : 'A Cadence channel ID looks like eed45825-935f-4185-8b47-059fcc96a6a6.'
}

export function liveChannels(raw: Raw[] | null | undefined): LiveChannel[] {
  return (raw ?? []).flatMap((c, i) => {
    const name = c.name?.trim()
    const streamUrl = c.streamUrl?.trim()
    if (!name || !isStreamUrl(streamUrl)) return []
    const cadence = c.cadenceChannelId?.trim()
    const cadenceChannelId = isCadenceChannelId(cadence) ? cadence : null
    return [
      {
        key: cadenceChannelId ?? `channel-${i + 1}`,
        name,
        short: c.short?.trim() || name,
        streamUrl,
        cadenceChannelId,
        description: c.description?.trim() || null,
      },
    ]
  })
}
