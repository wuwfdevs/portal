import { describe, expect, it } from 'vitest'

import { PRIVACY_PAGE_PARAGRAPHS } from './notice'

describe('embedding privacy wording', () => {
  it('names the provider and says what is and is not sent', () => {
    const page = PRIVACY_PAGE_PARAGRAPHS.join(' ')
    expect(page).toContain('OpenAI')
    expect(page).toMatch(/NPR/)
    expect(page).toMatch(/members only/)
  })

  it('has no placeholder or review bracket', () => {
    for (const text of PRIVACY_PAGE_PARAGRAPHS) expect(text).not.toMatch(/[\[\]]/)
  })
})
