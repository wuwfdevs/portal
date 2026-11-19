import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { SectionContext, SectionProps } from './types'

/** For the blocks' tests: the page context a plain page gives, and a helper that renders one block to markup. */
export const testContext: SectionContext = { themeId: 'wuwf', setId: null, draft: false, pageId: 1 }

export function renderBlock(Component: (props: SectionProps<any>) => unknown, blockType: string, block: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(Component as never, { block: { blockType, ...block }, context: testContext }))
}
