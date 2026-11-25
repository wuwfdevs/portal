import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const doc = vi.hoisted(() => ({ id: 12 as number | undefined }))
vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { serverURL: '', routes: { api: '/api' } } }),
  useDocumentInfo: () => ({ id: doc.id }),
}))

const { PlacementDelivery, SponsorDelivery } = await import('./index')

describe('the Delivery panel', () => {
  it('draws no form of its own, so it can never submit the document it sits in', () => {
    for (const panel of [PlacementDelivery, SponsorDelivery]) {
      const html = renderToStaticMarkup(React.createElement(panel))
      expect(html).not.toContain('<form')
      expect(html).not.toContain('type="submit"')
      expect(html).toContain('type="button"')
    }
  })
  it('links the sponsor\'s export to the right record', () => {
    expect(renderToStaticMarkup(React.createElement(PlacementDelivery))).toContain('/api/placement-items/delivery?placement=12&amp;format=csv')
    expect(renderToStaticMarkup(React.createElement(SponsorDelivery))).toContain('/api/placement-items/delivery?sponsor=12&amp;format=csv')
  })
  it('says what to do before the record is saved', () => {
    doc.id = undefined
    expect(renderToStaticMarkup(React.createElement(PlacementDelivery))).toContain('once the placement is saved')
    doc.id = 12
  })
})
