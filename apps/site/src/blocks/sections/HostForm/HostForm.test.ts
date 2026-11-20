import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { HostFormSection } from './Component'

vi.mock('@/components/Listening/HostForm', () => ({ HostForm: () => createElement('form', { 'data-form': 'host' }, 'host form') }))

describe('Host form section', () => {
  it('draws the request form in a light card, in the section’s band, with its anchor and tone', async () => {
    const out = await HostFormSection({ block: { blockType: 'sectionHostForm', tone: 'dark', anchor: 'host', heading: { title: 'Ask to host' } } as never, context: testContext })
    const html = renderToStaticMarkup(out as never)
    expect(html).toContain('data-form="host"')
    expect(html).toContain('bg-surface')
    expect(html).toContain('data-tone="dark"')
    expect(html).toContain('id="host"')
    expect(html).toContain('Ask to host')
  })
})
