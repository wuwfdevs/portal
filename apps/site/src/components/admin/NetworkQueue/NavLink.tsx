'use client'

import { useConfig } from '@payloadcms/ui'
import Link from 'next/link'
import React from 'react'

/** A link to the Network queue under the admin's navigation, since a custom view has no collection to hang a link on. */
export const NetworkQueueNavLink: React.FC = () => {
  const { config } = useConfig()
  return (
    <div style={{ padding: '0 var(--base) var(--base)' }}>
      <Link href={`${config.routes.admin}/network-queue`} style={{ display: 'block', padding: '8px 0', color: 'var(--theme-text)', textDecoration: 'none' }}>
        Network queue
      </Link>
    </div>
  )
}
