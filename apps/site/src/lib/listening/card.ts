/**
 * A participant's contact card (board 5i): per person, never per table. Three separate choices, all off unless chosen; "may name
 * me" and "keep me anonymous" exclude each other. A way to be reached is not required to say yes to contact: the page warns, the
 * Portal accepts, because some people want only to be named. Pure, so the words and the rules are tested without a page.
 */
export const CARD_FIRST_NAME_MAX = 60
export const CARD_CONTACT_MAX = 320

export interface CardChoices {
  mayContact: boolean
  mayName: boolean
  keepAnonymous: boolean
}

export interface CardInput extends CardChoices {
  firstName: string
  contact: string
}

export type CardCheck = { ok: true; value: { firstName: string; contact: string | null } & CardChoices; warning: string | null } | { ok: false; message: string }

export function checkCard(input: CardInput): CardCheck {
  const firstName = input.firstName.trim()
  const contact = input.contact.trim()
  if (firstName.length === 0) return { ok: false, message: 'Add your first name, as you said it at the table, so a reporter knows who they are asking.' }
  if (firstName.length > CARD_FIRST_NAME_MAX) return { ok: false, message: `Your first name can be at most ${CARD_FIRST_NAME_MAX} characters.` }
  if (contact.length > CARD_CONTACT_MAX) return { ok: false, message: `That is too long for an email address or phone number (at most ${CARD_CONTACT_MAX} characters).` }
  if (input.mayName && input.keepAnonymous) return { ok: false, message: 'Choose either “may name me” or “keep me anonymous”, not both.' }
  const warning = input.mayContact && contact.length === 0 ? 'You said WUWF may contact you, but you left no email or phone number, so there is no way for a reporter to reach you.' : null
  return { ok: true, value: { firstName, contact: contact || null, mayContact: input.mayContact, mayName: input.mayName, keepAnonymous: input.keepAnonymous }, warning }
}

/** Turning one choice on turns off the one it excludes. */
export function toggleChoice(choices: CardChoices, which: keyof CardChoices, on: boolean): CardChoices {
  const next = { ...choices, [which]: on }
  if (which === 'mayName' && on) next.keepAnonymous = false
  if (which === 'keepAnonymous' && on) next.mayName = false
  return next
}

/** What the thank-you page promises, which is exactly what the choices allow and no more. */
export function cardPromise(choices: CardChoices): string {
  if (choices.keepAnonymous) {
    return 'WUWF has your card and will keep you anonymous. If a reporter needs to check something you said, they will ask you first, and never use your name.'
  }
  if (choices.mayContact) {
    return `A reporter will reach out only about something you said, and only before anything is used. ${
      choices.mayName ? 'You said WUWF may name you; they will still check with you first.' : 'You haven’t said WUWF may name you, so you won’t be named.'
    }`
  }
  return 'You haven’t asked to be contacted, so you won’t be. What you said still counts toward what WUWF heard.'
}
