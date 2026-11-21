/** The giving pages' addresses. They are records in `pages` (the giving set); two of them, ways and thanks, are also coded shells that render their record with the request's query (`app/(frontend)/support`). */
export const GIVING_PATHS = {
  give: '/support',
  ways: '/support/ways',
  legacy: '/support/legacy',
  thanks: '/support/thanks',
} as const

export type GivingPage = keyof typeof GIVING_PATHS

/** The Give page's gift card, so a link from another page can land on it. */
export const GIVE_HREF = `${GIVING_PATHS.give}#give`
