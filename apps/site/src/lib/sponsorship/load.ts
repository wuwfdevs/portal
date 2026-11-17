import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getCachedGlobal } from '@/utilities/getGlobals'

import type { SponsorshipContent } from './content'
import { openPrograms, type ProgramView } from './programs'

export type SponsorshipPageData = { content: SponsorshipContent; programs: ProgramView[]; interests: string[]; budgets: string[] }

/** Used only when the admin's messages are empty or unreadable, so a visitor is never told nothing. */
const FALLBACK_NOT_SET_UP = 'Online requests are not set up yet, so nothing was sent. Please contact WUWF corporate support.'
const FALLBACK_FAILED = 'Your request was not sent. Please try again in a few minutes, or contact WUWF corporate support.'

const labels = (rows: { label?: string | null }[] | null | undefined): string[] => (rows ?? []).map((r) => r.label?.trim() ?? '').filter(Boolean)

/** The Sponsorship global for a page. The staff-only inquiry address is dropped here, so it can never reach a component. */
export async function loadSponsorship(): Promise<SponsorshipPageData> {
  const { inquiryEmail: _private, ...content } = await getCachedGlobal('sponsorship', 0)()
  return { content, programs: openPrograms(content.programs), interests: labels(content.interests), budgets: labels(content.budgets) }
}

/**
 * What the inquiry action needs, read fresh (never from the cache): who receives it and what the form offered. Empty or unreadable
 * means "not set up", and the form says so.
 */
export async function loadInquirySettings(): Promise<{ recipient: string | null; interests: string[]; budgets: string[]; notSetUp: string; failed: string }> {
  try {
    const payload = await getPayload({ config: configPromise })
    const g = await payload.findGlobal({ slug: 'sponsorship', depth: 0, overrideAccess: true })
    const to = g.inquiryEmail?.trim()
    return {
      recipient: to || null,
      interests: labels(g.interests),
      budgets: labels(g.budgets),
      notSetUp: g.hub?.inquiry?.notSetUpMessage?.trim() || FALLBACK_NOT_SET_UP,
      failed: g.hub?.inquiry?.failedMessage?.trim() || FALLBACK_FAILED,
    }
  } catch {
    return { recipient: null, interests: [], budgets: [], notSetUp: FALLBACK_NOT_SET_UP, failed: FALLBACK_FAILED }
  }
}
