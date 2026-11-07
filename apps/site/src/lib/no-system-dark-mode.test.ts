import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// There is no dark theme. Tailwind's `dark:` variant follows the reader's system setting unless redefined, and the
// starter's `dark:prose-invert` turned story text pale and links white on the white page for phones in dark mode
// (2026-11-07). This fails if the variant is un-tied from its class, or an inverted prose style comes back.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('no system dark mode', () => {
  it('ties the dark variant to a class, and keeps the page light', () => {
    const css = readFileSync('src/app/(frontend)/globals.css', 'utf8')
    expect(css).toMatch(/@custom-variant dark \(&:where\(\.theme-dark, \.theme-dark \*\)\);/)
    expect(css).toMatch(/color-scheme: light;/)
  })

  it('never inverts story text', () => {
    const offenders = files('src').filter((f) => !f.includes('(payload)') && /prose-invert/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
    expect(offenders).toEqual([])
  })
})
