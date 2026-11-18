import type { Metadata } from 'next'

import { LegacyView } from '@/components/Giving/LegacyView'
import { loadGiving } from '@/lib/giving/load'
import { GIVING_PATHS } from '@/lib/giving/paths'
import { paragraphs } from '@/lib/page-content'

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadGiving()
  return {
    title: content.legacy?.hero?.title || 'Leave a legacy to WUWF',
    description: paragraphs(content.legacy?.hero?.body)[0],
    alternates: { canonical: GIVING_PATHS.legacy },
  }
}

export default async function LegacyRoute() {
  return <LegacyView content={await loadGiving()} />
}
