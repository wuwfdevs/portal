import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

export const revalidateSupportPage: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating the support page')
    revalidateTag('global_support-page', 'max')
    revalidatePath('/support')
  }
  return doc
}
