import { getCachedGlobal } from '@/utilities/getGlobals'

import { bannerOf, type BannerData } from './index'

/**
 * The site banner, whatever its scope, read through the cached global (saving the Home page global refreshes it everywhere). A failed read gives no banner and says
 * so in the log: the page renders without it rather than failing, and the callers that hold something back for an emergency banner then hold nothing back.
 */
export async function loadBanner(): Promise<BannerData | null> {
  try {
    return bannerOf((await getCachedGlobal('homepage', 0)())?.banner)
  } catch (error) {
    console.error('The banner could not be read; the page renders without it.', error)
    return null
  }
}
