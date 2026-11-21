import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'

import { ImageMedia } from './index'

// A picture cropped to fit follows the editor's focal point; a picture shown whole, or without one, is left alone.

const media = (focal: { focalX?: number | null; focalY?: number | null } = {}) =>
  ({ id: 1, alt: 'photo', url: '/media/a.jpg', width: 1200, height: 800, mimeType: 'image/jpeg', updatedAt: '2026-01-01', createdAt: '2026-01-01', ...focal }) as unknown as Media

const html = (resource: Media, imgClassName: string) => renderToStaticMarkup(React.createElement(ImageMedia, { resource, imgClassName, size: '100vw' }))

describe('ImageMedia focal point', () => {
  it('crops around the focal point when the picture is cropped to fit', () => {
    expect(html(media({ focalX: 30, focalY: 80 }), 'absolute inset-0 size-full object-cover')).toContain('object-position:30% 80%')
  })

  it('leaves a picture shown whole where it is', () => {
    expect(html(media({ focalX: 30, focalY: 80 }), 'size-full object-contain')).not.toContain('object-position')
  })

  it('crops around the middle when no focal point is set', () => {
    expect(html(media(), 'size-full object-cover')).not.toContain('object-position')
    expect(html(media({ focalX: null, focalY: null }), 'size-full object-cover')).not.toContain('object-position')
  })

  it('honours a focal point at the very edge', () => {
    expect(html(media({ focalX: 0, focalY: 0 }), 'size-full object-cover')).toContain('object-position:0% 0%')
  })
})
