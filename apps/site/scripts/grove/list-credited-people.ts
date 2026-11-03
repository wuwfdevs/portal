// Lists every person the migrated stories credit, and whether Grove's own author page for them is among the downloaded pages.
// Read-only: nothing is fetched and nothing is written. The raw pages stay outside the repository.
//
//   pnpm exec tsx scripts/grove/list-credited-people.ts --raw ~/grove/raw
//
// Prints one line per person (stories credited, the /people/ address, "page" or "NO PAGE" for Grove's author page, and what the
// byline itself carried: bio, photo, title), then totals. Use it to size a fetch of the missing author pages.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { convertAuthorPage, convertStory } from '../../src/lib/grove'

const args = process.argv.slice(2)
const rawDirs = args.flatMap((a, i) => (a === '--raw' ? [args[i + 1] ?? ''] : []))
if (!rawDirs.length) throw new Error('Pass --raw <dir> (the raw census pages).')

const files: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
rawDirs.forEach(walk)
files.sort()

type Seen = { name: string; slug: string | null; stories: number; bio: boolean; photo: boolean; title: boolean }
const people = new Map<string, Seen>()
const pageSlugs = new Set<string>()
let stories = 0
for (const f of files) {
  const page: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const s = convertStory(page, { embedHosts: [] })
  if (s.status === 'converted') {
    stories += 1
    for (const p of s.story.byline.people) {
      const key = p.slug ?? `name:${p.name.toLowerCase()}`
      const seen = people.get(key) ?? { name: p.name, slug: p.slug ?? null, stories: 0, bio: false, photo: false, title: false }
      seen.stories += 1
      seen.bio ||= Boolean(p.bio)
      seen.photo ||= Boolean(p.photo)
      seen.title ||= Boolean(p.title)
      people.set(key, seen)
    }
    continue
  }
  const a = convertAuthorPage(page)
  if (a.status === 'converted') pageSlugs.add(a.author.slug)
}

const rows = [...people.values()].sort((x, y) => y.stories - x.stories || x.name.localeCompare(y.name))
for (const r of rows) {
  const where = r.slug ? `/people/${r.slug}` : '(no Grove address)'
  const page = r.slug ? (pageSlugs.has(r.slug) ? 'page' : 'NO PAGE') : '-'
  console.log(`${String(r.stories).padStart(4)}  ${r.name.padEnd(36)} ${where.padEnd(44)} ${page.padEnd(8)} bio:${r.bio ? 'y' : 'n'} photo:${r.photo ? 'y' : 'n'} title:${r.title ? 'y' : 'n'}`)
}
const withAddress = rows.filter((r) => r.slug)
console.log(`\n${stories} stories credit ${rows.length} people: ${withAddress.length} with a Grove /people/ address (${withAddress.filter((r) => pageSlugs.has(r.slug!)).length} have their author page downloaded, ${withAddress.filter((r) => !pageSlugs.has(r.slug!)).length} do not), ${rows.length - withAddress.length} with no address.`)
console.log(`${pageSlugs.size} author pages are in the downloaded data.`)
