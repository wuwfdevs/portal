// Who may make a story or page live. Saving drafts is editing (content.write); making work public is
// publishing (content.publish). Payload has no per-status permission, so the check is a beforeChange hook, and
// this is its pure decision so it can be tested without a database.

type Status = 'draft' | 'published' | null | undefined

/**
 * Whether this write leaves the document published: it says so explicitly, or it says nothing about status and
 * the document already is (an edit to a live document goes live as soon as it is saved).
 */
export function resultsInPublished(args: {
  operation: 'create' | 'update'
  data: { _status?: Status } | undefined
  originalDoc: { _status?: Status } | undefined
}): boolean {
  const { operation, data, originalDoc } = args
  if (data?._status === 'published') return true
  if (data?._status === 'draft') return false
  return operation === 'update' && originalDoc?._status === 'published'
}
