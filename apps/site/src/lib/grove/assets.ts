// The files a converted story needs, and putting the library ids back in once they are stored.

import { isAssetToken, type AssetRef, type ConvertedStory } from './types'

export class MissingAssetError extends Error {
  constructor(readonly urls: string[]) {
    super(`No library record for ${urls.length} file(s): ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ', ...' : ''}`)
  }
}

export const assetRefs = (story: ConvertedStory): AssetRef[] => story.assets

/**
 * A copy of `value` with every asset token replaced by the id the library gave that file. Throws, naming the files,
 * if any has no id: a story must not be saved pointing at nothing.
 */
export function resolveAssets<T>(value: T, idBySourceUrl: ReadonlyMap<string, number | string>): T {
  const missing = new Set<string>()
  const walk = (v: unknown): unknown => {
    if (isAssetToken(v)) {
      const id = idBySourceUrl.get(v.$asset)
      if (id === undefined) missing.add(v.$asset)
      return id
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  const out = walk(value) as T
  if (missing.size) throw new MissingAssetError([...missing])
  return out
}
