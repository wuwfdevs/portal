import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { TOKENS_CSS_PATH, tokensCssFile } from '../../scripts/generate-tokens-css'

describe('tokens.css', () => {
  it('is exactly what @wuwf/design-tokens generates, so the stylesheet cannot drift from the tokens', () => {
    expect(readFileSync(TOKENS_CSS_PATH, 'utf8')).toBe(tokensCssFile())
  })
})
