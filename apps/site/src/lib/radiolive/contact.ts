// A public contact line for a membership level ("contact Name at email or phone"), checked before it becomes a link. Staff type these into the admin, so a value
// is checked on the way in (the field validator) and again when rendered. Pure.

const EMAIL = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/

/** `mailto:` for a plain email address, or null for anything else (no names, no extra recipients, no query). */
export function mailtoOf(email: string | null | undefined): string | null {
  const value = email?.trim() ?? ''
  return EMAIL.test(value) ? `mailto:${value}` : null
}

/** `tel:` for a phone number with 10 to 15 digits (a leading + kept), or null. */
export function telOf(phone: string | null | undefined): string | null {
  const value = phone?.trim() ?? ''
  if (!/^[+()\d.\s-]+$/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return `tel:${value.startsWith('+') ? '+' : ''}${digits}`
}

export const validateEmail = (value: string | null | undefined): true | string => (!value || value.trim() === '' || mailtoOf(value) ? true : 'Use one plain email address, like name@example.org.')
export const validatePhone = (value: string | null | undefined): true | string => (!value || value.trim() === '' || telOf(value) ? true : 'Use a phone number with 10 digits or more, like 850-555-0123.')
