import type { Media as MediaDoc } from '@/payload-types'

import type { HomeStory } from '@/lib/homepage/load'
import { leadPicture } from '@/lib/homepage/select'

/**
 * A story's card data with its lead picture standing in for the SEO image. A migrated story has no SEO image, so its
 * featured media is what gives its card a picture.
 */
export const withLeadPicture = (story: HomeStory): HomeStory => ({
  ...story,
  meta: { ...story.meta, image: leadPicture<MediaDoc>(story) },
})
