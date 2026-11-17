/** The six sponsorship pages. Routes are structure, so they live in code; every label and sentence is in the admin. */
export const SPONSOR_PATHS = {
  hub: '/sponsor',
  onAir: '/sponsor/on-air',
  digital: '/sponsor/digital',
  events: '/sponsor/events',
  audience: '/sponsor/audience',
  guidelines: '/sponsor/credit-guidelines',
} as const

export type SponsorPage = keyof typeof SPONSOR_PATHS

export const INQUIRE_HREF = `${SPONSOR_PATHS.hub}#inquire`
