import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PAGE_SET_IDS } from '@/lib/page-sets/registry'

import { SECTION_BLOCKS, blocksOfferedFor, sectionBlockDefinitions, sectionEntry } from './registry'
import { SECTION_GROUPS, type SectionBlockEntry } from './types'

const root = path.resolve(__dirname)
const publicDir = path.resolve(__dirname, '../../../public')

describe('section block registry: every block is complete', () => {
  it('has at least one block, with unique slugs and directories', () => {
    expect(SECTION_BLOCKS.length).toBeGreaterThan(0)
    expect(new Set(SECTION_BLOCKS.map((e) => e.block.slug)).size).toBe(SECTION_BLOCKS.length)
    expect(new Set(SECTION_BLOCKS.map((e) => e.dir)).size).toBe(SECTION_BLOCKS.length)
  })
  for (const entry of SECTION_BLOCKS) {
    const { block, dir } = entry
    describe(block.slug, () => {
      it('has a component, a config and a test in its directory', () => {
        expect(typeof entry.Component).toBe('function')
        expect(existsSync(path.join(root, dir, 'config.ts'))).toBe(true)
        expect(existsSync(path.join(root, dir, 'Component.tsx'))).toBe(true)
        const tests = readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.test.ts'))
        expect(tests.length).toBeGreaterThan(0)
      })
      it('has a picker group from the list and a 3:2 thumbnail that exists', () => {
        expect(SECTION_GROUPS as readonly string[]).toContain(block.admin?.group)
        const thumb = block.admin?.images?.thumbnail
        const url = typeof thumb === 'string' ? thumb : thumb?.url
        expect(url, 'a thumbnail url').toBe(`/section-thumbnails/${block.slug}.svg`)
        const file = path.join(publicDir, url!)
        expect(existsSync(file), `${url} exists under public/`).toBe(true)
        const svg = readFileSync(file, 'utf8')
        expect(svg).toContain('<svg')
        expect(svg).toContain('viewBox="0 0 300 200"')
        expect(statSync(file).size).toBeLessThan(20_000)
      })
      it('starts with the shared fields, in order, and has labels and an interface name', () => {
        const names = block.fields.map((f) => ('name' in f ? f.name : undefined))
        expect(names.slice(0, 4)).toEqual(['hidden', 'anchor', 'navLabel', 'tone'])
        if (names.includes('variant')) expect(names[4]).toBe('variant')
        expect(block.slug.startsWith('section')).toBe(true)
        expect(block.interfaceName).toBeTruthy()
        expect(block.labels?.singular).toBeTruthy()
      })
      it('names only page sets that exist', () => {
        for (const s of entry.sets ?? []) expect(PAGE_SET_IDS).toContain(s)
      })
    })
  }
  it('registers every directory that holds a section config, and only those', () => {
    const dirs = readdirSync(root).filter((d) => statSync(path.join(root, d)).isDirectory())
    const withConfig = dirs.filter((d) => existsSync(path.join(root, d, 'config.ts')))
    expect(SECTION_BLOCKS.map((e) => e.dir).sort()).toEqual(withConfig.sort())
  })
  it('puts the same definitions in the root config', () => {
    expect(sectionBlockDefinitions.map((b) => b.slug)).toEqual(SECTION_BLOCKS.map((e) => e.block.slug))
  })
})

describe('which blocks a page set is offered', () => {
  const entry = (slug: string, sets?: SectionBlockEntry['sets']): SectionBlockEntry => ({ dir: slug, block: { slug, fields: [] }, Component: () => null, sets })
  const fake = [entry('sectionA'), entry('sectionB', ['sponsor']), entry('sectionC', ['giving', 'sponsor'])]
  it('offers a page in no set only the library', () => {
    expect(blocksOfferedFor(null, fake)).toEqual(['sectionA'])
    expect(blocksOfferedFor(undefined, fake)).toEqual(['sectionA'])
    expect(blocksOfferedFor('nonsense', fake)).toEqual(['sectionA'])
  })
  it('adds the blocks that name the set', () => {
    expect(blocksOfferedFor('sponsor', fake)).toEqual(['sectionA', 'sectionB', 'sectionC'])
    expect(blocksOfferedFor('giving', fake)).toEqual(['sectionA', 'sectionC'])
    expect(blocksOfferedFor('listens', fake)).toEqual(['sectionA'])
  })
  it('finds an entry by slug', () => {
    expect(sectionEntry('sectionCards')?.dir).toBe('Cards')
    expect(sectionEntry('nope')).toBeUndefined()
    expect(sectionEntry(undefined)).toBeUndefined()
  })
})
