import { describe, expect, it } from 'vitest'

import { leadCardClasses, leadSpanClass } from './modules'

describe('leadSpanClass', () => {
  // The grid is two columns on a tablet and three on a wide screen; the first card spans so no row is left short.
  const fills = (count: number) => {
    const cls = leadSpanClass(count)
    const tabletLead = cls.includes('sm:col-span-2') ? 2 : 1
    const wideLead = cls.includes('lg:col-span-3') ? 3 : cls.includes('lg:col-span-2') ? 2 : 1
    return { tablet: (count - 1 + tabletLead) % 2 === 0, wide: (count - 1 + wideLead) % 3 === 0 }
  }
  it('leaves no short last row at either width for every count a section can hold', () => {
    for (let n = 3; n <= 8; n++) expect(fills(n), `${n} stories`).toEqual({ tablet: true, wide: true })
  })
  it('spans two columns for five and eight stories on a wide screen, all three for four and seven, and none for three and six', () => {
    expect(leadSpanClass(5)).toBe('sm:col-span-2 lg:col-span-2')
    expect(leadSpanClass(8)).toBe('lg:col-span-2')
    expect(leadSpanClass(4)).toBe('lg:col-span-3')
    expect(leadSpanClass(7)).toBe('sm:col-span-2 lg:col-span-3')
    expect(leadSpanClass(6)).toBe('')
    expect(leadSpanClass(3)).toBe('sm:col-span-2 lg:col-span-1')
  })
})

describe('leadCardClasses', () => {
  it('lays a lead that spans columns out as a row, at the widths where it spans', () => {
    expect(leadCardClasses(5).card).toBe('sm:flex-row lg:flex-row')
    expect(leadCardClasses(7).card).toBe('sm:flex-row lg:flex-row')
    expect(leadCardClasses(4).card).toBe('lg:flex-row')
    expect(leadCardClasses(8).card).toBe('lg:flex-row')
  })
  it('leaves a lead that does not span as the ordinary column', () => {
    expect(leadCardClasses(6)).toEqual({ card: '', frame: '', body: '', title: '' })
  })
  it('puts a lead that spans a tablet\'s row but not a wide screen\'s back to a column there', () => {
    const c = leadCardClasses(3)
    expect(c.card).toBe('sm:flex-row lg:flex-col')
    expect(c.frame).toContain('lg:aspect-[3/2]')
  })
  it('is a row exactly when the lead spans, at both widths, for every count a section can hold', () => {
    for (let n = 3; n <= 8; n++) {
      const span = leadSpanClass(n)
      const card = leadCardClasses(n).card
      expect(card.includes('sm:flex-row'), `${n} tablet`).toBe(span.includes('sm:col-span-2'))
      expect(card.includes('lg:flex-row'), `${n} wide`).toBe(/lg:col-span-[23]/.test(span))
    }
  })
  it('gives the picture the left half, at least a 3:2 of its own width, and the words a larger headline', () => {
    const c = leadCardClasses(5)
    expect(c.frame).toContain('lg:w-1/2')
    expect(c.frame).toContain('lg:before:pt-[66.7%]')
    expect(c.title).toContain('lg:text-2xl')
  })
})

