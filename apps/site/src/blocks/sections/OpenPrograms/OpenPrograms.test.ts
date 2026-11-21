import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openPrograms } from '@/lib/sponsorship/programs'

import { testContext } from '../testing'
import { OpenProgramsSection, titleFor } from './Component'

let raw: Parameters<typeof openPrograms>[0] = []
vi.mock('@/lib/sponsorship/load', () => ({ loadSponsorshipSettings: async () => ({ settings: {}, programs: openPrograms(raw), interests: [], budgets: [] }) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await OpenProgramsSection({ block: { blockType: 'sectionOpenPrograms', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  raw = [
    { name: 'RadioLive', kind: 'live-series', status: 'open', description: 'Monthly live music.', levels: [{ name: 'Presenting', description: 'Named at every show', price: '' }, { name: 'Supporting', price: '$1,200' }], recognition: 'Named on air.', pageUrl: '/radiolive' },
    { name: 'Held one', status: 'held', description: 'Not yet.' },
  ]
})

describe('Open programs section', () => {
  it('draws only open programs, with "Priced on request" for a level with no confirmed price', async () => {
    const out = await draw({ heading: { title: 'Open now' }, levelsLabel: 'Ways to partner', recognitionLabel: 'Recognition:', talkLabel: 'Talk to us about {name}', moreLabel: 'About {name}' })
    for (const s of ['RadioLive', 'Monthly live music.', 'Priced on request', '$1,200', 'Ways to partner', 'Recognition:', 'Named on air.', 'Talk to us about RadioLive', 'About RadioLive']) expect(out).toContain(s)
    expect(out).not.toContain('Held one')
    expect(out).toContain('href="/sponsor#inquire"')
    expect(out).toContain('href="/radiolive"')
  })
  it('draws no link to a page it was not given, and none that is unsafe', async () => {
    raw = [{ name: 'A', description: 'a', pageUrl: 'javascript:alert(1)' }]
    const out = await draw({ talkLabel: 'Talk about {name}', moreLabel: 'About {name}' })
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('About A')
  })
  it('says what it has when nothing is open, and nothing at all with no words for it', async () => {
    raw = []
    expect(await draw({})).toBe('')
    expect(await draw({ emptyText: 'Nothing is open right now.' })).toContain('Nothing is open right now.')
  })
  it('counts: the heading has its own words for one and for two programs', () => {
    const block = { blockType: 'x', titleOne: 'One is open', titleTwo: 'Two are open', heading: { title: 'Several are open' } }
    expect(titleFor(block, 1)).toBe('One is open')
    expect(titleFor(block, 2)).toBe('Two are open')
    expect(titleFor(block, 3)).toBe('Several are open')
    expect(titleFor({ blockType: 'x', heading: { title: 'Open' } }, 1)).toBe('Open')
  })
})
