// The Sponsorship global as the pages read it. Pure: shapes over what the admin holds. Nothing here is copy.

import type { Sponsorship } from '@/payload-types'

// The small helpers are shared with the giving pages; they live in one place and are re-exported here so the sponsorship code reads as before.
export { fill, linkOf, listOf, paragraphs, phoneHref, shown, toStats } from '@/lib/page-content'

/** What a page may see: the global without the staff-only inquiry address. */
export type SponsorshipContent = Omit<Sponsorship, 'inquiryEmail'>
