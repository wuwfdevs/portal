// Runs the standard-page converter over the saved census pages and prints what it did. Nothing is fetched or saved.
//
//   pnpm exec tsx scripts/grove/convert-pages.ts <dir of census pages (*.json.gz, searched recursively)>

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { convertContentPage } from '../../src/lib/grove'

const dir = process.argv[2]
if (!dir) throw new Error('Pass the folder that holds the census pages.')
const files: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
walk(dir)

const codes: Record<string, number> = {}
const status: Record<string, number> = {}
const blocks: Record<string, number> = {}
let n = 0
for (const f of files.sort()) {
  const r = convertContentPage(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')))
  if (r.status !== 'converted') continue
  n++
  status[r.report.status] = (status[r.report.status] ?? 0) + 1
  for (const e of r.report.entries) codes[`${e.level} ${e.code}${e.detail ? ` (${e.detail.slice(0, 30)})` : ''}`] = (codes[`${e.level} ${e.code}${e.detail ? ` (${e.detail.slice(0, 30)})` : ''}`] ?? 0) + 1
  for (const [k, v] of Object.entries(r.report.mapped)) blocks[k] = (blocks[k] ?? 0) + v
  if (r.report.status !== 'clean') console.log(r.report.status, r.page.path, r.report.entries.map((e) => e.code).join(','))
}
console.log(JSON.stringify({ pages: n, status, mapped: blocks, codes }, null, 1))
