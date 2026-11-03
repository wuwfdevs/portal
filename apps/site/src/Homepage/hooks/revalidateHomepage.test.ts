import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/revalidate', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))

import { revalidatePath } from '@/lib/revalidate'
import { Homepage } from '../config'
import { revalidateHomepage } from './revalidateHomepage'

const run = (context: Record<string, unknown>) =>
  (revalidateHomepage as unknown as (a: unknown) => unknown)({ doc: { id: 1 }, req: { payload: { logger: { info: vi.fn() } }, context } })

describe('revalidateHomepage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('refreshes the home page at once when it is saved', () => {
    run({})
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
  it('does nothing when revalidation is disabled (imports, scripts)', () => {
    run({ disableRevalidate: true })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('is registered on the Home page global', () => {
    expect(Homepage.hooks?.afterChange).toContain(revalidateHomepage)
  })
})
