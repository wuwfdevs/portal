import type { Metadata } from 'next'

import { ClipHub } from '@/components/Video/ClipView'
import { loadClipPage } from '@/lib/video/load'
import { getCachedGlobal } from '@/utilities/getGlobals'

// Short video (board 7): the newest clip playing, what is next, and a row per series. Saving a clip refreshes it at once; the schedule
// covers a series' agreement ending.
export const revalidate = 3600

export default async function VideoPage() {
  const data = await loadClipPage(null)
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  if (!data) return <EmptyVideo />
  return <ClipHub data={data} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
}

function EmptyVideo() {
  return (
    <div className="container max-w-[52rem] pb-20 pt-12">
      <h1 className="font-serif text-4xl font-bold text-ink">Video</h1>
      <p className="mt-4 text-lg text-ink-2">No short videos are published yet.</p>
    </div>
  )
}

export const metadata: Metadata = { title: 'Video', description: 'Short video from WUWF: reporting, music and Florida history in about a minute.' }
