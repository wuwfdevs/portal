// Runs the event converter over a folder of raw census pages and prints what it did. Nothing is written and nothing is
// fetched; the raw pages stay outside the repository.
//
//   pnpm exec tsx scripts/grove/convert-events.ts --raw <dir> [--raw <dir>...] [--show]
//
// `--raw` takes a folder of `*.json.gz` files or a folder of such folders. `--show` prints each event's schedule and flags.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { convertEventPage } from '../../src/lib/grove'
import { describeSchedule } from '../../src/lib/events/schedule'
import { scheduleFromStored } from '../../src/lib/events/stored'

const args = process.argv.slice(2)
const rawDirs = args.flatMap((a, i) => (a === '--raw' ? [args[i + 1] ?? ''] : []))
const show = args.includes('--show')
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

const tally: Record<string, number> = {}
const codes: Record<string, number> = {}
let events = 0
let json = ''
for (const f of files) {
  const page: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const r = convertEventPage(page)
  if (r.status === 'skipped') continue
  events += 1
  tally[r.report.status] = (tally[r.report.status] ?? 0) + 1
  for (const e of r.report.entries) codes[e.code] = (codes[e.code] ?? 0) + 1
  const again = JSON.stringify(convertEventPage(page))
  json += again
  if (again !== JSON.stringify(r)) throw new Error(`Not deterministic: ${r.event.legacy.legacyPath}`)
  if (show) {
    const s = scheduleFromStored(r.event.schedule)
    console.log(`\n${r.event.legacy.legacyPath}\n  ${r.event.title}\n  when: ${describeSchedule(s) ?? '(not read)'} | ${r.event.schedule.displayText}\n  venue: ${[r.event.venue.name, r.event.venue.city, r.event.venue.state].filter(Boolean).join(', ') || '(none)'}\n  categories: ${r.event.categories.map((c) => c.title).join(', ') || '(none)'}  price: ${r.event.price ?? (r.event.free ? 'free' : '-')}\n  flags: ${r.report.entries.map((e) => `${e.level}:${e.code}`).join(', ') || 'none'}`)
  }
}
console.log(`\n${events} events of ${files.length} pages. Status: ${JSON.stringify(tally)}\nCodes: ${JSON.stringify(codes)}\nDeterministic: yes (${json.length} bytes compared)`)
