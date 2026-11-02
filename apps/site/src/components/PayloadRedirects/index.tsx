import type React from 'react'
import type { Page, Post } from '@/payload-types'

import { getCachedRedirects } from '@/utilities/getRedirects'
import { notFound, permanentRedirect } from 'next/navigation'

interface Props {
  disableNotFound?: boolean
  url: string
}

/* This component helps us with SSR based dynamic redirects. They are permanent (308): an editor makes one when a live
   address moves, and the migration plan asks for one-to-one permanent redirects, not temporary ones. */
export const PayloadRedirects: React.FC<Props> = async ({ disableNotFound, url }) => {
  const redirects = await getCachedRedirects()()

  const redirectItem = redirects.find((redirect) => redirect.from === url)

  if (redirectItem) {
    if (redirectItem.to?.url) {
      permanentRedirect(redirectItem.to.url)
    }

    // A reference points at a story or page and is served at that record's stored path. Redirects are read at depth 1,
    // so a target the public can read arrives populated; one they cannot (unpublished) stays an id and does not redirect.
    const ref = redirectItem.to?.reference
    const target = ref && typeof ref.value === 'object' ? (ref.value as Page | Post) : null
    const redirectUrl = target?.path ?? (ref?.relationTo === 'pages' && target?.slug === 'home' ? '/' : null)

    if (redirectUrl) permanentRedirect(redirectUrl)
  }

  if (disableNotFound) return null

  notFound()
}
