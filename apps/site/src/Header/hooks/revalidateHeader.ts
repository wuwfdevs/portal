import type { GlobalAfterChangeHook } from 'payload'

import { revalidateTag } from '@/lib/revalidate'

export const revalidateHeader: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info(`Revalidating header`)

    revalidateTag('global_header', 'max')
  }

  return doc
}
