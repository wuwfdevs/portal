import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { PAGE_THEMES_CSS_PATH, pageThemesCssFile } from '../../../scripts/generate-page-themes-css'

describe('page-themes.css', () => {
  it('is exactly what the page themes generate, so the stylesheet cannot drift from them', () => {
    expect(readFileSync(PAGE_THEMES_CSS_PATH, 'utf8')).toBe(pageThemesCssFile())
  })
})
