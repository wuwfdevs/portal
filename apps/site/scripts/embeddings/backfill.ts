// Embeds the site's stories (the vectorization step of the Grove migration; see scripts/grove/IMPORT.md, step 5).
//
//   pnpm exec tsx scripts/embeddings/backfill.ts                        # DRY RUN (default): counts, an estimate, no key needed, nothing sent or written
//   pnpm exec tsx scripts/embeddings/backfill.ts --limit 50 --apply     # a first small run: 50 stories
//   pnpm exec tsx scripts/embeddings/backfill.ts --apply                # everything that is missing or stale
//   pnpm exec tsx scripts/embeddings/backfill.ts --apply --production   # the same on production (staging first)
//
//   --apply             without it nothing is sent to the provider and nothing in the database is changed
//   --limit N           stop after N stories that need embedding (and skip the prune, which needs a full scan)
//   --batch N           stories per provider request (default 32, at most 64)
//   --production        allow the production project (refused without it)
//   --local-rehearsal   lets it run against a scratch database on this machine
//
// What it does: reads every published WUWF story (NPR and wire stories are never read for this), builds the text each is embedded from
// (title, dek, description and body; a members-only story from its title, dek and description alone), and embeds the ones with no vector
// or whose text (or the model) has changed since. Safe to run again, and to stop and resume: a story whose vector is current is left alone and
// costs nothing. After a full scan it removes vectors whose story is no longer published or no longer WUWF's.
//
// Needs OPENAI_API_KEY for --apply. This SENDS STORY TEXT to the embedding provider and is a paid call: the owner authorises the first
// run (ROADMAP: Needs the owner). The dry run prints the story count and an estimated size so the owner can see it first.
//
// Safety: refuses any database that is not the site's staging or (with --production) production project; refuses a hosted database
// without NODE_ENV=production (development mode would push schema changes to it); never prints a password or any story text.

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const has = (n: string) => args.includes(`--${n}`)
const apply = has('apply')
const limit = flag('limit')[0] ? Number.parseInt(flag('limit')[0], 10) : Infinity
const batchSize = Math.min(64, Math.max(1, flag('batch')[0] ? Number.parseInt(flag('batch')[0], 10) : 32))
if (!Number.isFinite(limit) && flag('limit')[0]) throw new Error('--limit needs a number')

const { checkSiteDatabase } = await import('../../src/lib/assets/staging-guard')
const guard = checkSiteDatabase(process.env.DATABASE_URL, { allowLocal: has('local-rehearsal'), allowProduction: has('production') })
if (!guard.ok) throw new Error(`Refusing to run: ${guard.reason}`)
if (guard.where !== 'this machine' && process.env.NODE_ENV !== 'production') throw new Error('Refusing to run against a hosted database without NODE_ENV=production (development mode would push schema changes to it).')
console.log(`database: ${guard.where}${apply ? '' : '   (DRY RUN: nothing is sent or changed; add --apply to embed)'}`)

const { getEmbeddingProvider, embedStories, pruneEmbeddings } = await import('../../src/lib/embeddings/service')
const { allEmbeddedPostIds, countEmbeddings } = await import('../../src/lib/embeddings/store')
const { skipReason } = await import('../../src/lib/embeddings/text')
const { EMBEDDING_MODEL } = await import('../../src/lib/embeddings/config')

const provider = getEmbeddingProvider()
if (apply && !provider) throw new Error('OPENAI_API_KEY is not set: nothing can be embedded. (A dry run does not need it.)')
// A dry run still needs a provider object to decide what is stale (the hash includes the model), but never calls it.
const { openAiProvider } = await import('../../src/lib/embeddings/provider')
const planner = provider ?? openAiProvider('dry-run-never-called')

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })

const total = { seen: 0, eligible: 0, embedded: 0, stale: 0, unchanged: 0, skipped: 0, tokens: 0 }
const eligibleIds = new Set<number>()
let needing = 0
let page = 1
let stopped = false

while (!stopped) {
  const found = await payload.find({
    collection: 'posts',
    depth: 0,
    draft: false,
    limit: batchSize,
    page,
    overrideAccess: true,
    sort: 'id',
    select: { title: true, dek: true, meta: true, content: true, membersOnly: true, source: true, _status: true },
    where: { and: [{ _status: { equals: 'published' } }, { source: { equals: 'wuwf' } }] },
  })
  if (found.docs.length === 0) break
  total.seen += found.docs.length
  for (const doc of found.docs) if (skipReason(doc) === null) eligibleIds.add(Number(doc.id))

  // --limit caps what is SENT, not what is looked at: only the remaining allowance of stale stories goes to the provider, so a page of 32
  // stale stories with 1 left to do embeds (and pays for) 1.
  const remaining = Number.isFinite(limit) ? Math.max(0, limit - needing) : undefined
  const report = await embedStories(payload, found.docs, planner, { dryRun: !apply, maxEmbed: remaining })
  total.skipped += report.skipped
  total.unchanged += report.unchanged
  total.stale += report.stale
  total.embedded += report.embedded
  total.tokens += report.tokensEstimate
  needing += apply ? report.embedded : report.stale
  if (apply) console.log(`page ${page}: embedded ${report.embedded}, already current ${report.unchanged}, left out ${report.skipped}`)

  if (needing >= limit) stopped = true
  if (!found.hasNextPage) break
  page++
}
total.eligible = eligibleIds.size

console.log('\nStories read (published, WUWF):', total.seen)
console.log('  eligible (have text):          ', total.eligible)
console.log('  left out (no text):            ', total.skipped)
console.log('  already current:               ', total.unchanged)
console.log(`  ${apply ? 'embedded this run:             ' : 'would be embedded:              '}`, apply ? total.embedded : total.stale)
console.log(`  size of what needs embedding:   about ${Math.round(total.tokens / 1000).toLocaleString()}k tokens (model ${EMBEDDING_MODEL}; characters / 4)`)
console.log('  A rough cost at the provider\'s published per-token rate is that many tokens x the rate: check the provider\'s current price page.')

// A vector whose story is gone, unpublished or not WUWF's is harmless (readers load stories through access control) but is dead weight.
// Only after a complete scan: a --limit run has not seen every story and must not prune.
if (!stopped && !Number.isFinite(limit)) {
  const orphans = (await allEmbeddedPostIds(payload)).filter((id) => !eligibleIds.has(id))
  if (orphans.length > 0) {
    if (apply) console.log(`\nremoved ${await pruneEmbeddings(payload, orphans)} vectors for stories that are no longer eligible`)
    else console.log(`\n${orphans.length} stored vectors belong to stories that are no longer eligible (removed with --apply)`)
  }
}
console.log(`\nvectors stored now: ${await countEmbeddings(payload)}`)
process.exit(0)
