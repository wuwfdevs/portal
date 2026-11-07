import type { Config } from 'src/payload-types'

import configPromise from '@payload-config'
import { type DataFromGlobalSlug, getPayload } from 'payload'
import { unstable_cache } from 'next/cache'

type Global = keyof Config['globals']

async function getGlobal<T extends Global>(slug: T, depth = 0): Promise<DataFromGlobalSlug<T>> {
  const payload = await getPayload({ config: configPromise })

  const global = await payload.findGlobal({
    slug,
    depth,
  })

  return global
}

/**
 * Which deployment a cached global belongs to. Vercel's data cache outlives a deployment, and a deployment's build runs
 * its migrations, which can change a global (the header's starting menus did, 2026-11-07) without any save to revalidate
 * it. Keying by deployment means a new deployment never serves a global cached before its own migrations ran.
 */
export function cacheGeneration(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || 'local'
}

/** The cache key of a global: its slug, the depth it is read at, and the deployment. */
export function globalCacheKey(slug: string, depth: number, generation = cacheGeneration()): string[] {
  return [slug, `depth-${depth}`, generation]
}

/**
 * A global, cached. Saving it in the admin revalidates its tag (`global_<slug>`), so editors' changes show at once;
 * a new deployment reads it fresh.
 */
export const getCachedGlobal = <T extends Global>(slug: T, depth = 0) =>
  unstable_cache(async () => getGlobal<T>(slug, depth), globalCacheKey(slug, depth), {
    tags: [`global_${slug}`],
  })
