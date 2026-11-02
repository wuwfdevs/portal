// Disk side of the census: atomic working state, the two committed artifacts, and the raw-response store.
// Raw responses never go in the repository: the store refuses a directory inside any git work tree.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { discoveryCurve, type Tally } from './tally'
import { newState, tallyGroupOf, type CensusState, type Row } from './runner'

/** Write a file so that a crash leaves either the old content or the new, never half. */
export function writeAtomic(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}

export function saveState(file: string, state: CensusState): void {
  writeAtomic(file, JSON.stringify(state))
}

export function loadState(file: string, seed: string): CensusState {
  if (!existsSync(file)) return newState(seed)
  const s = JSON.parse(readFileSync(file, 'utf8')) as CensusState
  if (s.seed !== seed) throw new Error(`State in ${file} was made with seed "${s.seed}", not "${seed}". Refusing to mix orders.`)
  return s
}

// ---------------------------------------------------------------------------------------------------------------
// The committed artifacts

export function manifestJsonl(rows: readonly Row[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
}

export function parseManifest(text: string): Row[] {
  const rows: Row[] = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (!line.trim()) return
    try {
      rows.push(JSON.parse(line) as Row)
    } catch {
      // Only an unfinished final line is forgivable (a write cut short); anything earlier is damage.
      if (i < lines.length - 2) throw new Error(`Manifest line ${i + 1} is not valid JSON.`)
    }
  })
  return rows
}

export function tallyDocument(state: CensusState): string {
  const curves = Object.fromEntries(Object.entries(state.tally.groups).map(([g, t]) => [g, discoveryCurve(t)]))
  return JSON.stringify({ seed: state.seed, rowCount: state.rows.length, curves, tally: state.tally }, null, 1) + '\n'
}

export function exportArtifacts(state: CensusState, dir: string): void {
  writeAtomic(join(dir, 'manifest.jsonl'), manifestJsonl(state.rows))
  writeAtomic(join(dir, 'tally.json'), tallyDocument(state))
}

/** Rebuild the working state from the committed files (a fresh sandbox after a restart). */
export function importArtifacts(dir: string, seed: string): CensusState {
  const manifest = join(dir, 'manifest.jsonl')
  const tallyFile = join(dir, 'tally.json')
  if (!existsSync(manifest) || !existsSync(tallyFile)) return newState(seed)
  const rows = parseManifest(readFileSync(manifest, 'utf8'))
  const doc = JSON.parse(readFileSync(tallyFile, 'utf8')) as { seed: string; rowCount: number; tally: Tally }
  if (doc.seed !== seed) throw new Error(`Committed census used seed "${doc.seed}", not "${seed}".`)
  if (doc.rowCount !== rows.length) {
    throw new Error(`manifest.jsonl has ${rows.length} rows but tally.json was written for ${doc.rowCount}. They are from different checkpoints; refusing to resume.`)
  }
  const tallied: Record<string, number> = {}
  for (const r of rows) {
    if (!r.tallied) continue
    const g = tallyGroupOf(r)
    tallied[g] = (tallied[g] ?? 0) + 1
  }
  for (const [g, t] of Object.entries(doc.tally.groups)) {
    if ((tallied[g] ?? 0) !== t.pages) throw new Error(`Group "${g}": ${t.pages} pages in the tally but ${tallied[g] ?? 0} tallied rows in the manifest.`)
  }
  return { version: 1, seed, rows, tally: doc.tally }
}

// ---------------------------------------------------------------------------------------------------------------
// Raw store

/** True if `dir` (or its nearest existing parent) is inside a git work tree. */
export function insideGitWorkTree(dir: string): boolean {
  let probe = resolve(dir)
  while (!existsSync(probe)) {
    const up = dirname(probe)
    if (up === probe) return false
    probe = up
  }
  try {
    return execFileSync('git', ['-C', probe, 'rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true'
  } catch {
    return false
  }
}

export function assertOutsideRepo(dir: string): void {
  if (insideGitWorkTree(dir)) throw new Error(`Refusing to keep raw responses in ${dir}: it is inside a git work tree. Raw responses stay out of the repository.`)
}

/** Content-addressed and immutable: the same body is the same file, and an existing file is never rewritten. */
export function saveRaw(dir: string, sha256: string, body: string): void {
  assertOutsideRepo(dir)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${sha256}.json.gz`)
  if (existsSync(file)) return
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, gzipSync(body))
  renameSync(tmp, file)
}
