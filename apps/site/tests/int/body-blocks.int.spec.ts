import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The body blocks that give parity with Brightspot's rich-text elements. The safety claims about Embed and Preserved
// HTML only hold if Payload really runs validators and hooks inside rich-text blocks, so they are tested here.

const run = Date.now().toString(36)
let payload: Payload
const created: (string | number)[] = []

const text = (t: string) => ({
  type: 'text',
  version: 1,
  text: t,
  format: 0,
  mode: 'normal',
  style: '',
  detail: 0,
})
const para = (t: string) => ({
  type: 'paragraph',
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children: [text(t)],
})
const block = (blockType: string, fields: Record<string, unknown>) => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id: `b-${blockType}-${Math.random().toString(36).slice(2, 8)}`, blockType, ...fields },
})
const body = (...children: unknown[]) => ({
  root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children },
})

async function story(title: string, content: unknown, user?: unknown) {
  const p = await payload.create({
    collection: 'posts',
    draft: false,
    context: { disableRevalidate: true },
    ...(user ? { overrideAccess: false, user: user as never } : { overrideAccess: true }),
    data: { title: `${title} ${run}`, content, _status: 'published' } as never,
  })
  created.push(p.id)
  return p
}
const blocksOf = (content: unknown) =>
  (
    content as { root: { children: { type: string; fields?: Record<string, unknown> }[] } }
  ).root.children.filter((n) => n.type === 'block')

describe('body blocks', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { embedHosts: [{ host: 'maps.example.org' }] },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }, 60_000)
  afterAll(async () => {
    for (const id of created)
      await payload
        .delete({
          collection: 'posts',
          id,
          overrideAccess: true,
          context: { disableRevalidate: true },
        })
        .catch(() => undefined)
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { embedHosts: [] },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('stores a pull quote and a gallery-less story without complaint', async () => {
    const p = await story(
      'Quote',
      body(
        para('Intro.'),
        block('pullQuote', { text: 'It is a vote.', attribution: 'Dana Whitlock' }),
      ),
    )
    expect(blocksOf(p.content)[0]?.fields?.text).toBe('It is a vote.')
  })

  describe('embeds', () => {
    it('accepts a known provider and an approved host', async () => {
      await expect(
        story(
          'YT',
          body(
            block('embed', {
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              title: 'A video',
            }),
          ),
        ),
      ).resolves.toBeTruthy()
      await expect(
        story(
          'Maps',
          body(block('embed', { url: 'https://maps.example.org/embed/1', title: 'A map' })),
        ),
      ).resolves.toBeTruthy()
    })
    it('refuses, on save, a host nobody approved, plain http, and a script URL', async () => {
      for (const url of [
        'https://evil.example/frame',
        'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'javascript:alert(1)',
      ])
        await expect(story('Bad', body(block('embed', { url, title: 'x' }))), url).rejects.toThrow()
    })
    it('an approval can be withdrawn: the same URL is then refused', async () => {
      await payload.updateGlobal({
        slug: 'site-settings',
        data: { embedHosts: [] },
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
      await expect(
        story(
          'Withdrawn',
          body(block('embed', { url: 'https://maps.example.org/embed/1', title: 'A map' })),
        ),
      ).rejects.toThrow()
      await payload.updateGlobal({
        slug: 'site-settings',
        data: { embedHosts: [{ host: 'maps.example.org' }] },
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    })
    it('refuses an approved-host entry that is not a bare hostname', async () => {
      for (const host of ['https://x.example.org', 'x.example.org/path', 'not a host', ''])
        await expect(
          payload.updateGlobal({
            slug: 'site-settings',
            data: { embedHosts: [{ host }] },
            overrideAccess: true,
            context: { disableRevalidate: true },
          }),
          host,
        ).rejects.toThrow()
    })
  })

  describe('preserved HTML', () => {
    const hostile =
      '<p onclick="x()">Kept</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">bad</a>'
    it('is stored sanitized', async () => {
      const p = await story('Legacy', body(block('legacyHtml', { html: hostile, note: 'test' })))
      const stored = String(blocksOf(p.content)[0]?.fields?.html)
      expect(stored).toContain('Kept')
      expect(stored).not.toMatch(/script|iframe|onclick|javascript:|evil/)
    })
    it('cannot be written by an editor, only by an administrator', async () => {
      const editor = { id: 1, collection: 'users', email: 'e@wuwf.org', roles: ['editor'] }
      const attempt = story(
        'Editor legacy',
        body(block('legacyHtml', { html: '<p>x</p>' })),
        editor,
      )
      // Either the write is refused outright, or the field is dropped; what must never happen is that the HTML is stored.
      const outcome = await attempt.then(
        (p) => ({ stored: String(blocksOf(p.content)[0]?.fields?.html ?? '') }),
        () => ({ stored: '' }),
      )
      expect(outcome.stored).toBe('')
    })
  })
})
