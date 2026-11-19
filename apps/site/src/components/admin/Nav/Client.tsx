'use client'

import { Link, NavGroup } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React from 'react'

/** One node of the sidebar, already resolved on the server: a link with its address, or a heading holding more nodes. */
export type NavNode = { type: 'link'; label: string; href: string; id: string } | { type: 'group'; label: string; items: NavNode[] }

const isActive = (pathname: string, href: string) => pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])

function NavLinkItem({ node, pathname }: { node: Extract<NavNode, { type: 'link' }>; pathname: string }) {
  const active = isActive(pathname, node.href)
  const label = (
    <>
      {active ? <div className="nav__link-indicator" /> : null}
      <span className="nav__link-label">{node.label}</span>
    </>
  )
  // The page being shown is not a link to itself (Payload's own sidebar does the same).
  if (pathname === node.href) {
    return (
      <div className="nav__link" id={node.id}>
        {label}
      </div>
    )
  }
  return (
    <Link className="nav__link" href={node.href} id={node.id} prefetch={false}>
      {label}
    </Link>
  )
}

function NavNodes({ nodes, pathname, openState, depth }: { nodes: NavNode[]; pathname: string; openState: Record<string, { open?: boolean }>; depth: number }) {
  return (
    <>
      {nodes.map((node) =>
        node.type === 'link' ? (
          <NavLinkItem key={node.id} node={node} pathname={pathname} />
        ) : depth === 0 ? (
          // A top-level group is a direct child of the sidebar's flex column, as in Payload's own: a wrapper here would shrink it to its text.
          <NavGroup key={node.label} label={node.label} isOpen={openState[node.label]?.open}>
            <NavNodes nodes={node.items} pathname={pathname} openState={openState} depth={depth + 1} />
          </NavGroup>
        ) : (
          <div key={node.label} className="wuwf-nav__sub">
            <NavGroup label={node.label} isOpen={openState[node.label]?.open}>
              <NavNodes nodes={node.items} pathname={pathname} openState={openState} depth={depth + 1} />
            </NavGroup>
          </div>
        ),
      )}
    </>
  )
}

export const AdminNavClient: React.FC<{ groups: Extract<NavNode, { type: 'group' }>[]; openState: Record<string, { open?: boolean }> }> = ({ groups, openState }) => {
  const pathname = usePathname()
  return <NavNodes nodes={groups} pathname={pathname} openState={openState} depth={0} />
}
