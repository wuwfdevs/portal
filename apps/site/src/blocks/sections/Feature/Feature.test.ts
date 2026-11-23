import { describe, expect, it, vi } from 'vitest'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { renderBlock, testContext } from '../testing'
import { FeatureSection, frameSource } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(FeatureSection, 'sectionFeature', block)
const picture = { id: 4, url: '/media/lead.jpg', alt: 'A guitarist on stage', width: 1200, height: 800, mimeType: 'image/jpeg' }

describe('Feature section', () => {
  it('draws nothing without a headline', () => {
    expect(html({})).toBe('')
    expect(html({ headline: '   ', line: 'Only a line' })).toBe('')
  })
  it('hero: one h1, the label, the line and the buttons, in a band with its anchor and tone', () => {
    const out = html({
      variant: 'hero', anchor: 'top', tone: 'dark', label: 'Next show · Thursday', headline: 'Save your seat', line: 'Three artists.',
      actions: [{ label: 'Reserve', href: '/radiolive#tickets' }, { label: 'Watch', href: 'https://example.org/w' }],
    })
    expect(out).toContain('<h1')
    expect(out).not.toContain('<h2')
    expect(out).toContain('id="top"')
    expect(out).toContain('data-tone="dark"')
    for (const s of ['Next show · Thursday', 'Save your seat', 'Three artists.', 'Reserve', 'Watch']) expect(out).toContain(s)
    expect(out).toContain('href="/radiolive#tickets"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('split: an h2, and the picture and its side and ratio only here', () => {
    const left = html({ variant: 'split', headline: 'Tunnel Vision', image: picture, ratio: 'portrait', imageSide: 'left' })
    expect(left).toContain('<h2')
    expect(left).not.toContain('<h1')
    expect(left).toContain('aspect-[4/5]')
    expect(left).toContain('md:order-2')
    const right = html({ variant: 'split', headline: 'Tunnel Vision', image: picture, ratio: 'wide' })
    expect(right).toContain('aspect-video')
    expect(right).not.toContain('md:order-2')
  })
  it('hero ignores the split-only fields it still holds', () => {
    const out = html({ variant: 'hero', headline: 'H', image: picture, ratio: 'portrait', imageSide: 'left' })
    expect(out).not.toContain('aspect-[4/5]')
    expect(out).not.toContain('md:order-')
  })
  it('keeps the words when the picture or audio was deleted (a bare id)', () => {
    for (const variant of ['hero', 'split']) {
      const out = html({ variant, headline: 'Still here', image: 7, audio: 9 })
      expect(out).toContain('Still here')
      expect(out).not.toContain('<img')
      expect(out).not.toContain('<button')
    }
  })
  it('falls back to the standard ratio for a ratio it does not know', () => {
    expect(html({ variant: 'split', headline: 'H', image: picture, ratio: 'enormous' })).toContain('aspect-[4/3]')
  })
  it('draws no button for an unsafe address or a missing label', () => {
    const out = html({ headline: 'H', actions: [{ label: 'Bad', href: 'javascript:alert(1)' }, { label: '', href: '/ok' }, { label: 'Fine', href: '/fine' }] })
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('Bad')
    expect(out).toContain('href="/fine"')
    expect(out).not.toContain('href="/ok"')
  })
})

describe('Feature section: a line of several paragraphs', () => {
  it('draws each paragraph on its own', () => {
    const out = html({ headline: 'H', line: 'First paragraph.\n\nSecond paragraph.' })
    expect(out).toContain('<p>First paragraph.</p>')
    expect(out).toContain('<p>Second paragraph.</p>')
  })
})

describe('Feature section: a panel beside the hero', () => {
  it('draws up to four figures and their note beside the words', () => {
    const out = html({ variant: 'hero', headline: 'H', aside: 'figures', figures: [{ value: '22,500', text: 'listen weekly' }, { value: '79%', text: 'think highly' }, { value: '', text: 'no number' }], asideNote: 'Source: Nielsen.' })
    expect(out).toContain('22,500')
    expect(out).toContain('79%')
    expect(out).not.toContain('no number')
    expect(out).toContain('Source: Nielsen.')
  })
  it('draws a sample sentence in a card, and nothing when the aside is none or empty', () => {
    const out = html({ variant: 'hero', headline: 'H', aside: 'quote', asideLabel: 'What it sounds like', asideText: '“Support comes from Example.”', asideNote: 'Not a real sponsor.' })
    expect(out).toContain('What it sounds like')
    expect(out).toContain('Support comes from Example.')
    expect(html({ variant: 'hero', headline: 'H', aside: 'none', figures: [{ value: '1', text: 'a' }] })).not.toContain('<li')
    expect(html({ variant: 'hero', headline: 'H', aside: 'quote' })).not.toContain('<figure')
  })
})

describe('Feature video frame (hubs redesign)', () => {
  const file = { id: 9, url: '/video/set.mp4', title: 'The set', mimeType: 'video/mp4' }
  it('a YouTube address makes the picture a still with a play button, and loads nothing from the host', () => {
    const out = html({ variant: 'split', headline: 'The Emerald Coast Strings', image: picture, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    expect(out).toContain('aria-label="Play video: The Emerald Coast Strings"')
    expect(out).toContain('lead.jpg')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('youtube')
    expect(out).toContain('aspect-video')
  })
  it('a library file wins over an address', () => {
    expect(frameSource({ video: file, videoUrl: 'https://vimeo.com/123456789' })).toEqual({ kind: 'file', url: '/video/set.mp4', mimeType: 'video/mp4' })
  })
  it('an address becomes the site\'s own embed address, never the pasted one', () => {
    expect(frameSource({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5' })).toEqual({ kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5' })
  })
  it('refuses an address that is not one video on YouTube or Vimeo, and a deleted file (a bare id), leaving the picture alone', () => {
    expect(frameSource({ videoUrl: 'https://example.org/clip' })).toBeNull()
    expect(frameSource({ videoUrl: 'https://www.youtube.com/playlist?list=PLabc' })).toBeNull()
    expect(frameSource({ video: 12 })).toBeNull()
    const out = html({ variant: 'split', headline: 'H', image: picture, video: 12, ratio: 'portrait' })
    expect(out).not.toContain('Play video')
    expect(out).toContain('aspect-[4/5]')
  })
  it('a video alone, with no picture, still draws a frame; the hero draws it below the headline', () => {
    expect(html({ variant: 'split', headline: 'H', videoUrl: 'https://vimeo.com/123456789' })).toContain('Play video: H')
    expect(html({ variant: 'hero', headline: 'H', videoUrl: 'https://vimeo.com/123456789' })).toContain('Play video: H')
  })
  it('the hero title reads the theme\'s display style and colour, which fall back to the band\'s text', () => {
    const out = html({ variant: 'hero', headline: 'Unearthing Florida' })
    expect(out).toContain('[font-style:var(--tone-display-style,normal)]')
    expect(out).toContain('[color:var(--tone-display,var(--tone-text))]')
  })
})

// The control itself is an async server component (`LatestPlay.test.ts`); here a marker stands in for it, to check that Feature places it with the page's show and the right words.
vi.mock('./LatestPlay', () => ({ LatestPlay: (props: { showId: number; label: string }) => createElement('i', { 'data-latest': props.showId }, props.label) }))

describe('Feature "Play the latest" (a show\'s newest episode)', () => {
  const draw = (block: Record<string, unknown>, show?: { id: number }) =>
    renderToStaticMarkup(FeatureSection({ block: { blockType: 'sectionFeature', headline: 'Unearthing Florida', variant: 'hero', ...block } as never, context: { ...testContext, ...(show ? { show } : {}) } }) as never)
  it('puts the control in the words, for the page\'s show, with the default or the editor\'s words', () => {
    expect(draw({ playLatest: true }, { id: 7 })).toContain('<i data-latest="7">Play the latest</i>')
    expect(draw({ playLatest: true, playLatestLabel: ' Hear the newest ' }, { id: 7 })).toContain('>Hear the newest</i>')
  })
  it('draws no control when it is not asked for, or when the page speaks for no show', () => {
    expect(draw({ playLatest: false }, { id: 7 })).not.toContain('data-latest')
    expect(draw({ playLatest: true })).not.toContain('data-latest')
  })
})

describe('Feature "latest recorded RadioLive set" (hubs redesign, slice 4)', () => {
  const set = { title: 'The Emerald Coast Strings with Jesse Bumann', when: 'Nov 6, 2026', description: 'Recorded before a full house.', href: '/radiolive/emerald-coast', photo: null, frame: { kind: 'file' as const, url: '/media/set.mp4', mimeType: 'video/mp4', captionsHref: '/radiolive/emerald-coast/captions.vtt' } }
  const draw = (block: Record<string, unknown>, s: typeof set | null) =>
    renderToStaticMarkup(FeatureSection({ block: { blockType: 'sectionFeature', headline: 'RadioLive', variant: 'split', latestSet: true, label: 'typed label', ...block } as never, context: testContext, set: s }) as never)
  it('takes its label, headline and line from the set, and links to the set\'s page after the typed buttons', () => {
    const out = draw({ line: 'typed line', actions: [{ label: 'Watch past shows', href: '#watch' }] }, set)
    expect(out).toContain('Latest set · recorded Nov 6, 2026')
    expect(out).toContain('The Emerald Coast Strings with Jesse Bumann')
    expect(out).toContain('Recorded before a full house.')
    expect(out).not.toContain('typed label')
    expect(out).not.toContain('typed line')
    expect(out.indexOf('Watch past shows')).toBeLessThan(out.indexOf('About this show'))
    expect(out).toContain('href="/radiolive/emerald-coast"')
  })
  it('draws the video as a frame with a play button (nothing from the recording is requested before it is pressed)', () => {
    const out = draw({}, set)
    expect(out).toContain('Play video: The Emerald Coast Strings with Jesse Bumann')
    expect(out).not.toContain('<video')
    expect(out).not.toContain('/media/set.mp4')
  })
  it('keeps the typed words when there is no recorded set yet', () => {
    const out = draw({ headline: 'RadioLive' }, null)
    expect(out).toContain('typed label')
    expect(out).toContain('RadioLive')
    expect(out).not.toContain('About this show')
  })
})

describe('Feature "lead with the show\'s latest episode"', () => {
  const episode = { title: 'The council house at Fort Walton', when: 'Nov 4, 2026', description: 'A house older than the county.', href: '/shows/unearthing-florida/2026-11-04/council-house', photo: null, track: { id: 'audio-1', src: 'https://files.example/ep.mp3', title: 'The council house at Fort Walton', credit: null, durationSeconds: 600, href: '/shows/unearthing-florida/2026-11-04/council-house' } }
  const draw = (block: Record<string, unknown>, e: typeof episode | null, show: { id: number } | undefined = { id: 7 }) =>
    renderToStaticMarkup(FeatureSection({ block: { blockType: 'sectionFeature', headline: 'Unearthing Florida', variant: 'hero', latestEpisode: true, label: 'typed label', line: 'typed line', playLatest: true, ...block } as never, context: { ...testContext, ...(show ? { show } : {}) }, episode: e }) as never)
  it('takes its label, headline and line from the episode, and links to the episode after the typed buttons', () => {
    const out = draw({ actions: [{ label: 'Explore the map of sites', href: '#explore' }] }, episode)
    expect(out).toContain('Latest episode · Nov 4, 2026')
    expect(out).toContain('The council house at Fort Walton')
    expect(out).toContain('A house older than the county.')
    expect(out).not.toContain('Unearthing Florida')
    expect(out).not.toContain('typed label')
    expect(out).not.toContain('typed line')
    expect(out).toContain('href="/shows/unearthing-florida/2026-11-04/council-house"')
  })
  it('puts one main action first: Play is the filled button, the episode link the outline button, and the typed action a plain link after them', () => {
    const out = draw({ actions: [{ label: 'Explore the map of sites', href: '#explore' }] }, episode)
    expect(out.indexOf('Listen: The council house at Fort Walton')).toBeGreaterThan(-1)
    expect(out.indexOf('Listen: The council house at Fort Walton')).toBeLessThan(out.indexOf('About this episode'))
    expect(out.indexOf('About this episode')).toBeLessThan(out.indexOf('Explore the map of sites'))
    // The episode link is the outline button (a ring), and the typed action is a link, not a button.
    expect(out).toMatch(/<a[^>]*class="[^"]*shadow-\[inset[^"]*"[^>]*>About this episode/)
    expect(out).not.toMatch(/<a[^>]*rounded-pill[^>]*>Explore the map of sites/)
    expect(out).toMatch(/<a[^>]*underline[^>]*>Explore the map of sites/)
  })
  it('draws one play button, for the episode, and not the separate "Play the latest" control', () => {
    const out = draw({}, episode)
    expect(out).toContain('The council house at Fort Walton')
    expect(out).not.toContain('data-latest')
  })
  it('makes the episode link the filled button when its audio cannot be played, with the typed action still a link', () => {
    const out = draw({ actions: [{ label: 'Explore the map of sites', href: '#explore' }] }, { ...episode, track: null as never })
    expect(out).toContain('The council house at Fort Walton')
    expect(out).not.toContain('Listen:')
    expect(out).toMatch(/<a[^>]*class="[^"]*rounded-pill[^"]*"[^>]*>About this episode/)
    expect(out).not.toMatch(/<a[^>]*class="[^"]*shadow-\[inset[^"]*"[^>]*>About this episode/)
    expect(out).toMatch(/<a[^>]*underline[^>]*>Explore the map of sites/)
  })
  it('keeps the typed actions as buttons (the first filled) when there is no episode yet', () => {
    const out = draw({ actions: [{ label: 'Explore the map of sites', href: '#explore' }] }, null)
    expect(out).toMatch(/<a[^>]*rounded-pill[^>]*>Explore the map of sites/)
  })
  it('keeps the typed words when the show has no episode yet', () => {
    const out = draw({}, null)
    expect(out).toContain('Unearthing Florida')
    expect(out).toContain('typed label')
    expect(out).not.toContain('About this episode')
  })
})

describe('Feature split as the page\'s title', () => {
  const draw = (block: Record<string, unknown>) => renderToStaticMarkup(FeatureSection({ block: { blockType: 'sectionFeature', headline: 'The council house', variant: 'split', ...block } as never, context: testContext }) as never)
  it('draws a split\'s headline as a section heading unless it is marked as the page\'s title', () => {
    expect(draw({})).toMatch(/<h2[^>]*>The council house<\/h2>/)
    expect(draw({})).not.toContain('<h1')
  })
  it('draws the page\'s one h1, in the theme\'s display title, when it is marked', () => {
    const out = draw({ pageTitle: true })
    expect(out).toMatch(/<h1[^>]*>The council house<\/h1>/)
    expect(out).not.toContain('<h2')
    expect(out).toContain('[font-style:var(--tone-display-style,normal)]')
  })
  it('leaves a hero\'s headline the page\'s title whether or not it is marked', () => {
    expect(draw({ variant: 'hero' })).toMatch(/<h1[^>]*>The council house<\/h1>/)
  })
})
