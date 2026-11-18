import type { Metadata } from 'next'

import React from 'react'

import { GiveView } from '@/components/Giving/GiveView'
import { LivePreviewInIframe } from '@/components/LivePreviewListener/InIframe'
import { GIVING_PATHS } from '@/lib/giving/paths'
import { loadGiving } from '@/lib/giving/load'
import { paragraphs } from '@/lib/page-content'

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadGiving()
  return {
    title: content.give?.hero?.title || 'Give to WUWF',
    description: paragraphs(content.give?.hero?.body)[0] ?? 'Become a WUWF member, give in the way that fits your life, or fund reporting for Northwest Florida.',
    alternates: { canonical: GIVING_PATHS.give },
  }
}

// The page is the Giving pages global; saving it in the admin refreshes this route (SupportPage/config).
export default async function SupportRoute() {
  const content = await loadGiving()
  return (
    <>
      <LivePreviewInIframe />
      <GiveView content={content} />
    </>
  )
}
