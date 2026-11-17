import type { Metadata } from 'next'

import { GuidelinesView } from '@/components/Sponsorship/GuidelinesView'

export const metadata: Metadata = {
  title: 'Sponsor credit guidelines',
  description: 'What a WUWF sponsor credit can and can’t say, following NPR’s sponsor recognition guidelines.',
  alternates: { canonical: '/sponsor/credit-guidelines' },
}

export default function CreditGuidelinesPage() {
  return <GuidelinesView />
}
