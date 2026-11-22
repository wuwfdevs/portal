// Which version of a dataset a visualization draws. Pure.
//
//   latest  the newest PUBLISHED version: a new upload changes every visualization that follows the dataset, once a publisher publishes it.
//   pinned  one named version, which never changes: the chart a story was written around stays as it was.
//
// A staged (unpublished) version is drawn only in a preview, so an editor can see the effect of new data before it is public.

export interface VersionRef {
  id: number | string
  version: number
  published: boolean
}

export type VersionChoice = { ok: true; version: VersionRef } | { ok: false; reason: 'none-published' | 'pinned-missing' | 'pinned-unpublished' | 'none' }

export function chooseVersion(
  mode: 'latest' | 'pinned',
  pinnedId: number | string | null | undefined,
  versions: readonly VersionRef[],
  preview: boolean,
): VersionChoice {
  if (mode === 'pinned') {
    const pinned = versions.find((v) => String(v.id) === String(pinnedId ?? ''))
    if (!pinned) return { ok: false, reason: 'pinned-missing' }
    return pinned.published || preview ? { ok: true, version: pinned } : { ok: false, reason: 'pinned-unpublished' }
  }
  const usable = versions.filter((v) => v.published || preview)
  if (usable.length === 0) return { ok: false, reason: versions.length === 0 ? 'none' : 'none-published' }
  return { ok: true, version: usable.reduce((a, b) => (b.version > a.version ? b : a)) }
}

export const VERSION_PROBLEM: Record<Exclude<VersionChoice, { ok: true }>['reason'], string> = {
  none: 'The dataset has no versions yet. Upload a file to it.',
  'none-published': 'The dataset has no published version. A publisher must publish one.',
  'pinned-missing': 'The pinned version of the dataset is missing. Choose one, or follow the latest.',
  'pinned-unpublished': 'The pinned version of the dataset is not published.',
}
