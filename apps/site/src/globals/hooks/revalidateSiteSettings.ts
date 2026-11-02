import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

/**
 * Site settings are read through a cache that never expires on its own (getCachedGlobal), and they change what
 * stories and pages render: the approved embed hosts decide whether an embed shows, the independence-policy link
 * sits on every acknowledgment. Saving them refreshes the cache and every rendered page that read it.
 */
export const revalidateSiteSettings: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating site settings and the pages that use them')
    revalidateTag('global_site-settings', 'max')
    revalidatePath('/', 'layout')
  }
  return doc
}
