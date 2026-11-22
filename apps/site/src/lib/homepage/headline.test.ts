import { describe, expect, it } from 'vitest'

import { LONG_HEADLINE, leadHeadlineClass } from './headline'

describe('leadHeadlineClass', () => {
  it('sets a short headline at the full size on a wide screen', () => {
    expect(leadHeadlineClass('Tropical storm nears the coast')).toContain('xl:text-5xl')
  })
  it('steps a long headline down one size on a wide screen, and leaves the smaller screens alone', () => {
    const long = leadHeadlineClass('LISTEN: Carl Wernicke Reflects on JFK\'S Assassination, "They cheered and applauded."')
    expect(long).not.toContain('xl:text-5xl')
    expect(long).toBe('text-3xl md:text-4xl')
  })
  it('draws the line at the limit: at it is short, one past it is long, and spaces around it do not count', () => {
    expect(leadHeadlineClass('x'.repeat(LONG_HEADLINE))).toContain('xl:text-5xl')
    expect(leadHeadlineClass('x'.repeat(LONG_HEADLINE + 1))).not.toContain('xl:text-5xl')
    expect(leadHeadlineClass(`  ${'x'.repeat(LONG_HEADLINE)}  `)).toContain('xl:text-5xl')
  })
})
