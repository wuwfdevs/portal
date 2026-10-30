// Writes src/app/(frontend)/tokens.css from @wuwf/design-tokens, so Tailwind's colour, radius and shadow utilities
// come from the one token source. Run with `pnpm generate:tokens`. src/lib/tokens-css.test.ts fails if the
// committed file is out of date, so a token change cannot ship without regenerating it.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { tailwindThemeCss } from '@wuwf/design-tokens'

export const TOKENS_CSS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/app/(frontend)/tokens.css',
)

export function tokensCssFile(): string {
  return `/* Generated from @wuwf/design-tokens by scripts/generate-tokens-css.ts. Do not edit; run \`pnpm generate:tokens\`. */\n${tailwindThemeCss()}\n`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(TOKENS_CSS_PATH, tokensCssFile())
  console.log(`Wrote ${TOKENS_CSS_PATH}`)
}
