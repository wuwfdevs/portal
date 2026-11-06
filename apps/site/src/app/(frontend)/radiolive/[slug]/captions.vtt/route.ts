import { loadShowCaptions } from '@/lib/radiolive/load'

// The captions of one RadioLive show's recording, as the WebVTT file the player's <track> asks for.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const vtt = await loadShowCaptions(slug)
  if (!vtt) return new Response('Not found', { status: 404 })
  return new Response(vtt, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
