import { getServerSideURL } from '@/utilities/getURL'

/**
 * This deployment's own address, for the link a sign-in email returns to. Never read from the request's Host header (a forged
 * header must not choose where a sign-in link points). A preview build uses its branch address, so a sign-in on staging comes back
 * to the same preview; Supabase also refuses any return address not on the project's allowed list.
 */
export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NEXT_PUBLIC_SERVER_URL) return env.NEXT_PUBLIC_SERVER_URL
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`
  return getServerSideURL()
}
