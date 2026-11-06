import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { ArtistPageView } from '@/components/RadioLive/ArtistPageView'
import { loadArtist } from '@/lib/radiolive/load'

export const revalidate = 1800

type Args = { params: Promise<{ slug: string }> }

export default async function ArtistPage({ params }: Args) {
  const { slug } = await params
  const data = await loadArtist(slug)
  if (!data) notFound()
  return <ArtistPageView artist={data.artist} shows={data.shows} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const data = await loadArtist(slug)
  if (!data) return {}
  return { title: `${data.artist.name} · RadioLive`, description: data.artist.bio ?? undefined, alternates: { canonical: `/radiolive/artists/${data.artist.slug}` } }
}
