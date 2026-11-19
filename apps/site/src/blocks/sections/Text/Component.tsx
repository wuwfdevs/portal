import React from 'react'

import { SectionBand, SectionHeading } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface TextData extends SectionData {
  body?: unknown
}

type Node = { type?: unknown; text?: unknown; children?: unknown }

/** Whether a rich-text state holds anything to draw: some text, or a block (a picture, an embed, audio). An empty editor is a lone empty paragraph. */
export function bodyHasContent(state: unknown): boolean {
  const walk = (node: unknown, depth: number): boolean => {
    if (typeof node !== 'object' || node === null || depth > 64) return false
    const n = node as Node
    if (typeof n.text === 'string' && n.text.trim() !== '') return true
    if (n.type === 'block' || n.type === 'horizontalrule' || n.type === 'upload') return true
    return Array.isArray(n.children) && n.children.some((c) => walk(c, depth + 1))
  }
  return walk((state as { root?: unknown } | null | undefined)?.root, 0)
}

// The typography plugin's colours come from the page, not from the band: on a dark or teal ground they would be dark on dark. These
// point them at the band's tone (`!` because the plugin sets them on the same element).
const TONE_PROSE = [
  '[--tw-prose-body:var(--tone-text)]!',
  '[--tw-prose-headings:var(--tone-text)]!',
  '[--tw-prose-lead:var(--tone-text)]!',
  '[--tw-prose-links:var(--tone-text)]!',
  '[--tw-prose-bold:var(--tone-text)]!',
  '[--tw-prose-counters:var(--tone-muted)]!',
  '[--tw-prose-bullets:var(--tone-muted)]!',
  '[--tw-prose-hr:var(--tone-rule)]!',
  '[--tw-prose-quotes:var(--tone-text)]!',
  '[--tw-prose-quote-borders:var(--tone-rule)]!',
  '[--tw-prose-captions:var(--tone-muted)]!',
  'text-[color:var(--tone-text)]',
].join(' ')

/**
 * Text. Draws nothing when the body is empty. A server component, async on purpose: the rich-text renderer pulls in every story block
 * (some are `server-only`), and the block registry is imported by the Payload config, which the CLI loads without that module. So the
 * renderer is loaded when a Text section is drawn, not when the registry is read (`rules.test.ts` fails on a static import).
 */
export async function TextSection({ block }: SectionProps<TextData>) {
  if (!bodyHasContent(block.body)) return null
  const { default: RichText } = await import('@/components/RichText')
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      <RichText className={`mx-0 max-w-3xl ${TONE_PROSE}`} data={block.body as never} enableGutter={false} />
    </SectionBand>
  )
}
