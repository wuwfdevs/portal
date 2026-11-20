import { describe, expect, it } from 'vitest'

import { fillsFrame, isStillPicture, STILL_IMAGE_TYPES } from './media'
import { placementTiles } from './tiles'

const tile = (image: unknown, phoneImage?: unknown) => ({ kind: 'sponsor' as const, sponsor: 'Acme', enabled: true, href: 'https://acme.example/', alt: 'Acme', image: image as never, phoneImage: phoneImage as never })
const png = { id: 1, url: '/media/a.png', mimeType: 'image/png' }
const NOW = new Date('2026-11-18T18:00:00Z')

describe('isStillPicture', () => {
  it('takes PNG, JPEG, WebP and AVIF', () => {
    for (const t of STILL_IMAGE_TYPES) expect(isStillPicture({ mimeType: t }), t).toBe(true)
    expect(isStillPicture({ mimeType: 'IMAGE/PNG' })).toBe(true)
  })
  it('refuses video, animated pictures and SVG, which the site would play, animate or fail to draw', () => {
    for (const t of ['video/mp4', 'video/webm', 'image/gif', 'image/svg+xml', 'audio/mpeg', 'application/pdf']) expect(isStillPicture({ mimeType: t }), t).toBe(false)
  })
  it('leaves a record with no recorded type to the admin\'s check, and refuses what is not a record', () => {
    expect(isStillPicture({ mimeType: null })).toBe(true)
    expect(isStillPicture({})).toBe(true)
    expect(isStillPicture(null)).toBe(false)
    expect(isStillPicture(undefined)).toBe(false)
  })
})

describe('fillsFrame', () => {
  const frame = { width: 880, height: 704 }
  it('is true for a picture of the frame\'s own shape, at any size, and for one within a few percent of it', () => {
    expect(fillsFrame({ width: 880, height: 704 }, frame)).toBe(true)
    expect(fillsFrame({ width: 1760, height: 1408 }, frame)).toBe(true)
    expect(fillsFrame({ width: 1760, height: 1390 }, frame)).toBe(true)
  })
  it('is false for a picture of another shape, which gets a backdrop behind it', () => {
    expect(fillsFrame({ width: 1000, height: 400 }, frame)).toBe(false)
    expect(fillsFrame({ width: 600, height: 900 }, frame)).toBe(false)
    expect(fillsFrame({ width: 880, height: 600 }, frame)).toBe(false)
  })
  it('is false when the size is missing, zero or not a number, so a picture of unknown shape still gets a backdrop', () => {
    for (const m of [null, undefined, {}, { width: 1000 }, { width: 0, height: 400 }, { width: 1000, height: -1 }, { width: Number.NaN, height: 400 }, { width: null, height: null }]) {
      expect(fillsFrame(m, frame)).toBe(false)
    }
  })
})

describe('what is drawn', () => {
  it('draws a still picture', () => {
    expect(placementTiles('home.rail', [tile(png)], NOW)).toHaveLength(1)
  })
  it('never draws a video or an animated picture as a tile, even one chosen before the rule existed', () => {
    expect(placementTiles('home.rail', [tile({ id: 2, url: '/media/v.mp4', mimeType: 'video/mp4' })], NOW)).toEqual([])
    expect(placementTiles('home.rail', [tile({ id: 3, url: '/media/a.gif', mimeType: 'image/gif' })], NOW)).toEqual([])
  })
  it('does not use a video as a banner\'s phone picture, but still draws the banner with its wide picture', () => {
    const [banner] = placementTiles('home.band', [tile(png, { id: 4, url: '/media/v.mp4', mimeType: 'video/mp4' })], NOW)
    expect(banner?.phoneImage).toBeNull()
    expect(banner?.image).toEqual(png)
  })
})
