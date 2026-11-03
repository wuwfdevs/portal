import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { linkLineTarget } from '@/blocks/LinkLine/target'
import { ensureTestSection } from '../helpers/section'

// The link-line block is not in Grove's data; the converter builds it from a typed "RELATED:" line and from the stock "Support Local Stories. Donate Here." line. Payload drops a
// block type a field does not allow without any error, so this proves a saved story keeps it, that its validators run
// inside the rich text, and that a picked story comes back with the headline and address the page needs.

const run = Date.now().toString(36)
let payload: Payload
const created: (string | number)[] = []

const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 })
const para = (t: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [text(t)] })
const block = (fields: Record<string, unknown>) => ({
  type: 'block', version: 2, format: '',
  fields: { id: `b-rel-${Math.random().toString(36).slice(2, 8)}`, blockType: 'linkLine', ...fields },
})
const body = (...children: unknown[]) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } })

async function story(title: string, content: unknown) {
  const p = await payload.create({
    collection: 'posts',
    draft: false,
    context: { disableRevalidate: true },
    overrideAccess: true,
    data: { title: `${title} ${run}`, content, _status: 'published', section: await ensureTestSection(payload) } as never,
  })
  created.push(p.id)
  return p
}
const blocksOf = (content: unknown) =>
  (content as { root: { children: { type: string; fields?: Record<string, unknown> }[] } }).root.children.filter((n) => n.type === 'block')

describe('link-line block', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created) await payload.delete({ collection: 'posts', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('keeps a migrated line: label, headline and address', async () => {
    const p = await story('Typed', body(para('Intro.'), block({ label: 'Related', linkText: 'Lawmakers react', url: '/local-news/2024-11-14/lawmakers-react' })))
    expect(blocksOf(p.content)[0]?.fields).toMatchObject({ blockType: 'linkLine', linkText: 'Lawmakers react', url: '/local-news/2024-11-14/lawmakers-react' })
  })

  it('keeps a support-style line (a sentence as the label) and an outside http address', async () => {
    const p = await story('Support', body(block({ label: 'Support Local Stories.', linkText: 'Donate Here', url: '/thanks-for-your-support' }), block({ linkText: 'An old page', url: 'http://www.example.org/old' })))
    const [a, b] = blocksOf(p.content)
    expect(a?.fields).toMatchObject({ label: 'Support Local Stories.', linkText: 'Donate Here', url: '/thanks-for-your-support' })
    expect(b?.fields).toMatchObject({ url: 'http://www.example.org/old' })
  })

  it('refuses, on save, a line with nothing to link to, or an address that is not a path, an http(s) address or a mailto', async () => {
    await expect(story('Empty', body(block({ label: 'Related' })))).rejects.toThrow()
    await expect(story('No address', body(block({ linkText: 'Words only' })))).rejects.toThrow()
    await expect(story('Bad address', body(block({ linkText: 'x', url: 'javascript:alert(1)' })))).rejects.toThrow()
    await expect(story('Bad address 2', body(block({ linkText: 'x', url: 'ftp://example.org/file' })))).rejects.toThrow()
  })

  it('a picked story needs no typed words, and reads back with the story\'s own title and address', async () => {
    const target = await story('Target', body(para('The related story.')))
    expect(target.path).toBeTruthy()
    const p = await story('Picker', body(block({ story: target.id })))
    const read = await payload.findByID({ collection: 'posts', id: p.id, depth: 1, overrideAccess: true, context: { disableRevalidate: true } })
    const fields = blocksOf(read.content)[0]?.fields as { story?: unknown; headline?: unknown }
    expect(fields?.story).toBeTruthy()
    // What the page does with it: the chosen story's title and path.
    expect(typeof fields.story).toBe('object')
    expect(linkLineTarget({ story: fields.story as never })).toEqual({ href: target.path, text: target.title })
  })
})
