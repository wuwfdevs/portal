import type { Metadata } from 'next'

import { HomepageView } from '@/components/Homepage/HomepageView'
import { loadHomepage } from '@/lib/homepage/load'

// The front page changes whenever a story is published or the Home page global is saved (both refresh it at once), and
// on a short schedule besides, so a missed refresh heals itself within minutes.
export const revalidate = 300

export default async function HomePage() {
  const data = await loadHomepage()
  return <HomepageView data={data} />
}

export const metadata: Metadata = {
  title: 'WUWF Public Media',
  description: 'Public radio and journalism for Northwest Florida: local news, NPR, and WUWF originals from Pensacola.',
}
