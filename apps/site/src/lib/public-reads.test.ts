import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Payload's Local API skips access control unless told otherwise. Every read the public site makes through it must
// say what it intends (`overrideAccess: false` for the public, or `draft` for an authorised preview), or an unpublished
// story can leak into a listing, an archive block or a redirect. This fails when a new public read forgets.

const roots = ['src/app', 'src/blocks', 'src/components', 'src/utilities']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

/** The text of each `payload.find({ ... })` call: from the opening brace to its matching one. */
function findCalls(source: string): string[] {
  const calls: string[] = []
  const marker = /payload\.find\(\s*\{/g
  while (marker.exec(source)) {
    let depth = 1
    let i = marker.lastIndex
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    calls.push(source.slice(marker.lastIndex, i))
  }
  return calls
}

describe('public reads through the Local API', () => {
  const all = roots.flatMap((root) => files(root))

  it('finds the reads it is supposed to check', () => {
    expect(all.flatMap((f) => findCalls(readFileSync(f, 'utf8'))).length).toBeGreaterThanOrEqual(10)
  })

  it.each(all)('%s states its access intent on every payload.find', (file) => {
    for (const call of findCalls(readFileSync(file, 'utf8'))) {
      expect(call, `${file}: payload.find without overrideAccess`).toMatch(/overrideAccess/)
    }
  })
})
