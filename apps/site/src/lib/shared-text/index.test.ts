import { describe, expect, it } from 'vitest'

import { calendarGuidelinesOf, fellowshipPolicyOf, linkEmails, membershipAppealOf } from './index'
import { STARTER_CALENDAR_GUIDELINES, STARTER_FELLOWSHIP_POLICY, STARTER_MEMBERSHIP_APPEAL } from './starter'

describe('shared text: the starting words read back as they were typed', () => {
  it('keeps every guideline paragraph and lead-in', () => {
    const g = calendarGuidelinesOf(STARTER_CALENDAR_GUIDELINES)
    expect(g?.title).toBe('Community calendar guidelines')
    expect(g?.paragraphs).toHaveLength(5)
    expect(g?.paragraphs.map((p) => p.lead)).toEqual(['', '', 'Submitting community announcements.', 'Deadlines.', 'What’s permissible.'])
  })
  it('keeps the appeal and its button', () => {
    expect(membershipAppealOf(STARTER_MEMBERSHIP_APPEAL)).toEqual({
      text: 'Reporting like this takes weeks on one street. Members make it possible.',
      button: { label: 'Become a member', href: '/support' },
    })
  })
  it('keeps the three fellowship items and the policy link label', () => {
    const p = fellowshipPolicyOf(STARTER_FELLOWSHIP_POLICY)
    expect(p?.items.map((i) => i.term)).toEqual(['Who decides', 'What funders get', 'If we cover a funder'])
    expect(p?.linkLabel).toBe('Read our editorial independence policy')
  })
})

describe('shared text: what is missing is left out', () => {
  it('draws nothing from empty or malformed values', () => {
    expect(calendarGuidelinesOf(null)).toBeNull()
    expect(calendarGuidelinesOf({ paragraphs: [{ text: '  ' }, 'x', null] })).toBeNull()
    expect(membershipAppealOf({ text: '   ' })).toBeNull()
    expect(fellowshipPolicyOf({ items: [{ term: 'Only a term' }] })).toBeNull()
  })
  it('drops the button when its link is not safe or its label is empty', () => {
    expect(membershipAppealOf({ text: 'Hi', buttonLabel: 'Go', buttonHref: 'javascript:alert(1)' })?.button).toBeNull()
    expect(membershipAppealOf({ text: 'Hi', buttonLabel: '', buttonHref: '/support' })?.button).toBeNull()
    expect(membershipAppealOf({ text: 'Hi', buttonLabel: 'Go', buttonHref: '//evil.example' })?.button).toBeNull()
  })
  it('falls back to the section titles when a title is cleared', () => {
    expect(calendarGuidelinesOf({ title: '', paragraphs: [{ text: 'x' }] })?.title).toBe('Community calendar guidelines')
    expect(fellowshipPolicyOf({ title: '', items: [{ term: 'a', text: 'b' }] })?.title).toBe('How the fellowship works')
  })
})

describe('linkEmails', () => {
  it('splits typed text around an address and links only the address', () => {
    expect(linkEmails('write to margaret@wuwf.org or call')).toEqual([
      { kind: 'text', text: 'write to ' },
      { kind: 'email', email: 'margaret@wuwf.org' },
      { kind: 'text', text: ' or call' },
    ])
  })
  it('leaves text with no address whole, and takes no query or second address into a link', () => {
    expect(linkEmails('no address here')).toEqual([{ kind: 'text', text: 'no address here' }])
    const parts = linkEmails('a@b.org?bcc=c@d.org')
    expect(parts.filter((p) => p.kind === 'email').map((p) => (p as { email: string }).email)).toEqual(['a@b.org', 'c@d.org'])
  })
  it('keeps every typed character', () => {
    const typed = 'Mail margaret@wuwf.org, or (850) 473-7453.'
    expect(linkEmails(typed).map((p) => (p.kind === 'text' ? p.text : p.email)).join('')).toBe(typed)
  })
})
