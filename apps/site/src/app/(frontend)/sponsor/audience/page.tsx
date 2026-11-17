import type { Metadata } from 'next'

import { AudienceView } from '@/components/Sponsorship/AudienceView'
import { loadSponsorship } from '@/lib/sponsorship/load'

// Saving the Sponsorship global refreshes this route (globals/Sponsorship).
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadSponsorship()
  return { title: content.audience?.hero?.title || undefined, description: content.audience?.hero?.body?.split(/\n\s*\n/)[0], alternates: { canonical: '/sponsor/audience' } }
}

export default async function Page() {
  const { content } = await loadSponsorship()
  return <AudienceView content={content} />
}
