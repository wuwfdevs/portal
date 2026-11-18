import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { cdsReaderFromEnv } from '@/lib/network/cds-client'
import { runNetworkPoll } from '@/lib/network/run'

// Polls every active network source, then clears out old waiting stories. Called by a scheduler with `Authorization: Bearer $CRON_SECRET`
// (the same secret the Payload jobs endpoint uses). With no secret set it answers 401 to everyone, so it cannot be run by accident or by
// a stranger. It answers with counts and names only, never a story's words or a response from CDS.
//
// `vercel.json` calls it every 15 minutes (Vercel sends `Authorization: Bearer $CRON_SECRET` itself when the project has that variable). It is
// inert until the project has real credentials: without `CRON_SECRET` every call is a 401, and without `NPR_CDS_TOKEN` an authorised call
// answers "not set up" before it touches the database or the network.
export const maxDuration = 300

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })

  const cds = cdsReaderFromEnv()
  if (!cds) return Response.json({ status: 'not_configured' }, { headers: { 'Cache-Control': 'no-store' } })

  const payload = await getPayload({ config: configPromise })
  const summary = await runNetworkPoll(payload, cds)
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = handle
export const POST = handle
