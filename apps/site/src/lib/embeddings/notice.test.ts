import { describe, expect, it } from 'vitest'

import { PRIVACY_PAGE_PARAGRAPHS, SEARCH_NOTICE } from './notice'

describe('embedding privacy wording', () => {
  it('names the provider and says what is and is not sent', () => {
    expect(SEARCH_NOTICE).toContain('OpenAI')
    expect(SEARCH_NOTICE).toMatch(/do not keep them/)
    const page = PRIVACY_PAGE_PARAGRAPHS.join(' ')
    expect(page).toContain('OpenAI')
    expect(page).toMatch(/NPR/)
    expect(page).toMatch(/members only/)
  })

  it('has no placeholder or review bracket', () => {
    for (const text of [SEARCH_NOTICE, ...PRIVACY_PAGE_PARAGRAPHS]) expect(text).not.toMatch(/[\[\]]/)
  })

  it('stays short enough to sit under the search box', () => {
    expect(SEARCH_NOTICE.length).toBeLessThan(300)
  })
})
