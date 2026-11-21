import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// The restricted blocks (preserved HTML, script widget) live in the shared story-body editor. Payload does not enforce a
// block's own access rule inside rich text, so every collection that uses that editor must carry the guard hook. This fails
// the moment someone adds a field with `bodyEditor` to a collection and forgets it.

const root = path.resolve(__dirname, '../collections')
const files: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts')) files.push(p)
  }
}
walk(root)

describe('every collection with a story-body rich-text field has the restricted-block guard', () => {
  const users = files.filter((f) => /\bbodyEditor\b/.test(fs.readFileSync(f, 'utf8')) && /editor:\s*bodyEditor/.test(fs.readFileSync(f, 'utf8')))
  it('finds the collections that use it (so this test cannot pass by looking at nothing)', () => {
    expect(users.length).toBeGreaterThanOrEqual(5)
  })
  for (const f of users) {
    it(path.relative(root, f), () => {
      expect(fs.readFileSync(f, 'utf8')).toMatch(/restrictedBlocksGuard\(\[/)
    })
  }
})

// A rich-text field inside a section block (the Text block's body) is nested in the page's `sections` field, so the page's guard must
// name `sections`. This fails the moment a section block takes `bodyEditor` and the pages collection does not guard that field.
describe('section blocks with rich text are guarded through the pages collection', () => {
  const sectionsRoot = path.resolve(__dirname, '../blocks/sections')
  const configs = fs
    .readdirSync(sectionsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(sectionsRoot, e.name, 'config.ts'))
    .filter((f) => fs.existsSync(f))
  const withEditor = configs.filter((f) => /editor:\s*bodyEditor/.test(fs.readFileSync(f, 'utf8')))
  it('finds the Text block (so this test cannot pass by looking at nothing)', () => {
    expect(withEditor.map((f) => path.basename(path.dirname(f)))).toContain('Text')
  })
  it('the pages collection guards `sections` when any section block uses the story editor', () => {
    const pages = fs.readFileSync(path.resolve(__dirname, '../collections/Pages/index.ts'), 'utf8')
    const guard = /restrictedBlocksGuard\(\[([^\]]*)\]\)/.exec(pages)?.[1] ?? ''
    expect(guard).toMatch(/'sections'/)
  })
  it('no section block uses the story editor without the guard being able to see it (rich text only through `bodyEditor`)', () => {
    for (const f of configs) {
      const src = fs.readFileSync(f, 'utf8')
      if (/type:\s*'richText'/.test(src)) expect(src, f).toMatch(/editor:\s*bodyEditor/)
    }
  })
})
