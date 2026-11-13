// Reads similar stories for a sample, so a person can judge them and set the thresholds in src/lib/embeddings/rank.ts by eye.
// Read-only: it sends nothing anywhere (it compares vectors already stored) and changes nothing.
//
//   pnpm exec tsx scripts/embeddings/inspect.ts                           # 15 stories chosen across the archive
//   pnpm exec tsx scripts/embeddings/inspect.ts --path /local-news/2024-05-01/some-story
//   pnpm exec tsx scripts/embeddings/inspect.ts --sample 40 --seed 3      # a larger, different sample
//   --production, --local-rehearsal   as in backfill.ts
//
// For each story it prints the stored neighbours with their similarity, marks which the rules in rank.ts would show, and ends with the
// distribution of similarities, which is what the floor (MIN_RELATED_SIMILARITY) should be read against.

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const has = (n: string) => args.includes(`--${n}`)

const { checkSiteDatabase } = await import('../../src/lib/assets/staging-guard')
const guard = checkSiteDatabase(process.env.DATABASE_URL, { allowLocal: has('local-rehearsal'), allowProduction: has('production') })
if (!guard.ok) throw new Error(`Refusing to run: ${guard.reason}`)
if (guard.where !== 'this machine' && process.env.NODE_ENV !== 'production') throw new Error('Refusing to run against a hosted database without NODE_ENV=production.')

const { RELATED_CANDIDATES, MIN_RELATED_SIMILARITY, pickRelated } = await import('../../src/lib/embeddings/rank')
const { nearestToStory, allEmbeddedPostIds } = await import('../../src/lib/embeddings/store')
const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })

const ids = await allEmbeddedPostIds(payload)
if (ids.length === 0) throw new Error('No vectors are stored yet: run scripts/embeddings/backfill.ts --apply first.')

let sample: number[]
const onePath = flag('path')[0]
if (onePath) {
  const found = await payload.find({ collection: 'posts', where: { path: { equals: onePath } }, limit: 1, depth: 0, overrideAccess: true, draft: false })
  if (!found.docs[0]) throw new Error(`No story at ${onePath}`)
  sample = [Number(found.docs[0].id)]
} else {
  const n = Math.min(ids.length, Number.parseInt(flag('sample')[0] ?? '15', 10))
  let seed = Number.parseInt(flag('seed')[0] ?? '1', 10)
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) // deterministic, so a run can be repeated
  sample = [...ids].sort(() => rand() - 0.5).slice(0, n)
}

const all: number[] = []
for (const id of sample) {
  const self = await payload.findByID({ collection: 'posts', id, depth: 0, overrideAccess: true, select: { title: true, path: true, publishedAt: true } })
  const neighbours = await nearestToStory(payload, id, RELATED_CANDIDATES)
  const docs = await payload.find({ collection: 'posts', where: { id: { in: neighbours.map((x) => x.postId) } }, limit: neighbours.length, pagination: false, depth: 0, overrideAccess: true, draft: false, select: { title: true, path: true, publishedAt: true, series: true, production: true } })
  const byId = new Map(docs.docs.map((d) => [String(d.id), d]))
  const shown = new Set(
    pickRelated(id, neighbours.flatMap((x) => { const d = byId.get(String(x.postId)); return d ? [{ id: d.id, similarity: x.similarity, publishedAt: d.publishedAt, seriesKey: String(d.production ?? d.series ?? '') || null }] : [] }), new Date()).map((c) => String(c.id)),
  )
  console.log(`\n■ ${self.title}\n  ${self.path}  (${self.publishedAt?.slice(0, 10) ?? 'no date'})`)
  for (const x of neighbours.slice(0, 8)) {
    const d = byId.get(String(x.postId))
    all.push(x.similarity)
    console.log(`  ${shown.has(String(x.postId)) ? '✔ shown ' : '  hidden'}  ${x.similarity.toFixed(3)}  ${d?.title ?? '(not published)'}  ${d?.publishedAt?.slice(0, 10) ?? ''}`)
  }
}
all.sort((a, b) => a - b)
const q = (p: number) => all[Math.min(all.length - 1, Math.floor(p * all.length))]?.toFixed(3)
console.log(`\nSimilarity of the top 8 neighbours across ${sample.length} stories: min ${q(0)}, 25% ${q(0.25)}, median ${q(0.5)}, 75% ${q(0.75)}, max ${q(0.999)}.`)
console.log(`Floor now: ${MIN_RELATED_SIMILARITY}. Raise it if "shown" neighbours are off-topic; lower it if good ones are hidden.`)
process.exit(0)
