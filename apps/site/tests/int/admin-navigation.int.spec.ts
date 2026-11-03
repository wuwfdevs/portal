import { getPayload } from 'payload'
import config from '@/payload.config'
import { describe, expect, it } from 'vitest'

// The admin sidebar is how staff find things. Every collection and global must sit in a named group (or be hidden), so a new
// one cannot quietly land in the bare "Collections" / "Globals" lists again, and the page-like globals must offer live preview.

describe('admin navigation', async () => {
  const payload = await getPayload({ config: await config })
  const collections = payload.config.collections
  const globals = payload.config.globals

  it('puts every collection in a group or hides it', () => {
    // `group: false` is a deliberate choice (reachable by address, no sidebar link): live updates are posted from inside their blog.
    const loose = collections.filter((c) => !c.admin?.hidden && c.admin?.group === undefined).map((c) => c.slug)
    expect(loose).toEqual([])
  })

  it('hides the live updates link, because updates are posted from inside their blog', () => {
    expect(collections.find((c) => c.slug === 'live-updates')?.admin?.group).toBe(false)
    expect(collections.map((c) => String(c.slug))).not.toContain('live-posts')
  })

  it('puts every global in a group', () => {
    expect(globals.filter((g) => !g.admin?.group).map((g) => g.slug)).toEqual([])
  })

  it('groups the page-like globals together and offers live preview on each', () => {
    const hubs = globals.filter((g) => g.admin?.group === 'Pages & hubs')
    expect(hubs.map((g) => g.slug).sort()).toEqual(['homepage', 'support-page', 'unearthing-hub', 'voyager-hub'])
    for (const g of hubs) expect(typeof g.admin?.livePreview === 'object' && g.admin.livePreview !== null && 'url' in g.admin.livePreview, g.slug).toBe(true)
  })

  it('keeps pictures, audio and video in one library group, and plugin collections out of the way', () => {
    const group = (slug: string) => collections.find((c) => c.slug === slug)?.admin?.group
    expect(['media', 'audio', 'video'].map(group)).toEqual(['Media library', 'Media library', 'Media library'])
    expect(['redirects', 'forms', 'form-submissions', 'search', 'users'].map(group)).toEqual(['System', 'System', 'System', 'System', 'System'])
    expect(['pages', 'posts'].map(group)).toEqual(['Content', 'Content'])
  })
})
