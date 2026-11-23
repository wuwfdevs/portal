import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { ProfileBandSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(ProfileBandSection, 'sectionProfileBand', block)
const photo = { id: 3, url: '/media/p.jpg', alt: 'Portrait', width: 400, height: 400, mimeType: 'image/jpeg' }

describe('Profile band section', () => {
  it('draws nothing without its own layout\'s content', () => {
    expect(html({ variant: 'about' })).toBe('')
    expect(html({ variant: 'roster' })).toBe('')
    // the other layout's data does not count
    expect(html({ variant: 'about', people: [{ name: 'Someone' }] })).toBe('')
    expect(html({ variant: 'roster', text: 'About text' })).toBe('')
  })
  it('about: paragraphs, and a picture only when there is one', () => {
    const withPic = html({ variant: 'about', heading: { title: 'On the air since 1988' }, text: 'First.\n\nSecond.', image: photo })
    expect(withPic).toContain('On the air since 1988')
    expect(withPic).toContain('<p>First.</p>')
    expect(withPic).toContain('<p>Second.</p>')
    expect(withPic).toContain('<img')
    expect(html({ variant: 'about', text: 'Words', image: 12 })).not.toContain('<img')
  })
  it('roster: a person needs a name; a deleted photo leaves the name and role', () => {
    const out = html({ variant: 'roster', tone: 'grey', people: [{ name: 'Tanya Gallagher', role: 'Host', photo }, { name: 'Will Howell', role: 'Reporter', photo: 99 }, { role: 'No name' }, null] })
    expect(out).toContain('Tanya Gallagher')
    expect(out).toContain('Will Howell')
    expect(out).toContain('Reporter')
    expect(out).not.toContain('No name')
    expect(out.match(/<img/g)?.length).toBe(1)
  })
  it('draws its one link, in either layout, only with a label and a safe address', () => {
    expect(html({ variant: 'about', text: 'Words', moreLabel: 'The story of RadioLive', moreHref: '/radiolive-story' })).toContain('href="/radiolive-story"')
    expect(html({ variant: 'roster', people: [{ name: 'Someone' }], moreLabel: 'Meet everyone', moreHref: '/about' })).toContain('Meet everyone')
    expect(html({ variant: 'about', text: 'Words', moreLabel: 'Bad', moreHref: 'javascript:alert(1)' })).not.toContain('Bad')
  })
})
