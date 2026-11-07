import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { StoryView } from '@/components/Article/StoryView'
import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { memberPiece } from '@/lib/members/listen'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Members’ listening', robots: { index: false, follow: false } }

type Args = { params: Promise<{ id: string }> }

/**
 * A members-only episode or Field Note, whole, for a reader with members' listening (phase 7c-2). The public page at the story's
 * own address stays cached and shows the members' panel to everyone; this page is private, never cached, and checks the membership
 * on every request (`lib/members/listen.ts`).
 */
export default async function MemberListenPage({ params }: Args) {
  const { id } = await params
  const payload = await getPayload({ config: configPromise })
  const result = await memberPiece(payload, await supabaseAudienceAuth.currentUser(), id, new Date())
  if (result.kind === 'not-found') notFound()
  if (result.kind === 'redirect') redirect(result.to)
  return <StoryView draft={false} post={result.post} url={`/account/listen/${id}`} />
}
