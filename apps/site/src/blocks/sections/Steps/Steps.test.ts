import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { StepsSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(StepsSection, 'sectionSteps', block)
const steps = [{ title: 'Think it over', text: 'Take your time.' }, { title: 'Tell us' }, { title: '  ', text: 'no title' }, null]

describe('Steps section', () => {
  it('draws nothing without a step that has a title', () => {
    expect(html({})).toBe('')
    expect(html({ steps: [{ text: 'no title' }, { title: ' ' }, null] })).toBe('')
  })
  it('grid and list are both ordered lists, numbered by position, skipping an empty step', () => {
    for (const variant of ['grid', 'list']) {
      const out = html({ variant, steps })
      expect(out).toContain('<ol')
      expect(out.match(/<li/g)?.length).toBe(2)
      expect(out).toContain('>1<')
      expect(out).toContain('>2<')
      expect(out).not.toContain('>3<')
      expect(out).toContain('Take your time.')
    }
  })
  it('the two layouts differ', () => {
    expect(html({ variant: 'grid', steps })).toContain('text-5xl')
    expect(html({ variant: 'list', steps })).not.toContain('text-5xl')
  })
})
