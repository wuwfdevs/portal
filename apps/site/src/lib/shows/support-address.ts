// The donation form address a show's pages use for "Give": the production's own (`showSupport.donateUrl`, WUWF's donation form with the show's attribution code built in), or nothing,
// in which case the page falls back to the station's form (the Giving settings). Pure.

import { supportHref } from '@/lib/support-link'

/** The safe address of the production's donation form with its attribution code, or null (empty, or not an address the site will link to). */
export function showDonationHref(production: { showSupport?: { donateUrl?: string | null } | null } | null | undefined): string | null {
  return supportHref(production?.showSupport?.donateUrl)
}
