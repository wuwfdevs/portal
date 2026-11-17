import type { Metadata } from 'next'

import { OnAirView } from '@/components/Sponsorship/OnAirView'

export const metadata: Metadata = {
  title: 'On-air sponsorship',
  description: 'Rates, packages and the Carpool Plan for sponsor credits on WUWF. Estimate a schedule, then ask corporate support for a proposal.',
  alternates: { canonical: '/sponsor/on-air' },
}

export default function OnAirPage() {
  return <OnAirView />
}
