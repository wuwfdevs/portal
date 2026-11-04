// Checks that every converted story still holds what its Grove page held: its words (paragraph by paragraph), its pictures and audio, and its
// path, Grove id, title and date. It reads each page with its own small extraction, NOT the converter's, so a converter that reads the wrong
// field or drops a paragraph is caught by something that does not share its mistake. Nothing is fetched and nothing is written to a database.
//
//   pnpm exec tsx scripts/grove/check-fidelity.ts --raw <dir> [--raw <dir>...] [--out <report.json>] [--show <n>]
//
//   --raw   folders of `*.json.gz` Grove pages (the unzipped census archives), as `convert-corpus.ts` takes
//   --out   write every story that did not pass (and the totals) as JSON, outside the repository
//   --show  how many failing stories to print per problem code (default 5)
//
// Exit code 1 when any story fails. A "warn" (a link the story does not carry, for example) does not fail the run.
// See `src/lib/grove/fidelity.ts` for what counts as a loss and why.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { compareFidelity, sourceFactsOf, type FidelityResult } from '../../src/lib/grove/fidelity'
import { convertStory } from '../../src/lib/grove'

const args = process.argv.slice(2)
const flag = (name: string): string[] => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1] ?? ''] : []))
const rawDirs = flag('raw')
const out = flag('out')[0]
const show = Number(flag('show')[0] ?? 5)
if (!rawDirs.length) throw new Error('Pass --raw <dir> (the unzipped census pages).')

const files: string[] = []
const collect = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
for (const d of rawDirs) collect(d)
files.sort()

const results: FidelityResult[] = []
const seen = new Set<string>()
let skipped = 0
for (const f of files) {
  const page: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const r = convertStory(page, { embedHosts: [] })
  if (r.status !== 'converted') {
    skipped++
    continue
  }
  if (seen.has(r.story.path)) continue
  seen.add(r.story.path)
  results.push(compareFidelity(sourceFactsOf(page), r.story))
}

const count = (lvl: string) => results.filter((r) => r.level === lvl).length
const byCode = new Map<string, FidelityResult[]>()
for (const r of results) for (const p of r.problems) byCode.set(`${p.level} ${p.code}`, [...(byCode.get(`${p.level} ${p.code}`) ?? []), r])

console.log(`${files.length} pages read, ${skipped} not stories (skipped), ${results.length} stories checked: ${count('pass')} pass, ${count('warn')} warn, ${count('fail')} FAIL`)
for (const [code, rows] of [...byCode].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`\n${code}: ${rows.length} stories`)
  for (const r of rows.slice(0, show)) console.log(`  ${r.path}  ${r.problems.filter((p) => `${p.level} ${p.code}` === code).map((p) => p.detail).join(' | ').slice(0, 160)}`)
}
if (out) {
  fs.writeFileSync(out, JSON.stringify({ checked: results.length, pass: count('pass'), warn: count('warn'), fail: count('fail'), notPassing: results.filter((r) => r.level !== 'pass') }, null, 1))
  console.log(`\nreport written to ${out}`)
}
process.exit(count('fail') ? 1 : 0)
