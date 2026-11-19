import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { PickerSection, linesOf, priceOf } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(PickerSection, 'sectionPicker', block)
const options = [
  { label: 'I\'m new', hint: 'Start small', title: 'Start with a few weeks', lead: 'A short run.', points: 'One\n\n Two \nThree', price: 'From $23 a credit', linkLabel: 'See rates', linkHref: '/sponsor/on-air' },
  { label: 'Promote an event', title: 'Event sponsorship', lead: 'Reach people before the date.' },
  { label: '', title: 'No name', lead: 'dropped' },
  { label: 'No title', title: ' ', lead: 'dropped too' },
]

describe('priceOf and linesOf', () => {
  it('reads the typed price (the seam for a settings reference)', () => {
    expect(priceOf({ price: ' From $23 ' })).toBe('From $23')
    expect(priceOf({ price: ' ' })).toBeNull()
    expect(priceOf({})).toBeNull()
  })
  it('splits a textarea into its non-empty lines', () => {
    expect(linesOf('One\n\n Two \r\nThree\n')).toEqual(['One', 'Two', 'Three'])
    expect(linesOf(undefined)).toEqual([])
  })
})

describe('Picker section', () => {
  it('draws nothing with fewer than two usable options', () => {
    expect(html({})).toBe('')
    expect(html({ options: [options[0]] })).toBe('')
    expect(html({ options: [options[0], options[2], options[3]] })).toBe('')
  })
  it('draws a radio button and a panel for each usable option, the first checked, in a group that works without script', () => {
    const out = html({ id: 'abc', options })
    expect(out.match(/type="radio"/g)?.length).toBe(2)
    expect(out.match(/checked=""/g)?.length).toBe(1)
    expect(out.match(/data-panel=/g)?.length).toBe(2)
    expect(out).toContain('name="picker-abc"')
    expect(out).toContain('for="picker-abc-1"')
    expect(out).toContain('peer-checked/p1:flex')
    expect(out).toContain('Start with a few weeks')
    expect(out).toContain('From $23 a credit')
    expect(out).toContain('<li>Two</li>')
    expect(out).toContain('href="/sponsor/on-air"')
    expect(out).not.toContain('dropped')
  })
  it('keeps two pickers on one page apart', () => {
    const a = html({ id: 'a', options })
    const b = html({ id: 'b', options })
    expect(a).toContain('name="picker-a"')
    expect(b).toContain('name="picker-b"')
  })
  it('takes no more than eight options', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `L${i}`, title: `T${i}` }))
    expect(html({ options: many }).match(/type="radio"/g)?.length).toBe(8)
  })
  it('draws no link for an unsafe address', () => {
    const out = html({ options: [{ label: 'A', title: 'A', linkLabel: 'Go', linkHref: 'javascript:x' }, { label: 'B', title: 'B' }] })
    expect(out).not.toContain('href=')
  })
})
