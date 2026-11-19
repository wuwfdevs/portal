import { NextResponse } from 'next/server'

import { inquiryTokenFor } from '@/lib/sponsorship/secrets'

// The inquiry form's timing token. The form is in a cached page, so the token is asked for when the form is shown; it is a signed time and
// nothing else (lib/events/abuse), and it must never be cached.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ token: inquiryTokenFor() }, { headers: { 'Cache-Control': 'no-store' } })
}
