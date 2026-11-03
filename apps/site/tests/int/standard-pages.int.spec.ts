import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolvePath } from '@/utilities/resolvePath'

// A standard page: a title, a short lead and a body, at an exact address, served by the same resolver as stories.

const run = Date.now().toString(36)
let payload: Payload
const created: (string | number)[] = []
const ctx = { disableRevalidate: true }
const body = (t: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 }] }] } })

describe('standard pages', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('defaults to the standard template and keeps its lead and body', async () => {
    const p = await payload.create({ collection: 'pages', overrideAccess: true, context: ctx, data: { title: `Meeting ${run}`, summary: 'The June meeting.', body: body('Minutes.'), path: `/meeting-${run}`, _status: 'published' } as never })
    created.push(p.id)
    expect(p.template).toBe('standard')
    const hit = await resolvePath(`/meeting-${run}`, false)
    expect(hit?.kind).toBe('page')
    expect((hit?.doc as { summary?: string }).summary).toBe('The June meeting.')
    expect(JSON.stringify((hit?.doc as { body?: unknown }).body)).toContain('Minutes.')
  })

  it('keeps Grove\'s exact address and its identity once migrated, and a re-run cannot duplicate it', async () => {
    const data = { title: `BOT ${run}`, body: body('x'), path: `/bot-${run}`, legacy: { legacyPath: `/bot-${run}`, groveId: `00000170-${run}`, modifiedAt: '2020-05-01T10:00:00.000Z' }, _status: 'published' }
    const p = await payload.create({ collection: 'pages', overrideAccess: true, context: ctx, data: data as never })
    created.push(p.id)
    expect(p.path).toBe(`/bot-${run}`)
    await expect(payload.create({ collection: 'pages', overrideAccess: true, context: ctx, data: { ...data, path: `/bot2-${run}` } as never })).rejects.toThrow()
  })

  it('does not show a draft page to the public', async () => {
    const p = await payload.create({ collection: 'pages', draft: true, overrideAccess: true, context: ctx, data: { title: `Draft ${run}`, body: body('x'), path: `/draft-${run}`, _status: 'draft' } as never })
    created.push(p.id)
    expect(await resolvePath(`/draft-${run}`, false)).toBeNull()
  })
})
