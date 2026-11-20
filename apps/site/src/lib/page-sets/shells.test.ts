import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { CODED_SHELL_PATHS } from './shells'

const root = path.resolve(__dirname, '../../app/(frontend)')
const shells: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name === 'page.tsx' && /<SectionsRoute\b/.test(readFileSync(p, 'utf8'))) {
      shells.push('/' + path.relative(root, dir).split(path.sep).join('/'))
    }
  }
}
walk(root)

describe('coded shells that render a page record', () => {
  it('finds the shells (so the check cannot pass by looking at nothing)', () => {
    expect(shells.length).toBeGreaterThanOrEqual(4)
  })
  it('are all kept out of the catch-all’s static pages, which would be served instead of them', () => {
    for (const shell of shells) expect(CODED_SHELL_PATHS.has(shell), `${shell} renders a page record: add it to CODED_SHELL_PATHS`).toBe(true)
  })
  it('lists only addresses a shell serves', () => {
    for (const p of CODED_SHELL_PATHS) expect(shells, p).toContain(p)
  })
})
