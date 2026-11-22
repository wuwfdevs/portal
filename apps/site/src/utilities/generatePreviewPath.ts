import { PreviewSearchParams } from '@/app/(frontend)/next/preview/route'
import { draftPreviewPath } from '@/lib/paths'
import { PayloadRequest } from 'payload'

type Props = {
  collection: 'posts' | 'pages'
  /** What the admin has of the document: its address if it has one, else its id (a draft that was never published). */
  data: { id?: string | number | null; path?: string | null; isHome?: boolean | null } | null | undefined
  req: PayloadRequest
}

/** The preview address: the document's own path when it has one; the home page; or a draft-only address by id. */
export const generatePreviewPath = ({ collection, data }: Props): string | null => {
  let target: string | null = null
  if (data?.path) target = data.path
  else if (collection === 'pages' && data?.isHome) target = '/'
  else if (data?.id !== undefined && data?.id !== null) target = draftPreviewPath(collection, data.id)
  if (!target) return null

  const encoded = target === '/' ? '/' : target.split('/').map(encodeURIComponent).join('/')
  const encodedParams = new URLSearchParams({
    path: encoded,
    previewSecret: process.env.PREVIEW_SECRET || '',
  } satisfies PreviewSearchParams)

  return `/next/preview?${encodedParams.toString()}`
}

/**
 * The preview address of a visualization: its own page in the site, for signed-in staff only (`/data-preview/<id>`). It shows the draft, with
 * any staged dataset version, and says what is missing before it can be published. It is not a draft-mode preview of a story: a visualization has
 * no address of its own for readers.
 */
export const generateDataPreviewPath = ({ data }: { data: { id?: string | number | null } | null | undefined; req: PayloadRequest }): string | null =>
  data?.id !== undefined && data?.id !== null ? `/data-preview/${data.id}` : null
