import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/revalidate', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))

import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { SiteSettings } from '../SiteSettings'
import { revalidateSiteSettings } from './revalidateSiteSettings'

const run = (context: Record<string, unknown>) =>
  (revalidateSiteSettings as unknown as (a: unknown) => unknown)({
    doc: { id: 1 },
    req: { payload: { logger: { info: vi.fn() } }, context },
  })

describe('revalidateSiteSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes the settings cache tag and every rendered page when settings change', () => {
    run({})
    expect(revalidateTag).toHaveBeenCalledWith('global_site-settings', 'max')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('does nothing when revalidation is disabled (imports, scripts)', () => {
    run({ disableRevalidate: true })
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('is registered on the Site settings global, and its tag is the one getCachedGlobal reads', () => {
    expect(SiteSettings.hooks?.afterChange).toContain(revalidateSiteSettings)
    expect(`global_${SiteSettings.slug}`).toBe('global_site-settings')
  })
})
