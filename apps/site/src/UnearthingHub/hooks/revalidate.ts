import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

export const revalidateUnearthingHub: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info('Revalidating the Unearthing Florida hub')
    revalidateTag('global_unearthing-hub', 'max')
    revalidatePath('/unearthing-florida')
  }
  return doc
}
