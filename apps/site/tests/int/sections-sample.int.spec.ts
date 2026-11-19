import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { SAMPLE_PAGE, buildSampleSections } from '@/lib/sections-sample/build'
import { TONES } from '@/lib/page-themes/themes'

// The internal sample page (PAGE-BLOCKS.md, phase 2) must publish: a required field a block gains later that the sample does not fill would
// stop the owner's review page from saving, and this test says so. It runs with no pictures and no records (the least a database holds).

const ctx = { disableRevalidate: true, disableEmbedding: true }
const publisher = { id: 2, collection: 'users', email: 'p@wuwf.org', roles: ['editor', 'publisher'] } as never
let payload: Payload
let id: number | string | undefined

describe('the sample page publishes', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    if (id !== undefined) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('with every block in every tone, saved as a publisher, and keeps them all', async () => {
    const sections = buildSampleSections({ mediaIds: [], now: new Date() })
    const page = await payload.create({
      collection: 'pages',
      overrideAccess: false,
      user: publisher,
      context: ctx,
      data: { title: `${SAMPLE_PAGE.title} test`, slug: `${SAMPLE_PAGE.slug}-test`, template: 'sections', sections, noindex: true, noReferrer: true, _status: 'published' } as never,
    })
    id = page.id
    expect(page._status).toBe('published')
    const stored = (page.sections ?? []) as Array<{ blockType: string; tone: string }>
    // The page is in no set, so it holds the library blocks only (a set-only block would be refused).
    const library = SECTION_BLOCKS.filter((e) => !e.sets && !e.inlineOnly)
    expect(stored).toHaveLength(library.length * TONES.length)
    for (const e of library) expect(new Set(stored.filter((s) => s.blockType === e.block.slug).map((s) => s.tone)).size, e.block.slug).toBe(TONES.length)
    expect(page.noindex).toBe(true)
  })
})
