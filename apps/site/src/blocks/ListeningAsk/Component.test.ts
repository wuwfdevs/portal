import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The block's job is to choose how the set is framed and what words go with it; the set itself is drawn elsewhere.
vi.mock('@/components/Listening/ListeningInline', () => ({
  ListeningInline: (props: { publicId: string; variant: string; recipient?: string; description?: string }) =>
    createElement('i', { 'data-id': props.publicId, 'data-variant': props.variant, 'data-recipient': props.recipient ?? '', 'data-description': props.description ?? '' }),
}))

import { ListeningAskBlock } from './Component'

const CODE = 'abcd1234efgh5678'
const draw = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ListeningAskBlock as never, { blockType: 'listeningAsk', question: CODE, variant: 'story', ...props }))

describe('the listening block', () => {
  it('draws nothing without a code it can read', () => {
    expect(draw({ question: '' })).toBe('')
    expect(draw({ question: 'nonsense' })).toBe('')
  })
  it('is the in-story ask in a text story, and leads with recording after an audio or video story, with no choice by the editor', () => {
    expect(draw({})).toContain('data-variant="story"')
    expect(draw({ framing: 'story' })).toContain('data-variant="story"')
    expect(draw({ framing: 'voice' })).toContain('data-variant="voice"')
  })
  it('keeps a block saved as voice before the choice was removed', () => {
    expect(draw({ variant: 'voice', framing: 'story' })).toContain('data-variant="voice"')
  })
  it('passes the recipient and the description through in either framing, trimmed, and nothing when they are empty', () => {
    for (const framing of ['story', 'voice']) {
      const out = draw({ framing, recipient: ' Mary ', description: ' One line. ' })
      expect(out, framing).toContain('data-recipient="Mary"')
      expect(out, framing).toContain('data-description="One line."')
    }
    const bare = draw({ recipient: '  ', description: '' })
    expect(bare).toContain('data-recipient=""')
    expect(bare).toContain('data-description=""')
  })
  it('accepts the query\'s address as well as its code', () => {
    expect(draw({ question: `https://www.wuwf.org/listens/${CODE}` })).toContain(`data-id="${CODE}"`)
  })
})
