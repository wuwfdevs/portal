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
