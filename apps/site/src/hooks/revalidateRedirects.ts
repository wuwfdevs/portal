import type { CollectionAfterChangeHook } from 'payload'

import { revalidateTag } from '@/lib/revalidate'

export const revalidateRedirects: CollectionAfterChangeHook = ({ doc, req: { payload } }) => {
  payload.logger.info(`Revalidating redirects`)

  revalidateTag('redirects', 'max')

  return doc
}
