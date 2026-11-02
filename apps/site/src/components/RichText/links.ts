import type { SerializedLinkNode } from '@payloadcms/richtext-lexical'

// Pure: no Payload, no server code, so a client component can use it (see Plain.tsx).
export const internalDocToHref = ({ linkNode }: { linkNode: SerializedLinkNode }) => {
  const { value, relationTo } = linkNode.fields.doc!
  if (typeof value !== 'object') {
    throw new Error('Expected value to be an object')
  }
  // A story or page is linked by its address. A record with none yet (never published) has nowhere to link to.
  const path = (value as { path?: string | null }).path
  return path || (relationTo === 'pages' && value.slug === 'home' ? '/' : '#')
}
