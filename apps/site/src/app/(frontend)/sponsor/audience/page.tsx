import type { Metadata } from 'next'

import { AudienceView } from '@/components/Sponsorship/AudienceView'

export const metadata: Metadata = {
  title: 'WUWF’s audience',
  description: 'Who listens to WUWF, what NPR’s research shows about listeners in smaller markets, and how they respond to the businesses that support public radio.',
  alternates: { canonical: '/sponsor/audience' },
}

export default function AudiencePage() {
  return <AudienceView />
}
