import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The rules every section block must keep (CLAUDE.md → Pages and sections), checked over the source so a block added later is covered.

const root = path.resolve(__dirname)
const sources: string[] = []
const walk = (d: string) => {
  for (const name of readdirSync(d)) {
    const p = path.join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'testing.ts') sources.push(p)
  }
}
walk(root)
const text = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const rel = (f: string) => path.relative(root, f)

describe('section blocks: rules over the source', () => {
  it('finds the sources (so the checks cannot pass by looking at nothing)', () => {
    expect(sources.length).toBeGreaterThan(10)
  })
  it('never read request data on the server', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toMatch(/\b(headers|cookies|connection|draftMode)\s*\(|\bsearchParams\b|next\/headers/)
  })
  it('never read a settings global directly (the save reaches pages only through the cache tag)', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toMatch(/\.findGlobal\s*\(/)
  })
  it('never import the story renderer statically (the registry is loaded by the Payload config, which cannot load it)', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toMatch(/^import[^;\n]*from\s+'@\/components\/RichText'/m)
  })
  it('never import the global helper statically (it loads the Payload config, which loads this registry)', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toMatch(/^import[^;\n]*from\s+'@\/utilities\/getGlobals'/m)
  })
  it('never import a data loader statically (loaders load the Payload config, which loads this registry)', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toMatch(/^import[^;\n]*from\s+'(@payload-config|@\/lib\/section-data\/load|@\/lib\/events\/load|@\/lib\/underwriting\/load)'/m)
  })
  it('never set HTML from a string', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toContain('dangerouslySetInnerHTML')
  })
  it('never build a link from a value without safeHref (no raw href={block...})', () => {
    for (const f of sources) expect(text(f), rel(f)).not.toMatch(/href=\{(block|card|item|row)\./)
  })
  it('have no free colour, spacing or HTML field in a config', () => {
    for (const f of sources.filter((s) => s.endsWith('config.ts'))) {
      expect(text(f), rel(f)).not.toMatch(/name:\s*'(color|colour|background|padding|margin|html|css|style|className)'/i)
    }
  })
})
