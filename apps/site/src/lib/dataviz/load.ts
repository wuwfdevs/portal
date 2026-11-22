// The public read of a visualization, cached. A figure is cached under its own tag (`viz:<id>`), which the visualization's save, a dataset version
// going live, and a boundary change all refresh (`collections/Data`), so a page holding the figure is rebuilt when, and only when, what it draws
// changes: that is how one edit updates every story that shows it. A failed read throws and is never cached; a figure that cannot be drawn is
// cached as "nothing", and the block draws nothing for it.
//
// Blocks import this only inside their async component: the block registry is loaded by the Payload CLI, and this file loads the config.

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { getCachedGlobal } from '@/utilities/getGlobals'

import { readVisualization } from './read'
import type { LoadedVisualization } from './view'

/** A day: nothing here changes with time, only with an edit, and every edit refreshes the tag. The limit is only a backstop. */
export const VIZ_REVALIDATE = 86_400

/**
 * Part of the cache key. Raise it when an engine changes how a figure is drawn, so every cached drawing is made again on the next deploy rather than
 * waiting for an edit to refresh it.
 */
export const RENDER_VERSION = 6

export async function loadVisualization(id: number | string): Promise<LoadedVisualization> {
  const read = unstable_cache(
    async (): Promise<LoadedVisualization> => {
      const payload = await getPayload({ config: configPromise })
      const settings = await getCachedGlobal('site-settings', 0)()
      const result = await readVisualization({ payload, mode: { kind: 'public' }, embedHosts: (settings?.embedHosts ?? []).map((h: { host: string }) => h.host) }, id)
      if (!result.ok && result.reason !== 'not found') console.warn(`[dataviz] visualization ${id} is not drawn: ${result.reason}`)
      return result.ok ? { ok: true, view: result.view } : { ok: false, reason: result.reason }
    },
    ['dataviz', `v${RENDER_VERSION}`, String(id)],
    { revalidate: VIZ_REVALIDATE, tags: ['dataviz', `viz:${id}`] },
  )
  return read()
}
