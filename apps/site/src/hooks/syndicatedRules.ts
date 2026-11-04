import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

/**
 * A syndicated program is one WUWF airs but does not make (Morning Edition, Fresh Air). An underwriting agreement attaches to what WUWF makes, so a
 * syndicated program cannot carry one: the check is here, on save, whoever or whatever is saving (the admin, a script, the importer).
 */
export const syndicatedRules: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const kind = data.kind ?? originalDoc?.kind ?? 'original'
  if (kind !== 'syndicated') return data
  const agreements = data.agreements ?? originalDoc?.agreements
  if (Array.isArray(agreements) && agreements.length > 0) {
    throw new ValidationError(
      { collection: 'productions', errors: [{ message: 'A syndicated program cannot carry an underwriting agreement: WUWF does not make it.', path: 'agreements' }], req },
      req.t,
    )
  }
  return data
}
