import type { Metadata } from 'next'

import React from 'react'

import {
  SupportBusinesses,
  SupportFellowships,
  SupportHero,
  SupportLevels,
} from '@/components/Support'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const metadata: Metadata = {
  title: 'Support WUWF',
  description: 'Become a WUWF member, sponsor the station, or fund reporting for Northwest Florida.',
}

// The page is the Support page global; saving it in the admin refreshes this route (SupportPage/hooks).
export default async function SupportRoute() {
  const page = await getCachedGlobal('support-page', 0)()

  return (
    <>
      <SupportHero page={page} />
      <SupportLevels page={page} />
      <SupportBusinesses page={page} />
      <SupportFellowships page={page} />
      {page.giftNotice && (
        <p className="container py-6 text-sm text-ink-3">{page.giftNotice}</p>
      )}
    </>
  )
}
