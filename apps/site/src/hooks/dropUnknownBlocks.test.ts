import { describe, expect, it } from 'vitest'

import { keepOnlyBlockTypes } from './dropUnknownBlocks'

const run = (allowed: string[], value: unknown) => (keepOnlyBlockTypes(allowed) as unknown as (a: { value: unknown }) => unknown)({ value })

describe('keepOnlyBlockTypes', () => {
  it('removes rows of a type the field does not offer, keeping order', () => {
    const rows = [{ blockType: 'mediaBlock', id: 1 }, { blockType: 'pullQuote' }, { blockType: 'gallery', id: 2 }]
    expect(run(['mediaBlock', 'gallery'], rows)).toEqual([{ blockType: 'mediaBlock', id: 1 }, { blockType: 'gallery', id: 2 }])
  })
  it('removes rows with no type and values that are not rows', () => {
    expect(run(['a'], [{ x: 1 }, null, 'text', 3, { blockType: 'a' }])).toEqual([{ blockType: 'a' }])
  })
  it('leaves a value that is not a list alone (nothing to filter)', () => {
    expect(run(['a'], undefined)).toBeUndefined()
    expect(run(['a'], null)).toBeNull()
  })
})
