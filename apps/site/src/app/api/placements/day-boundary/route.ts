import { revalidatePath, revalidateTag } from '@/lib/revalidate'

// Refreshes every page that reads placements, just after the station's midnight. A placement's first and last days are whole calendar days in Central time
// (`lib/placements/pick.ts`), but a page is only redrawn when it next refreshes (the home page within five minutes, a section page within the hour), so a flat-rate
// sponsor whose week starts on Monday could start up to an hour late and the last week's sponsor could stay up an hour late. This is called by the scheduler in
// `vercel.json` with `Authorization: Bearer $CRON_SECRET` (the same secret the network poll uses); with no secret set it answers 401 to everyone.
//
// Vercel's schedules are in UTC, and Central midnight is 05:00 or 06:00 UTC depending on daylight saving, so it is called at both 05:05 and 06:05 UTC: whichever is
// just after the station's midnight does the work, and the other is a harmless extra refresh. It answers with a fixed word and no data.
export const maxDuration = 60

export async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })
  revalidateTag('placements', 'max')
  revalidatePath('/')
  revalidatePath('/', 'layout')
  return Response.json({ status: 'refreshed' }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = handle
export const POST = handle
