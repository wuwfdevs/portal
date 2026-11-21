import { describe, expect, it } from 'vitest'

import { pageIsUntouched } from './untouched'

const a = [{ id: 'x', blockType: 'sectionFeature' }]
const b = [{ id: 'x', blockType: 'sectionFeature', headline: 'Changed' }]
const v = (sections: unknown, autosave = false) => ({ autosave, sections })

describe('pageIsUntouched', () => {
  it('is untouched with the three versions the migrations make', () => {
    expect(pageIsUntouched([v(a), v(a), v(a)], a)).toBe(true)
  })
  it('is untouched when someone only opened it: an autosave draft holding the published sections does not count', () => {
    expect(pageIsUntouched([v(a), v(a), v(a), v(a, true)], a)).toBe(true)
  })
  it('is edited when an autosave draft differs from the published sections (someone is editing it)', () => {
    expect(pageIsUntouched([v(a), v(a), v(a), v(b, true)], a)).toBe(false)
  })
  it('is edited when a fourth real version was saved', () => {
    expect(pageIsUntouched([v(a), v(a), v(a), v(b)], b)).toBe(false)
  })
  it('compares sections by their content, not their key order', () => {
    expect(pageIsUntouched([v(a, true)], JSON.parse(JSON.stringify(a)))).toBe(true)
  })
  it('ignores row ids, which the Local API makes up again on every read of a row that has none stored', () => {
    const withIds = (id: string) => [{ id: 'blk', blockType: 'sectionFeature', actions: [{ id, label: 'Go' }] }]
    expect(pageIsUntouched([v(withIds('aaa'), true)], withIds('bbb'))).toBe(true)
    expect(pageIsUntouched([v([{ id: 'blk', actions: [{ id: 'aaa', label: 'Changed' }] }], true)], withIds('bbb'))).toBe(false)
  })
  it('treats missing sections as equal to missing sections', () => {
    expect(pageIsUntouched([v(undefined, true)], undefined)).toBe(true)
  })
})
