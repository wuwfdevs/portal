import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

export const revalidateVoyagerHub: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating The Voyager hub')
    revalidateTag('global_voyager-hub', 'max')
    revalidatePath('/voyager')
  }
  return doc
}
