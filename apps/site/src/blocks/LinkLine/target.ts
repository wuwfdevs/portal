import type { LinkLineBlock } from '@/payload-types'

import { linkLineHref } from '@/lib/link-line'

/**
 * The words and address a link line shows: the chosen story's own title and path when there is one (so a rename or a new
 * address follows), else what the editor or the migration typed, if its address is safe. Null when there is nothing to link
 * to, and the block then renders nothing rather than a dead line. A chosen story that did not come back populated, or has
 * no address yet (never published), also gives null, and does not fall back to old typed words.
 */
export function linkLineTarget(props: Pick<LinkLineBlock, 'story' | 'linkText' | 'url'>): { href: string; text: string } | null {
  if (props.story) {
    const story = typeof props.story === 'object' ? props.story : null
    return story?.path && story.title ? { href: story.path, text: story.title } : null
  }
  const href = linkLineHref(props.url)
  const text = (props.linkText ?? '').trim()
  return href && text ? { href, text } : null
}
