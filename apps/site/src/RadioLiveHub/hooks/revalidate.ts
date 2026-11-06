import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

export const revalidateRadioLiveHub: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating the RadioLive page')
    revalidateTag('global_radiolive-hub', 'max')
    revalidatePath('/radiolive')
    revalidatePath('/') // the home page's RadioLive panel
  }
  return doc
}
