import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { empty, failed, hub, ok } from '../listening-fixtures'
import { ListeningOutcomesView } from './Component'

const block = { blockType: 'sectionListeningOutcomes', tone: 'dark', heading: { title: 'You asked. Here’s what came of it.' } }
const view = (load: Parameters<typeof ListeningOutcomesView>[0]['load'], b: Record<string, unknown> = block) => renderToStaticMarkup(createElement(ListeningOutcomesView, { block: b as never, load }))

describe('Outcomes', () => {
  it('draws the question, who answered, and the outcome as a link to it', () => {
    const html = view(ok)
    expect(html).toContain('What would you ask the mayor?')
    expect(html).toContain('41 people answered')
    expect(html).toContain('Story · After Isaias')
    expect(html).toContain('The mayor answers')
    expect(html).toContain('Residents asked about drainage.')
    expect(html).toContain('href="https://www.wuwf.org/news/2026-10-23/mayor"')
    expect(html).toContain('data-tone="dark"')
  })
  it('says "One person answered" for one, and nothing for none', () => {
    const one = { kind: 'ok' as const, hub: { ...hub, answered: [{ ...hub.answered[0]!, responseCount: 1 }] } }
    expect(view(one)).toContain('One person answered')
    const none = { kind: 'ok' as const, hub: { ...hub, answered: [{ ...hub.answered[0]!, responseCount: 0 }] } }
    expect(view(none)).not.toMatch(/answered<|people answered|One person/)
  })
  it('draws a link only for an address a link may have, and the card without one', () => {
    const bad = { kind: 'ok' as const, hub: { ...hub, answered: [{ ...hub.answered[0]!, outcomes: [{ ...hub.answered[0]!.outcomes[0]!, url: 'javascript:alert(1)' }] }] } }
    const html = view(bad)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('The mayor answers')
  })
  it('draws nothing when nothing has come of anything, when the Portal could not be read, or without the hub', () => {
    expect(view(empty)).toBe('')
    expect(view(failed)).toBe('')
    expect(view(undefined)).toBe('')
  })
})
