/** The slug of the "The Voyager" publishing identity (derived from its name; the staging seed and the underwriting tests use the same). */
export const VOYAGER_IDENTITY_SLUG = 'the-voyager'

/** What a story marks itself with, in feeds and on its page: student work, published under WUWF's applied-learning partnership with The Voyager. */
export const VOYAGER_BADGE_LABEL = 'The Voyager · Student journalism'

/**
 * True when a story's publishing identity is The Voyager. Needs the identity loaded (depth 1); a bare id, null or another
 * identity is false, so a feed that did not load it simply shows no badge rather than a wrong one.
 */
export function isVoyagerIdentity(identity: unknown): boolean {
  return typeof identity === 'object' && identity !== null && (identity as { slug?: unknown }).slug === VOYAGER_IDENTITY_SLUG
}
