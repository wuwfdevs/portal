import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { VoyagerHub } from '@/components/Voyager/VoyagerHub'
import { loadVoyagerHub } from '@/lib/voyager/load'

// The masthead prints today's date, so the page refreshes every ten minutes as well as when the hub, a section or a story is
// saved. Stories (`/voyager/<date>/<slug>`) and the section lists are still served by the catch-all route.
export const revalidate = 600

export default async function VoyagerPage() {
  const data = await loadVoyagerHub()
  if (!data) notFound()
  return <VoyagerHub data={data} />
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadVoyagerHub()
  if (!data) return {}
  return { title: 'The Voyager', description: data.tagline ?? undefined }
}
