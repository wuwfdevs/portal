import React from 'react'

import { reactAttr, type SvgNode } from '@/lib/dataviz/svg-tree'

/** A drawing made on the server, drawn as React elements. Only what `toSvgTree` allowed is in the tree, so this never injects markup. */
export function SvgDrawing({ node, className, label, describedBy, hidden }: { node: SvgNode; className?: string; label?: string; describedBy?: string; hidden?: boolean }) {
  const root = renderNode(node, 'r')
  return React.cloneElement(root as React.ReactElement<Record<string, unknown>>, {
    className,
    role: 'img',
    'aria-label': label,
    'aria-describedby': describedBy,
    ...(hidden ? { 'aria-hidden': true } : {}),
    focusable: 'false',
  })
}

function renderNode(node: SvgNode | string, key: string): React.ReactNode {
  if (typeof node === 'string') return node
  const props: Record<string, unknown> = { key }
  for (const [name, value] of Object.entries(node.attrs)) props[reactAttr(name)] = value
  if (node.style) props.style = node.style
  const children = node.children.map((c, i) => renderNode(c, `${key}.${i}`))
  return React.createElement(node.tag, props, ...(children.length > 0 ? children : []))
}
