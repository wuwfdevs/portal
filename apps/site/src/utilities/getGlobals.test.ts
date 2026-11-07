import { describe, expect, it, vi } from 'vitest'

vi.mock('@payload-config', () => ({ default: {} }))

import { cacheGeneration, globalCacheKey } from './getGlobals'

// A cached global must not outlive the deployment that cached it: the next deployment's migrations may have changed it
// (the header's starting menus stayed invisible on the preview because the empty header was still cached, 2026-11-07).

describe('cached globals', () => {
  it('belong to the deployment', () => {
    expect(cacheGeneration({ VERCEL_DEPLOYMENT_ID: 'dpl_a', VERCEL_GIT_COMMIT_SHA: 'abc' })).toBe('dpl_a')
    expect(cacheGeneration({ VERCEL_GIT_COMMIT_SHA: 'abc' })).toBe('abc')
    expect(cacheGeneration({})).toBe('local')
  })

  it('are keyed by slug, depth and deployment, so a new deployment or another depth never reads an old entry', () => {
    expect(globalCacheKey('header', 1, 'dpl_a')).toEqual(['header', 'depth-1', 'dpl_a'])
    expect(globalCacheKey('header', 1, 'dpl_b')).not.toEqual(globalCacheKey('header', 1, 'dpl_a'))
    expect(globalCacheKey('header', 0, 'dpl_a')).not.toEqual(globalCacheKey('header', 1, 'dpl_a'))
  })
})
