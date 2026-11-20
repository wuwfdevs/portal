import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { FeaturePanelsSection } from './Component'

let unearthing: unknown = null
let radio: unknown = null
let radioFails = false
const loadUnearthingSlot = vi.fn(async () => unearthing)
const loadRadioLiveSlot = vi.fn(async () => {
  if (radioFails) throw new Error('down')
  return radio
})
vi.mock('@/lib/homepage/load-slots', () => ({
  loadUnearthingSlot: (...a: unknown[]) => (loadUnearthingSlot as unknown as (...x: unknown[]) => unknown)(...a),
  loadRadioLiveSlot: () => loadRadioLiveSlot(),
}))

const draw = async (block: Record<string, unknown> = {}) => {
  const out = await FeaturePanelsSection({ block: { blockType: 'sectionFeaturePanels', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  radioFails = false
  loadUnearthingSlot.mockClear()
  loadRadioLiveSlot.mockClear()
  unearthing = { production: { id: 1, title: 'Unearthing Florida' }, heroImage: null, episode: { id: 3, title: 'The mound', path: '/unearthing-florida/2026-11-20/mound', meta: {}, featuredAudio: null } }
  radio = { tagline: 'Live from Pensacola', next: null, latest: { id: 5, slug: 'dec-set', title: 'December set', startsAt: '2026-12-03T00:00:00.000Z', venue: 'Museum', lineup: [], tickets: { href: null, label: 'Tickets' } } }
})

describe('Feature panels', () => {
  it('draws both panels side by side', async () => {
    const out = await draw()
    expect(out).toContain('Unearthing Florida')
    expect(out).toContain('RadioLive')
    expect(out).toContain('lg:grid-cols-2')
  })
  it('leaves a panel out when it is switched off, without reading it', async () => {
    const out = await draw({ radioLive: false })
    expect(loadRadioLiveSlot).not.toHaveBeenCalled()
    expect(out).toContain('Unearthing Florida')
    expect(out).not.toContain('lg:grid-cols-2')
  })
  it('asks for the Unearthing episode an editor picked', async () => {
    await draw({ unearthingEpisode: { id: 3 } })
    expect(loadUnearthingSlot).toHaveBeenLastCalledWith(3)
  })
  it('leaves out a panel that fails or has nothing, and draws nothing when both are out', async () => {
    radioFails = true
    expect(await draw()).toContain('Unearthing Florida')
    unearthing = null
    expect(await draw()).toBe('')
  })
})
