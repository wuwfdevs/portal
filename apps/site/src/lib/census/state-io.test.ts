// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'

import { parseRobots } from './robots'
import { newState, runCensus, ThrottledClient, USER_AGENT, type CensusState } from './runner'
import { assertOutsideRepo, exportArtifacts, importArtifacts, insideGitWorkTree, loadState, manifestJsonl, parseManifest, saveRaw, saveState } from './state-io'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'census-test-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function someState(n = 4): Promise<CensusState> {
  let clock = 0
  const client = new ThrottledClient(
    {
      fetch: (async (u: URL) => new Response(JSON.stringify({ _template: 'ArticlePage', n: String(u) }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
      now: () => clock,
      sleep: async (ms) => void (clock += ms),
    },
    { baseUrl: 'https://www.wuwf.org', minIntervalMs: 3000, maxRetries: 0, backoffBaseMs: 1, maxRetryAfterMs: 1 },
  )
  const state = newState('seed')
  const items = Array.from({ length: n }, (_, i) => ({ path: `/local-news/2016-05-0${i + 1}/s`, group: 'main', stratum: 's' }))
  await runCensus(state, client, { items, renderer: 'json', robots: parseRobots('', USER_AGENT), now: () => new Date('2026-11-02T18:00:00Z') })
  return state
}

describe('committed artifacts', () => {
  it('round-trips through manifest.jsonl and tally.json', async () => {
    const dir = tmp()
    const state = await someState()
    exportArtifacts(state, dir)
    expect(importArtifacts(dir, 'seed')).toEqual(state)
  })

  it('refuses to resume if the two files come from different checkpoints', async () => {
    const dir = tmp()
    const state = await someState(4)
    exportArtifacts(state, dir)
    writeFileSync(join(dir, 'manifest.jsonl'), manifestJsonl(state.rows.slice(0, 3)))
    expect(() => importArtifacts(dir, 'seed')).toThrow(/different checkpoints/)
  })

  it('refuses a manifest whose tallied rows do not match the tally', async () => {
    const dir = tmp()
    const state = await someState(4)
    state.rows[0]!.tallied = false
    exportArtifacts(state, dir)
    expect(() => importArtifacts(dir, 'seed')).toThrow(/tallied rows/)
  })

  it('refuses another seed rather than mixing two orders', async () => {
    const dir = tmp()
    exportArtifacts(await someState(), dir)
    expect(() => importArtifacts(dir, 'other')).toThrow(/seed/)
  })

  it('starts empty when nothing is committed yet', () => {
    expect(importArtifacts(tmp(), 'seed').rows).toEqual([])
  })

  it('forgives a final line cut short by a crash, but not damage in the middle', () => {
    const good = '{"path":"/a"}\n{"path":"/b"}\n'
    expect(parseManifest(good + '{"path":"/c","sta')).toHaveLength(2)
    expect(() => parseManifest('{"path":"/a"}\nnot json\n{"path":"/b"}\n')).toThrow()
  })

  it('keeps raw response bodies out of both files', async () => {
    const dir = tmp()
    const state = await someState()
    exportArtifacts(state, dir)
    const text = readFileSync(join(dir, 'manifest.jsonl'), 'utf8') + readFileSync(join(dir, 'tally.json'), 'utf8')
    expect(text).not.toContain('"n":"https://')
  })
})

describe('working state', () => {
  it('saves atomically and loads back, and refuses a different seed', async () => {
    const dir = tmp()
    const file = join(dir, 'work', 'state.json')
    const state = await someState()
    saveState(file, state)
    expect(readdirSync(join(dir, 'work'))).toEqual(['state.json']) // no temp file left behind
    expect(loadState(file, 'seed')).toEqual(state)
    expect(() => loadState(file, 'other')).toThrow(/seed/)
    expect(loadState(join(dir, 'nothing.json'), 'seed').rows).toEqual([])
  })
})

describe('raw store', () => {
  it('writes content-addressed gzip files and never rewrites one', () => {
    const dir = tmp()
    saveRaw(dir, 'abc123', '{"a":1}')
    const file = join(dir, 'abc123.json.gz')
    expect(JSON.parse(gunzipSync(readFileSync(file)).toString())).toEqual({ a: 1 })
    saveRaw(dir, 'abc123', '{"a":2}')
    expect(JSON.parse(gunzipSync(readFileSync(file)).toString())).toEqual({ a: 1 })
    expect(readdirSync(dir)).toEqual(['abc123.json.gz'])
  })

  it('refuses to store anything inside the repository, and creates nothing there', () => {
    const inside = join(process.cwd(), 'census-raw-should-not-exist')
    expect(insideGitWorkTree(inside)).toBe(true)
    expect(() => assertOutsideRepo(inside)).toThrow(/git work tree/)
    expect(() => saveRaw(inside, 'abc', '{}')).toThrow(/git work tree/)
    expect(existsSync(inside)).toBe(false)
  })

  it('accepts a directory outside any work tree', () => {
    expect(insideGitWorkTree(join(tmp(), 'raw'))).toBe(false)
  })
})
