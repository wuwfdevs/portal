import {
  LISTENING_HOST_EXPECTED,
  LISTENING_HOST_KINDS,
  LISTENING_HOST_SEATS,
  LISTENING_INBOX_KINDS,
  MAX_EMAIL_LENGTH,
  MAX_INBOX_BODY_LENGTH,
  type ListeningHostExpected,
  type ListeningHostKind,
  type ListeningHostSeats,
  type ListeningInboxKind,
} from '@wuwf/portal-contracts'

/**
 * The two standing inboxes (suite design §2, phase C): Ask WUWF, and the request to host a listening session. Pure: no
 * Portal, no React. The server actions check what a browser sends with these, and the forms use them to say what is wrong in
 * words before anything is sent. The Portal checks again, and is the authority.
 *
 * Nothing here promises a reply: the host form says someone will write back within a week because the board does, and the
 * Portal's staff list flags a request that waits longer; Ask WUWF says only that a person reads every one.
 */

export const ASK_KIND_LABEL: Record<ListeningInboxKind, string> = {
  question: 'I have a question',
  story_idea: 'I have a story idea',
}

export const HOST_KIND_LABEL: Record<ListeningHostKind, { title: string; hint: string }> = {
  invite: { title: 'A table of people I invite', hint: 'Friends, neighbours or colleagues. Not listed publicly.' },
  public: { title: 'An open session', hint: 'Open to anyone. WUWF reviews it before it is listed.' },
}

export const HOST_SEATS_LABEL: Record<ListeningHostSeats, string> = {
  12: 'Up to 12 seats',
  30: 'Up to 30 seats',
  60: 'Up to 60 seats',
}

export const HOST_EXPECTED_LABEL: Record<ListeningHostExpected, string> = {
  '6-8': '6 to 8 people',
  '9-12': '9 to 12 people',
  '12+': 'More than 12 people',
}

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Whether a string looks like an email address. The Portal and the database use the same shape. */
export function looksLikeEmail(value: string): boolean {
  const text = value.trim()
  return text.length > 0 && text.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(text)
}

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string }

const text = (value: unknown): string | null => (typeof value === 'string' ? value.trim() : null)

export interface AskMessage {
  kind: ListeningInboxKind
  body: string
  email: string | null
}

/** An Ask WUWF message: a kind, 1 to 2,000 characters, and an optional email that must look like one if given. */
export function checkAskMessage(input: unknown): Checked<AskMessage> {
  const record = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const kind = LISTENING_INBOX_KINDS.find((k) => k === record['kind'])
  if (!kind) return { ok: false, message: 'Choose whether this is a question or a story idea.' }
  const body = text(record['body'])
  if (body === null || body.length === 0) return { ok: false, message: 'Write your question or idea first.' }
  if (body.length > MAX_INBOX_BODY_LENGTH) return { ok: false, message: `Keep it to ${MAX_INBOX_BODY_LENGTH.toLocaleString('en-US')} characters or fewer.` }
  const rawEmail = record['email']
  if (rawEmail !== undefined && rawEmail !== null && typeof rawEmail !== 'string') return { ok: false, message: 'That email address does not look right.' }
  const email = text(rawEmail) || null
  if (email !== null && !looksLikeEmail(email)) return { ok: false, message: 'That email address does not look right. Leave it blank if you would rather not say.' }
  return { ok: true, value: { kind, body, email } }
}

export interface HostRequest {
  name: string
  email: string
  kind: ListeningHostKind
  organization: string | null
  seats: ListeningHostSeats
  address: string
  expected: ListeningHostExpected
  whenText: string
  inviteesText: string | null
  journalistRequested: boolean
}

const HOST_LIMITS = { name: 200, organization: 200, address: 500, whenText: 500, inviteesText: 2000 } as const

/** A host request, every field picked by name (nothing a browser sends is spread into the signed body) and checked. */
export function checkHostRequest(input: unknown): Checked<HostRequest> {
  const r = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const required = (key: 'name' | 'address' | 'whenText', missing: string): Checked<string> => {
    const value = text(r[key])
    if (value === null || value.length === 0) return { ok: false, message: missing }
    if (value.length > HOST_LIMITS[key]) return { ok: false, message: `That is longer than the ${HOST_LIMITS[key]} characters we can take.` }
    return { ok: true, value }
  }
  const optional = (key: 'organization' | 'inviteesText'): Checked<string | null> => {
    const raw = r[key]
    if (raw !== undefined && raw !== null && typeof raw !== 'string') return { ok: false, message: 'Something in that form was not right. Reload the page and try again.' }
    const value = text(raw) || null
    if (value !== null && value.length > HOST_LIMITS[key]) return { ok: false, message: `That is longer than the ${HOST_LIMITS[key]} characters we can take.` }
    return { ok: true, value }
  }

  const name = required('name', 'Tell us your name.')
  if (!name.ok) return name
  const emailText = text(r['email'])
  if (emailText === null || emailText.length === 0) return { ok: false, message: 'Tell us an email address so someone can write back.' }
  if (!looksLikeEmail(emailText)) return { ok: false, message: 'That email address does not look right.' }
  const kind = LISTENING_HOST_KINDS.find((k) => k === r['kind'])
  if (!kind) return { ok: false, message: 'Choose what kind of session this would be.' }
  const seats = LISTENING_HOST_SEATS.find((n) => n === r['seats'])
  if (!seats) return { ok: false, message: 'Choose how many seats you could offer.' }
  const expected = LISTENING_HOST_EXPECTED.find((e) => e === r['expected'])
  if (!expected) return { ok: false, message: 'Choose how many people you expect.' }
  const address = required('address', 'Tell us where it would be.')
  if (!address.ok) return address
  const whenText = required('whenText', 'Tell us roughly when you have in mind.')
  if (!whenText.ok) return whenText
  const organization = optional('organization')
  if (!organization.ok) return organization
  const invitees = optional('inviteesText')
  if (!invitees.ok) return invitees
  if (typeof r['journalistRequested'] !== 'boolean') return { ok: false, message: 'Something in that form was not right. Reload the page and try again.' }

  return {
    ok: true,
    value: {
      name: name.value,
      email: emailText,
      kind,
      organization: organization.value,
      seats,
      address: address.value,
      expected,
      whenText: whenText.value,
      inviteesText: invitees.value,
      journalistRequested: r['journalistRequested'],
    },
  }
}
