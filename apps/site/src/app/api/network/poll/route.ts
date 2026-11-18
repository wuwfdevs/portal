import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { cdsReaderFromEnv } from '@/lib/network/cds-client'
import { runNetworkPoll } from '@/lib/network/run'

// Polls every active network source, then clears out old waiting stories. Called by a scheduler with `Authorization: Bearer $CRON_SECRET`
// (the same secret the Payload jobs endpoint uses). With no secret set it answers 401 to everyone, so it cannot be run by accident or by
// a stranger. It answers with counts and names only, never a story's words or a response from CDS.
//
// Scheduling is a deployment choice, not part of this file: nothing calls it until a cron entry is added for the site's Vercel project
// (ROADMAP -> Network content, "Needs the owner").
export const maxDuration = 300

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })

  const payload = await getPayload({ config: configPromise })
  const summary = await runNetworkPoll(payload, cdsReaderFromEnv())
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = handle
export const POST = handle
