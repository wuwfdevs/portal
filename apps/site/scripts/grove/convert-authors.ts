// Runs the author converter over a folder of raw census pages and prints what it did. Nothing is written and nothing is
// fetched; the raw pages stay outside the repository.
//
//   pnpm exec tsx scripts/grove/convert-authors.ts --raw <dir> [--raw <dir>...] [--json]
//
// `--raw` takes a folder of `*.json.gz` files, `*.json` files, or a folder of such folders.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { convertAuthorPage } from '../../src/lib/grove'

const args = process.argv.slice(2)
const rawDirs = args.flatMap((a, i) => (a === '--raw' ? [args[i + 1] ?? ''] : []))
if (!rawDirs.length) throw new Error('Pass --raw <dir> (the unzipped census pages).')

const files: string[] = []
const collect = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p)
    else if (e.name.endsWith('.json.gz') || e.name.endsWith('.json')) files.push(p)
  }
}
for (const d of rawDirs) collect(d)
files.sort()

const tally: Record<string, number> = {}
const codes: Record<string, number> = {}
let authors = 0
for (const f of files) {
  const text = f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)).toString('utf8') : fs.readFileSync(f, 'utf8')
  const page: unknown = JSON.parse(text)
  const r = convertAuthorPage(page)
  if (r.status === 'skipped') continue
  authors += 1
  tally[r.report.status] = (tally[r.report.status] ?? 0) + 1
  for (const e of r.report.entries) codes[e.code] = (codes[e.code] ?? 0) + 1
  if (JSON.stringify(convertAuthorPage(page)) !== JSON.stringify(r)) throw new Error(`Not deterministic: ${r.author.legacy.legacyPath}`)
  console.log(`${r.author.path}  ${r.report.status}  bio:${r.author.biography?.root.children.length ?? 0}  portrait:${r.author.portrait ? 'yes' : 'no'}  links:${r.author.links.length}`)
}
console.log(`\n${authors} author pages of ${files.length}. Status: ${JSON.stringify(tally)}\nCodes: ${JSON.stringify(codes)}`)
