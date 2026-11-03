import type { Metadata } from 'next'

import { DirectoryView } from '@/components/Show/DirectoryView'
import { loadDirectory } from '@/lib/shows/load'

// Refreshed whenever a show or an episode is saved (hooks), and on a schedule besides.
export const revalidate = 600

export default async function PodcastsPage() {
  return <DirectoryView data={await loadDirectory()} />
}

export const metadata: Metadata = {
  title: 'Podcasts',
  description: 'Podcasts made in Pensacola: live music, Florida history and reporting from the Gulf Coast.',
}
