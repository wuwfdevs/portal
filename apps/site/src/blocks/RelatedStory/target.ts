import type { RelatedStoryBlock } from '@/payload-types'

/**
 * The headline and address a related-story line shows: the chosen story's own when there is one (so a rename or a new
 * address follows), else what the editor or the migration typed. Null when there is nothing to link to, and the block
 * then renders nothing rather than a dead line. A chosen story that did not come back populated, or has no address yet
 * (never published), also gives null.
 */
export function relatedStoryTarget(props: Pick<RelatedStoryBlock, 'story' | 'headline' | 'url'>): { href: string; headline: string } | null {
  if (props.story) {
    const story = typeof props.story === 'object' ? props.story : null
    return story?.path && story.title ? { href: story.path, headline: story.title } : null
  }
  const href = (props.url ?? '').trim()
  const headline = (props.headline ?? '').trim()
  return href && headline ? { href, headline } : null
}
