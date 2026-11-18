import type { Metadata } from 'next'

import { ThanksView } from '@/components/Giving/ThanksView'
import { loadGiving } from '@/lib/giving/load'
import { readThanks } from '@/lib/giving/thanks'

type Args = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// A donor's name and amount can be in this page's address. The page is for the donor alone: it is not indexed, and it sends no
// referrer to anything it links to, so the address is not handed on.
export const metadata: Metadata = { title: 'Thank you', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function ThanksRoute({ searchParams }: Args) {
  const [content, params] = await Promise.all([loadGiving(), searchParams])
  return <ThanksView content={content} gift={readThanks(params)} />
}
