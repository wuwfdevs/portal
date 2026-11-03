import React from 'react'

import type { WidgetBlock as WidgetBlockProps } from '@/payload-types'

import { WidgetFrame } from '@/components/WidgetFrame'
import { buildWidgetDocument, checkScriptUrl, clampHeight, DEFAULT_WIDGET_HEIGHT } from '@/lib/widgets'
import { cn } from '@/utilities/ui'

export const WidgetBlock: React.FC<WidgetBlockProps & { className?: string }> = ({
  title,
  scriptUrl,
  module,
  elementId,
  attributes,
  initEvent,
  height,
  caption,
  className,
}) => {
  const doc = buildWidgetDocument({ scriptUrl, module, elementId, attributes, initEvent })
  const script = checkScriptUrl(scriptUrl)
  // A record that no longer passes the checks shows its title only; nothing from the other site is ever loaded.
  if (!doc || !script.ok) return <p className="not-prose my-6 font-sans text-base font-semibold text-ink-2">{title}</p>
  return (
    <figure className={cn('not-prose my-8', className)}>
      <div className="w-full overflow-hidden rounded-sm bg-surface-3">
        <WidgetFrame doc={doc} host={script.host} initialHeight={clampHeight(height ?? DEFAULT_WIDGET_HEIGHT)} title={title} />
      </div>
      {caption && <figcaption className="mt-2 font-sans text-sm text-ink-3">{caption}</figcaption>}
    </figure>
  )
}
