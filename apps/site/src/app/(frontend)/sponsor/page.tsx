import type { Metadata } from 'next'

import { HubView } from '@/components/Sponsorship/HubView'
import { loadSponsorship } from '@/lib/sponsorship/load'
import { inquiryTokenFor } from '@/lib/sponsorship/secrets'

// The inquiry form carries a timing token issued when the page is shown (lib/events/abuse), so this page is never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sponsor WUWF',
  description:
    'Put your business’s name where listeners trust it: on air, online and at live events. Credits are support, not ads. Ask corporate support for a proposal.',
  alternates: { canonical: '/sponsor' },
}

export default async function SponsorPage() {
  const { programs, inquiryNotice } = await loadSponsorship()
  return <HubView inquiryNotice={inquiryNotice} programs={programs} token={inquiryTokenFor()} />
}
