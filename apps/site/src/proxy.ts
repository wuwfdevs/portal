import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { GONE_HTML, PREVIEW_COOKIE, isGoneCandidate, recordPathOf } from '@/lib/gone'

// 410 Gone for a bare wire address nothing owns (see `lib/gone.ts`). A page cannot set its own status in the App Router, so this is
// the one place that can. It runs only for the two address shapes below. If the check fails for any reason the request goes on to
// the normal route (a 404 at worst): an error must never turn a live story into "gone".
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!isGoneCandidate(pathname)) return NextResponse.next()
  // Staff previewing an unpublished record at its own address carry the draft-mode cookie; the catch-all route decides what they may see.
  if (request.cookies.has(PREVIEW_COOKIE)) return NextResponse.next()
  const path = recordPathOf(pathname)
  if (path === null) return NextResponse.next()
  try {
    const check = new URL('/api/gone-check', request.nextUrl.origin)
    check.searchParams.set('path', path)
    const res = await fetch(check, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return NextResponse.next()
    const body = (await res.json()) as { exists?: unknown }
    if (body.exists === false) {
      return new NextResponse(GONE_HTML, { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
    }
  } catch {
    // fall through
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/:date(\\d{4}-\\d{2}-\\d{2})/:slug', '/show/14-59'],
}
