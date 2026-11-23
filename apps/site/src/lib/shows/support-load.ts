// The server read behind a show-aware Support block: the production's donation form address. Imported only when the block draws (the registry is read by the Payload config).

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { showDonationHref } from './support-address'

const read = async (id: number | string): Promise<string | null> => {
  const payload = await getPayload({ config: configPromise })
  const show = await payload.findByID({ collection: 'productions', id, depth: 0, overrideAccess: false, select: { showSupport: { donateUrl: true } } }).catch(() => null)
  return showDonationHref(show)
}
const cached = unstable_cache(read, ['show-donation-href'], { revalidate: 300, tags: ['show-donation-href'] })

/** The production's donation form address with its attribution code, or null. A missing or unreadable production is null (the block then uses the station's form). */
export const loadShowDonationHref = (id: number | string): Promise<string | null> => cached(id)
