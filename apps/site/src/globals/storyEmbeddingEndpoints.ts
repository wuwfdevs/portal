import type { Endpoint, PayloadRequest } from 'payload'

import { userCan } from '@/access/permissions'
import { embedNextBatch, embeddingStatus, neighbourExamples } from '@/lib/embeddings/admin'
import { resolveTuning } from '@/lib/embeddings/tuning'

/**
 * The endpoints behind the "Story embeddings" panel on Site settings: `/api/globals/site-settings/embeddings` (status), `.../embeddings/run`
 * (embed the next batch) and `.../embeddings/examples` (sample stories with their neighbours). Staff only, and only with
 * `settings.manage`, the permission that guards Site settings: embedding sends story text to a paid third party.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Null when the caller may use these; otherwise the refusal to return. Checked first in every handler. */
function refusal(req: PayloadRequest): Response | null {
  if (!req.user) return json({ error: 'Sign in to the admin first.' }, 401)
  if (!userCan(req.user as { roles?: readonly string[] | null }, 'settings.manage')) return json({ error: 'You need permission to manage site settings.' }, 403)
  return null
}

const number = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export const storyEmbeddingEndpoints: Omit<Endpoint, 'root'>[] = [
  {
    path: '/embeddings',
    method: 'get',
    handler: async (req) => refusal(req) ?? json(await embeddingStatus(req.payload)),
  },
  {
    path: '/embeddings/run',
    method: 'post',
    handler: async (req) => {
      const denied = refusal(req)
      if (denied) return denied
      const after = Math.max(0, Math.floor(number(new URL(req.url ?? 'http://x').searchParams.get('after')) ?? 0))
      return json(await embedNextBatch(req.payload, after))
    },
  },
  {
    path: '/embeddings/examples',
    method: 'get',
    handler: async (req) => {
      const denied = refusal(req)
      if (denied) return denied
      const q = new URL(req.url ?? 'http://x').searchParams
      // The numbers on the form, not yet saved, so the examples move as an editor changes them; clamped like saved ones.
      const tuning = resolveTuning({ relatedMinSimilarity: number(q.get('related')), relatedMaxPerSeries: number(q.get('perSeries')) })
      return json({ examples: await neighbourExamples(req.payload, tuning) })
    },
  },
]
