import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Renews a reader's Supabase session on /account requests (the proxy calls it). Supabase rotates its refresh token on use, so the
 * renewed cookies must be written to the response here: a page cannot set cookies, and a renewal it could not save would sign the
 * reader out. Runs only on account pages, so the rest of the site stays cacheable and invokes nothing.
 */
export async function refreshAudienceSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return response
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of items) response.cookies.set(name, value, options)
      },
    },
  })
  try {
    await supabase.auth.getUser()
  } catch {
    // Supabase unreachable: the page decides (it will show signed out); never block the request.
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
