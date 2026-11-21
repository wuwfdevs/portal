import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

/**
 * The home page is the one page an editor expects to change the moment they save, and a banner must not wait for a schedule. Saving the global
 * refreshes the home page, and, because a banner can be set for every page (the layout reads it through `getCachedGlobal`), its cache tag and
 * every rendered page that read it.
 */
export const revalidateHomepage: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating the home page and the banner')
    revalidatePath('/')
    revalidateTag('global_homepage', 'max')
    revalidatePath('/', 'layout')
  }
  return doc
}
