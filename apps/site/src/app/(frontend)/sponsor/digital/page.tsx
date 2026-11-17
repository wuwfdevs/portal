import type { Metadata } from 'next'

import { DigitalView } from '@/components/Sponsorship/DigitalView'

export const metadata: Metadata = {
  title: 'Digital sponsorship',
  description: 'Labeled sponsor messages on wuwf.org, in the WUWF app and in the e-newsletter. No autoplay, no pop-ups, no third-party tracking.',
  alternates: { canonical: '/sponsor/digital' },
}

export default function DigitalPage() {
  return <DigitalView />
}
