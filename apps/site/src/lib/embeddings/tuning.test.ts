import { describe, expect, it } from 'vitest'

import { MAX_PER_SERIES, MIN_RELATED_SIMILARITY, MIN_SEARCH_SIMILARITY } from './rank'
import { DEFAULT_TUNING, resolveTuning } from './tuning'

describe('resolveTuning', () => {
  it('falls back to the starting values when nothing is saved', () => {
    expect(resolveTuning(null)).toEqual(DEFAULT_TUNING)
    expect(resolveTuning({})).toEqual({ relatedMinSimilarity: MIN_RELATED_SIMILARITY, searchMinSimilarity: MIN_SEARCH_SIMILARITY, relatedMaxPerSeries: MAX_PER_SERIES })
  })

  it('uses saved values inside their ranges', () => {
    expect(resolveTuning({ relatedMinSimilarity: 0.5, searchMinSimilarity: 0.3, relatedMaxPerSeries: 3 })).toEqual({ relatedMinSimilarity: 0.5, searchMinSimilarity: 0.3, relatedMaxPerSeries: 3 })
  })

  it('clamps a value outside its range, so a typo cannot hide or flood recommendations', () => {
    const high = resolveTuning({ relatedMinSimilarity: 1, searchMinSimilarity: 5, relatedMaxPerSeries: 40 })
    expect(high).toEqual({ relatedMinSimilarity: 0.9, searchMinSimilarity: 0.9, relatedMaxPerSeries: 4 })
    const low = resolveTuning({ relatedMinSimilarity: 0, searchMinSimilarity: -1, relatedMaxPerSeries: 0 })
    expect(low).toEqual({ relatedMinSimilarity: 0.1, searchMinSimilarity: 0.05, relatedMaxPerSeries: 1 })
  })

  it('ignores a value that is not a number', () => {
    expect(resolveTuning({ relatedMinSimilarity: 'abc', searchMinSimilarity: NaN, relatedMaxPerSeries: null })).toEqual(DEFAULT_TUNING)
    expect(resolveTuning({ relatedMinSimilarity: '', searchMinSimilarity: undefined })).toEqual(DEFAULT_TUNING)
  })

  it('reads a numeric string a database may return', () => {
    expect(resolveTuning({ relatedMinSimilarity: '0.42' }).relatedMinSimilarity).toBe(0.42)
  })

  it('keeps the per-series cap a whole number', () => {
    expect(resolveTuning({ relatedMaxPerSeries: 2.6 }).relatedMaxPerSeries).toBe(3)
  })
})
