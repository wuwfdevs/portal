// Runs the Grove converter over a folder of raw census pages and prints what it did. Nothing is written to the
// database and nothing is fetched. The raw pages stay outside the repository; only the summary is saved.
//
//   pnpm exec tsx scripts/grove/convert-corpus.ts --raw <dir> [--raw <dir>...] --manifest census/manifest.jsonl \
//        [--hosts npr.org,embed.documentcloud.org] [--link-map census/url-inventory/link-map.json] [--out census/convert-summary.json]
//
// `--raw` takes a folder that holds the `*.json.gz` files, or a folder of such folders (the unzipped census archives).

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { convertStory, summarize, lexicalProblems } from '../../src/lib/grove'
import type { ConvertResult, StoryReport } from '../../src/lib/grove'

const args = process.argv.slice(2)
const flag = (name: string): string[] => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1] ?? ''] : []))
const rawDirs = flag('raw')
const manifestPath = flag('manifest')[0]
const out = flag('out')[0]
const hosts = (flag('hosts')[0] ?? '').split(',').map((h) => h.trim()).filter(Boolean)
const linkMapFile = flag('link-map')[0]
const linkMap: Record<string, string | null> | undefined = linkMapFile ? (JSON.parse(fs.readFileSync(linkMapFile, 'utf8')) as { map: Record<string, string | null> }).map : undefined
const options = { embedHosts: hosts, ...(linkMap ? { linkMap } : {}) }
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

const manifest = new Map<string, { path: string; contentId?: string; origin?: string }>()
if (manifestPath)
  for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as { sha256: string; path: string; contentId?: string; origin?: string }
    manifest.set(r.sha256, r)
  }

const reports: StoryReport[] = []
const skipped: Record<string, number> = {}
const problems: string[] = []
let converted = 0
let nondeterministic = 0
const assetUses = new Map<string, number>()
const assetKinds: Record<string, Set<string>> = { image: new Set(), audio: new Set(), video: new Set() }
const assetHosts: Record<string, number> = {}
let bytes = 0

for (const f of files) {
  const sha = path.basename(f).split('.')[0]!
  const page: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const r: ConvertResult = convertStory(page, options)
  const m = manifest.get(sha)
  if (r.status === 'skipped') {
    skipped[r.reason] = (skipped[r.reason] ?? 0) + 1
    if (m && r.reason === 'external' && m.origin === 'wuwf') problems.push(`${m.path}: skipped as external but the census said wuwf`)
    continue
  }
  converted++
  reports.push(r.report)
  const again = convertStory(page, options)
  if (again.status !== 'converted' || JSON.stringify(again.story) !== JSON.stringify(r.story)) nondeterministic++
  if (m) {
    if (m.path !== r.story.path) problems.push(`${m.path}: converted path is ${r.story.path}`)
    if (m.contentId && m.contentId !== r.story.legacy.groveId) problems.push(`${m.path}: contentId mismatch`)
  }
  const lp = lexicalProblems(r.story.content)
  for (const p of lp) problems.push(`${r.story.path}: ${p}`)
  const json = JSON.stringify(r.story)
  bytes += json.length
  for (const a of r.story.assets) {
    assetUses.set(a.sourceUrl, (assetUses.get(a.sourceUrl) ?? 0) + 1)
    assetKinds[a.kind]!.add(a.sourceUrl)
    const h = new URL(a.sourceUrl).hostname
    assetHosts[h] = (assetHosts[h] ?? 0) + 1
  }
}

const s = summarize(reports)
const usesTotal = [...assetUses.values()].reduce((a, b) => a + b, 0)
const result = {
  generatedFrom: `${files.length} pages`,
  converted,
  skipped,
  nondeterministic,
  problems: problems.slice(0, 20),
  problemCount: problems.length,
  meanStoryJson: converted ? Math.round(bytes / converted) : 0,
  statuses: s.byStatus,
  assets: {
    distinctImages: assetKinds.image!.size,
    distinctAudio: assetKinds.audio!.size,
    distinctVideo: assetKinds.video!.size,
    usesAcrossStories: usesTotal,
    perHost: Object.fromEntries(Object.entries(assetHosts).sort((a, b) => b[1] - a[1])),
  },
  hostsNeedingApproval: s.hostsNeedingApproval,
  mapped: Object.fromEntries(Object.entries(s.mapped).sort((a, b) => b[1] - a[1])),
  codes: s.codes,
}
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n')
console.log(JSON.stringify({ ...result, codes: result.codes.map((c) => `${c.level.padEnd(9)} ${String(c.stories).padStart(5)} stories  ${c.code}${Object.keys(c.details).length ? '  ' + JSON.stringify(Object.fromEntries(Object.entries(c.details).sort((a, b) => b[1] - a[1]).slice(0, 4))) : ''}`) }, null, 1))
