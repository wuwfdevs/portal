// Runs the live-blog converter over the saved raw pages (the ones `probe.ts fetch` wrote) and prints what it did. Nothing is
// written to the database and nothing is fetched.
//
//   pnpm exec tsx scripts/live-updates/convert.ts <dir holding the *.json.gz pages>

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { convertLiveBlog } from '../../src/lib/grove'

const dir = process.argv[2]
if (!dir) throw new Error('Pass the folder that holds the saved live-updates pages (*.json.gz).')

for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
  const r = convertLiveBlog(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8')))
  if (r.status !== 'converted') {
    console.log(`${f}: skipped (${r.reason})`)
    continue
  }
  const { blog, report } = r
  const codes: Record<string, number> = {}
  for (const e of report.entries) codes[`${e.level} ${e.code}`] = (codes[`${e.level} ${e.code}`] ?? 0) + 1
  console.log(
    JSON.stringify(
      {
        path: blog.legacy.legacyPath,
        status: report.status,
        coverage: blog.coverage,
        started: blog.startedAt,
        ended: blog.endedAt,
        updates: blog.updates.length,
        edited: blog.updates.filter((u) => u.editedAt).length,
        withAuthors: blog.updates.filter((u) => u.authors.length).length,
        hasIntro: Boolean(blog.intro),
        leadBlocks: blog.featuredMedia.length,
        files: blog.assets.length,
        mapped: report.mapped,
        codes,
      },
      null,
      1,
    ),
  )
}
