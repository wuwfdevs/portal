import { NextResponse } from 'next/server'

import { loadFeedState } from '@/lib/live/load'

// What the live page polls: is the blog still live, and has anything on it changed (an update, or the blog itself: ended,
// pinned, introduction). Public and tiny; the response is cached for a few seconds at the edge so a crowd of readers polling
// costs the database one query, not thousands. It uses the same function the page does, so the two always agree.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const state = await loadFeedState(slug)
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(state, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } })
}
