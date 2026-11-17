/** The giving pages. Routes are structure, so they live in code; every label and sentence is in the admin. */
export const GIVING_PATHS = {
  give: '/support',
  ways: '/support/ways',
  legacy: '/support/legacy',
  thanks: '/support/thanks',
} as const

export type GivingPage = keyof typeof GIVING_PATHS

/** The pages that sit in the "Ways to give" strip. The thank-you page is where a gift ends, not a place to browse to, so it is not in it. */
export const GIVING_NAV_PAGES = ['give', 'legacy', 'ways'] as const satisfies readonly GivingPage[]

/** The Give page's gift card, so a link from another page can land on it. */
export const GIVE_HREF = `${GIVING_PATHS.give}#give`
