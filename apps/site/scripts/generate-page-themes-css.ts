// Writes src/app/(frontend)/page-themes.css: one rule per tone for every built page theme (src/lib/page-themes/themes.ts). Static CSS
// from code, so a section's tone needs no inline style and no colour is stored in the CMS. Run with `pnpm generate:themes`.
// src/lib/page-themes/css.test.ts fails if the committed file is out of date.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PAGE_THEMES, pageThemeCss } from '../src/lib/page-themes/themes'

export const PAGE_THEMES_CSS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/app/(frontend)/page-themes.css',
)

export function pageThemesCssFile(): string {
  const css = Object.values(PAGE_THEMES)
    .filter((t) => t.built)
    .map((t) => pageThemeCss(t))
    .join('\n\n')
  return `/* Generated from src/lib/page-themes/themes.ts by scripts/generate-page-themes-css.ts. Do not edit; run \`pnpm generate:themes\`. */\n${css}\n`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(PAGE_THEMES_CSS_PATH, pageThemesCssFile())
  console.log(`Wrote ${PAGE_THEMES_CSS_PATH}`)
}
