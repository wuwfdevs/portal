import { getCachedGlobal } from '@/utilities/getGlobals'

import { openPrograms, type ProgramView } from './programs'

/** What the page says under "Request a proposal" until the university's wording is entered in the admin. A plain fact, no promise. */
export const DEFAULT_INQUIRY_NOTICE = 'WUWF uses what you send only to answer your inquiry. Corporate support reads it and replies; the site keeps no copy.'

export type SponsorshipPageData = { programs: ProgramView[]; inquiryNotice: string }

/** The Sponsorship global, read safely: if it cannot be read, the pages still render, with no programs and the plain notice. */
export async function loadSponsorship(): Promise<SponsorshipPageData> {
  try {
    const global = await getCachedGlobal('sponsorship', 0)()
    return { programs: openPrograms(global.programs), inquiryNotice: global.inquiryNotice?.trim() || DEFAULT_INQUIRY_NOTICE }
  } catch {
    return { programs: [], inquiryNotice: DEFAULT_INQUIRY_NOTICE }
  }
}
