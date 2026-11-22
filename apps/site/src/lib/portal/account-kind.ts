// How a staff account is linked to the Portal, in the words the staff list shows. Pure.

/** For an account made through the Portal's Website tool: its roles come from the Portal's grant on every sign-in, and it can write listening queries. */
export const PORTAL_LINKED = 'Linked'

/**
 * For an account with no Portal profile behind it: the local break-glass administrator, or one made by hand. It signs in with its own password at `/admin`, keeps the
 * roles it was given, and cannot write listening queries (the Portal needs a named person to check).
 */
export const PORTAL_NOT_LINKED = 'None (local password)'

export function portalLinkLabel(portalUserId: string | null | undefined): string {
  return portalUserId ? PORTAL_LINKED : PORTAL_NOT_LINKED
}
