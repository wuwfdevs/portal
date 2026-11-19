import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { SponsorshipSetting } from '@/payload-types'
import { getCachedGlobal } from '@/utilities/getGlobals'

import { openPrograms, type ProgramView } from './programs'

/** What a block may see of the settings: everything but the staff-only inquiry address. */
export type SponsorshipSettingsData = Omit<SponsorshipSetting, 'inquiryEmail'>
export type SponsorshipBlockData = { settings: SponsorshipSettingsData; programs: ProgramView[]; interests: string[]; budgets: string[] }

/** Used only when the admin's messages are empty or unreadable, so a visitor is never told nothing. */
const FALLBACK_NOT_SET_UP = 'Online requests are not set up yet, so nothing was sent. Please contact WUWF corporate support.'
const FALLBACK_FAILED = 'Your request was not sent. Please try again in a few minutes, or contact WUWF corporate support.'

const labels = (rows: { label?: string | null }[] | null | undefined): string[] => (rows ?? []).map((r) => r.label?.trim() ?? '').filter(Boolean)

/**
 * The Sponsorship settings for a block, through the tagged cache so a save reaches every page that holds a block reading it
 * (`global_sponsorship-settings`). The staff-only inquiry address is dropped here, so it can never reach a component.
 */
export async function loadSponsorshipSettings(): Promise<SponsorshipBlockData> {
  const { inquiryEmail: _private, ...settings } = await getCachedGlobal('sponsorship-settings', 0)()
  return { settings, programs: openPrograms(settings.programs), interests: labels(settings.interests), budgets: labels(settings.budgets) }
}

/**
 * What the inquiry action needs, read fresh (never from the cache): who receives it and what the form offered. Empty or unreadable
 * means "not set up", and the form says so.
 */
export async function loadInquirySettings(): Promise<{ recipient: string | null; interests: string[]; budgets: string[]; notSetUp: string; failed: string }> {
  try {
    const payload = await getPayload({ config: configPromise })
    const g = await payload.findGlobal({ slug: 'sponsorship-settings', depth: 0, overrideAccess: true })
    const to = g.inquiryEmail?.trim()
    return {
      recipient: to || null,
      interests: labels(g.interests),
      budgets: labels(g.budgets),
      notSetUp: g.notSetUpMessage?.trim() || FALLBACK_NOT_SET_UP,
      failed: g.failedMessage?.trim() || FALLBACK_FAILED,
    }
  } catch {
    return { recipient: null, interests: [], budgets: [], notSetUp: FALLBACK_NOT_SET_UP, failed: FALLBACK_FAILED }
  }
}
