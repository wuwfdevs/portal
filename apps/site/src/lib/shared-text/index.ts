import { supportHref } from '@/lib/support-link'

// The Shared text global's words, read the way a block reads: whatever is missing or empty is left out, and a link is drawn only when it
// passes the same check the field applies. Pure TypeScript, so the pages that draw these can be tested with fixtures.

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null) : []
const group = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

export interface CalendarGuidelines {
  title: string
  paragraphs: { lead: string; text: string }[]
}

/** The community calendar's guidelines: nothing when there are no paragraphs (the page then draws no panel). */
export function calendarGuidelinesOf(raw: unknown): CalendarGuidelines | null {
  const g = group(raw)
  const paragraphs = rows(g.paragraphs)
    .map((p) => ({ lead: str(p.lead), text: str(p.text) }))
    .filter((p) => p.text !== '')
  if (paragraphs.length === 0) return null
  return { title: str(g.title) || 'Community calendar guidelines', paragraphs }
}

export interface MembershipAppeal {
  text: string
  button: { label: string; href: string } | null
}

/** The appeal under a story and on the home page: nothing when its words are empty. The button needs a label and a link that passes. */
export function membershipAppealOf(raw: unknown): MembershipAppeal | null {
  const g = group(raw)
  const text = str(g.text)
  if (!text) return null
  const label = str(g.buttonLabel)
  const href = supportHref(str(g.buttonHref))
  return { text, button: label && href ? { label, href } : null }
}

export interface FellowshipPolicy {
  title: string
  items: { term: string; text: string }[]
  linkLabel: string
}

/** "How the fellowship works": nothing when no item has words. */
export function fellowshipPolicyOf(raw: unknown): FellowshipPolicy | null {
  const g = group(raw)
  const items = rows(g.items)
    .map((i) => ({ term: str(i.term), text: str(i.text) }))
    .filter((i) => i.term !== '' && i.text !== '')
  if (items.length === 0) return null
  return { title: str(g.title) || 'How the fellowship works', items, linkLabel: str(g.linkLabel) || 'Read our editorial independence policy' }
}

export type TextPart = { kind: 'text'; text: string } | { kind: 'email'; email: string }

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

/**
 * Splits typed text where it holds an email address, so the page can draw it as a mailto link. Only the matched address becomes a link
 * (never anything else the editor typed), and the address is the letters, digits and `. _ % + -` of the pattern, so it cannot carry a
 * query or a second address.
 */
export function linkEmails(value: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of value.matchAll(EMAIL)) {
    const at = match.index ?? 0
    if (at > last) parts.push({ kind: 'text', text: value.slice(last, at) })
    parts.push({ kind: 'email', email: match[0] })
    last = at + match[0].length
  }
  if (last < value.length) parts.push({ kind: 'text', text: value.slice(last) })
  return parts
}
