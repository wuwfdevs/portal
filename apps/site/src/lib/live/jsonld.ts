// The structured data search engines read for a live blog (schema.org LiveBlogPosting). Pure: the page hands it plain values.

export interface LiveUpdateForSchema {
  headline: string
  postedAt: string
  editedAt?: string | null
  anchor: string
}

export interface LiveBlogForSchema {
  url: string
  headline: string
  description?: string | null
  startedAt: string
  endedAt?: string | null
  modifiedAt?: string | null
  publisherName: string
  updates: readonly LiveUpdateForSchema[]
}

/** How many updates the structured data lists; search engines want the latest, not all of a long blog. */
export const SCHEMA_UPDATE_LIMIT = 20

export function liveBlogSchema(blog: LiveBlogForSchema): Record<string, unknown> {
  const newest = [...blog.updates].sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1)).slice(0, SCHEMA_UPDATE_LIMIT)
  return {
    '@context': 'https://schema.org',
    '@type': 'LiveBlogPosting',
    '@id': blog.url,
    url: blog.url,
    headline: blog.headline,
    ...(blog.description ? { description: blog.description } : {}),
    datePublished: blog.startedAt,
    ...(blog.modifiedAt ? { dateModified: blog.modifiedAt } : {}),
    coverageStartTime: blog.startedAt,
    // A blog that is still live has no end time: leaving it off is how the markup says "still going".
    ...(blog.endedAt ? { coverageEndTime: blog.endedAt } : {}),
    publisher: { '@type': 'NewsMediaOrganization', name: blog.publisherName },
    liveBlogUpdate: newest.map((u) => ({
      '@type': 'BlogPosting',
      headline: u.headline,
      url: `${blog.url}#${u.anchor}`,
      datePublished: u.postedAt,
      ...(u.editedAt ? { dateModified: u.editedAt } : {}),
    })),
  }
}

/**
 * JSON for a `<script type="application/ld+json">`. A `<` inside a string could close the script early, so every one is
 * written as its escape; the JSON means the same and the page cannot be broken by a headline.
 */
export const jsonLdText = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
