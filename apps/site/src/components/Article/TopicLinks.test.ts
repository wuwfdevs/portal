import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TopicLinks } from './Parts'

const html = (topics: Parameters<typeof TopicLinks>[0]['topics']) => renderToStaticMarkup(React.createElement(TopicLinks, { topics }))

describe('TopicLinks', () => {
  it('draws nothing for a story with no topics', () => {
    expect(html([])).toBe('')
    expect(html([{ id: 1, title: '  ', slug: 'x' }])).toBe('')
  })

  it('links each topic to its topic page, without a "Topic ·" prefix', () => {
    const out = html([
      { id: 1, title: 'Roman culture', slug: 'roman-culture' },
      { id: 2, title: 'Ancient Rome', slug: 'ancient-rome' },
    ])
    expect(out).toContain('href="/tags/roman-culture"')
    expect(out).toContain('href="/tags/ancient-rome"')
    expect(out).toContain('Filed under')
    expect(out).not.toContain('Topic ·')
  })

  it('shows a topic with no slug as plain text, not a broken link', () => {
    const out = html([{ id: 3, title: 'Orphan', slug: null }])
    expect(out).toContain('Orphan')
    expect(out).not.toContain('href=')
  })
})
