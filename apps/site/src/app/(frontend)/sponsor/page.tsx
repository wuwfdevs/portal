import type { Metadata } from 'next'

import { HubView } from '@/components/Sponsorship/HubView'
import { loadSponsorship } from '@/lib/sponsorship/load'
import { inquiryTokenFor } from '@/lib/sponsorship/secrets'

// The inquiry form carries a timing token issued when the page is shown (lib/events/abuse), so this page is never cached.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadSponsorship()
  return { title: content.hub?.hero?.title || 'Sponsor WUWF', description: content.hub?.hero?.body?.split(/\n\s*\n/)[0], alternates: { canonical: '/sponsor' } }
}

export default async function SponsorPage() {
  const { content, programs, interests, budgets } = await loadSponsorship()
  return <HubView budgets={budgets} content={content} interests={interests} programs={programs} token={inquiryTokenFor()} />
}
