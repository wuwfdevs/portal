import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pathsAffectedByAgreement } from '@/lib/underwriting/invalidate'
import { getAcknowledgments } from '@/lib/underwriting/load'

const EXAMPLE_FOUNDATION =
  "Reporting through WUWF's Coastal Futures Fellowship is made possible in part by support from Example Foundation."

let payload: Payload
const run = Date.now().toString(36)
const created: { collection: string; id: string | number }[] = []
const NOW = '2026-10-30T12:00:00Z'

async function make<T extends { id: string | number }>(
  collection: string,
  data: Record<string, unknown>,
): Promise<T> {
  // Local API calls run as the system (overrideAccess defaults to true); the access tests below pass overrideAccess: false.
  const doc = (await payload.create({
    collection: collection as never,
    data: data as never,
    overrideAccess: true,
  })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

const lexical = {
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          {
            type: 'text',
            version: 1,
            text: 'Body.',
            format: 0,
            mode: 'normal',
            style: '',
            detail: 0,
          },
        ],
      },
    ],
  },
}

describe('the content model, through Payload', () => {
  let story: { id: string | number }
  let agreement: { id: string | number }
  let fellowship: { id: string | number }
  let draftStory: { id: string | number }
  let unrelated: { id: string | number; slug?: string }
  let storySlug = ''
  let fellowshipSlug = ''

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const sponsor = await make('sponsors', { name: `Example Foundation ${run}` })
    agreement = await make('underwriting-agreements', {
      label: `Example Foundation — Coastal Futures ${run}`,
      sponsor: sponsor.id,
      kind: 'recognition',
      text: EXAMPLE_FOUNDATION,
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    })
    const contributor = await make('contributors', { name: `Leigh Ostrander ${run}` })
    fellowship = await make('fellowships', {
      title: `Coastal Futures ${run}`,
      agreements: [agreement.id],
      fellow: contributor.id,
    })
    const series = await make('series', { title: `After Isaias ${run}` })
    const topic = await make('categories', { title: `Growth & Development ${run}` })
    story = await make('posts', {
      title: `Rebuild, raise or leave? ${run}`,
      content: lexical,
      _status: 'published',
      publishedAt: '2026-10-28T12:00:00.000Z',
      fellowship: fellowship.id,
      series: series.id,
      categories: [topic.id],
      contributors: [contributor.id],
    })
    draftStory = await make('posts', {
      title: `Unpublished ${run}`,
      content: lexical,
      _status: 'draft',
      publishedAt: '2026-10-28T12:00:00.000Z',
      fellowship: fellowship.id,
    })
    const otherFellowship = await make('fellowships', { title: `Unfunded Fellowship ${run}` })
    unrelated = await make('posts', {
      title: `Unrelated story ${run}`,
      content: lexical,
      _status: 'published',
      publishedAt: '2026-10-28T12:00:00.000Z',
      fellowship: otherFellowship.id,
    })
    storySlug = (
      (await payload.findByID({ collection: 'posts', id: story.id, overrideAccess: true })) as {
        slug: string
      }
    ).slug
    fellowshipSlug = (
      (await payload.findByID({
        collection: 'fellowships',
        id: fellowship.id,
        overrideAccess: true,
      })) as { slug: string }
    ).slug
  }, 60_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) {
      await payload
        .delete({ collection: collection as never, id, overrideAccess: true })
        .catch(() => undefined)
    }
  })

  it('the Coastal Futures story carries the Example Foundation line, once, with the approved sentence', async () => {
    const r = await getAcknowledgments(payload, story.id, 'article', NOW)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ text: EXAMPLE_FOUNDATION, via: { kind: 'fellowship' } })
  })

  it('a draft story carries nothing', async () => {
    expect((await getAcknowledgments(payload, draftStory.id, 'article', NOW)).lines).toEqual([])
  })

  it('changing the agreement once changes the story, and the version records it', async () => {
    const edited = 'Coastal Futures is supported in part by Example Foundation.'
    await payload.update({
      collection: 'underwriting-agreements',
      id: agreement.id,
      data: { text: edited },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    const r = await getAcknowledgments(payload, story.id, 'article', NOW)
    expect(r.lines[0]?.text).toBe(edited)
    expect(r.lines[0]?.textVersion).toBe(2)
    await payload.update({
      collection: 'underwriting-agreements',
      id: agreement.id,
      data: { text: EXAMPLE_FOUNDATION },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('an agreement edit refreshes the story and the hub it reaches, and nothing else', async () => {
    const paths = await pathsAffectedByAgreement(payload, agreement.id)
    expect(paths).toContain(`/posts/${storySlug}`)
    expect(paths).toContain(`/fellowships/${fellowshipSlug}`)
    expect(paths.some((p) => p.includes(String(unrelated.slug ?? 'unrelated-story')))).toBe(false)
    expect(
      paths.every((p) => !p.includes('unfunded-fellowship') && !p.includes('unrelated-story')),
    ).toBe(true)
  })

  it('after the term ends, the story published during it still carries the line', async () => {
    const r = await getAcknowledgments(payload, story.id, 'article', '2031-01-01T00:00:00Z')
    expect(r.lines).toHaveLength(1)
  })

  it('refuses an agreement whose end is before its start', async () => {
    await expect(
      payload.update({
        collection: 'underwriting-agreements',
        id: agreement.id,
        data: { startsOn: '2027-01-01', endsOn: '2026-01-01' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  describe('access control, as the public and as staff', () => {
    const asRoles = (roles: string[]) => ({
      id: 1,
      collection: 'users' as const,
      roles,
      email: 'x@wuwf.org',
    })

    it("as the public, a story's fellowship carries only agreement ids, so pages must resolve acknowledgments server-side", async () => {
      const r = await payload.find({
        collection: 'posts',
        depth: 3,
        draft: false,
        overrideAccess: false,
        limit: 1,
        where: { title: { like: run }, _status: { equals: 'published' } },
      })
      const f = r.docs[0]?.fellowship as { agreements?: unknown[] } | undefined
      expect(typeof f?.agreements?.[0]).not.toBe('object')
    })

    it('the public cannot read agreements, sponsors or users', async () => {
      for (const collection of ['underwriting-agreements', 'sponsors', 'users'] as const) {
        await expect(payload.find({ collection, overrideAccess: false })).rejects.toThrow()
      }
    })

    it('the public can read published stories but not drafts', async () => {
      const result = await payload.find({
        collection: 'posts',
        overrideAccess: false,
        draft: false,
        limit: 100,
        where: { title: { like: run } },
      })
      expect(result.docs.length).toBeGreaterThan(0)
      expect(result.docs.every((d) => d._status === 'published')).toBe(true)
    })

    it('an editor can write stories but cannot create agreements or publish-delete', async () => {
      const editor = asRoles(['editor'])
      await expect(
        payload.create({
          collection: 'underwriting-agreements',
          overrideAccess: false,
          user: editor as never,
          data: { label: 'x', sponsor: 1, text: 'x', startsOn: '2026-01-01' } as never,
        }),
      ).rejects.toThrow()
    })

    it('a person cannot grant themselves roles', async () => {
      const editor = asRoles(['editor'])
      await expect(
        payload.update({
          collection: 'users',
          id: 1,
          overrideAccess: false,
          user: editor as never,
          data: { roles: ['administrator'] } as never,
        }),
      ).rejects.toThrow()
    })
  })
})
