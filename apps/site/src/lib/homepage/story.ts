// What a home-page card and the lead band read from a story. Pure: no Payload runtime, so a block's view can import it (the block registry is loaded by the Payload config).

import type { Contributor, Post } from '@/payload-types'

const named = <T extends object>(value: T | string | number | null | undefined): T | null => (value && typeof value === 'object' ? value : null)

/** The fields a homepage card needs; the story body is never loaded. */
export type HomeStory = Pick<Post, 'id' | 'title' | 'path' | 'publishedAt' | 'meta' | 'featuredMedia' | 'categories' | 'contributors' | 'section' | 'format' | 'featuredAudio'>

export const CARD_FIELDS = { title: true, path: true, publishedAt: true, meta: true, featuredMedia: true, categories: true, contributors: true, section: true, format: true, publishingIdentity: true, featuredAudio: true } as const

/** "By Leigh Ostrander, Dave Dunwoody", or null when the story names no one. */
export function bylineOf(story: Pick<HomeStory, 'contributors'>): string | null {
  const names = (story.contributors ?? []).map((c) => named<Contributor>(c)?.name).filter((n): n is string => Boolean(n))
  return names.length > 0 ? `By ${names.join(', ')}` : null
}

/** The section's name when it was loaded, for the small label above a headline. */
export function kickerOf(story: Pick<HomeStory, 'section' | 'categories'>): string | null {
  const section = named<{ title?: string }>(story.section as never)
  return section?.title ?? null
}
