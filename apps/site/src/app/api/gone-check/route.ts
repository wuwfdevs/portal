import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getCachedRedirects } from '@/utilities/getRedirects'
import { resolvePath } from '@/utilities/resolvePath'

// Asked by the proxy before it answers 410 Gone (see `lib/gone.ts`): does anything own this address? A story, page, show or an
// editor's redirect does. Says only yes or no, about published records, so it is safe to leave public. Cached by the CDN.
export async function GET(request: Request) {
  // The proxy sends the stored (decoded) address; a trailing slash is tolerated.
  const given = new URL(request.url).searchParams.get('path') ?? ''
  const path = given.length > 1 ? given.replace(/\/+$/, '') : given
  if (!path.startsWith('/') || path.length > 512) return Response.json({ error: 'bad path' }, { status: 400 })

  const payload = await getPayload({ config: configPromise })
  const owned =
    (await resolvePath(path, false)) !== null ||
    (await payload.count({ collection: 'productions', overrideAccess: false, where: { path: { equals: path } } })).totalDocs > 0 ||
    (await getCachedRedirects()()).some((r) => r.from === path)

  return Response.json({ exists: owned }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } })
}
