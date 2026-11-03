import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath } from '@/lib/revalidate'

/**
 * The home page is the one page an editor expects to change the moment they save, and an emergency notice must not wait
 * for a schedule. Saving the global refreshes it at once.
 */
export const revalidateHomepage: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating the home page')
    revalidatePath('/')
  }
  return doc
}
