// The engines, by kind. A new kind of visualization is one engine file, one entry here, one view, and one option on the Visualizations collection.

import type { SpecContext, VizSpec } from '../spec'
import { chartEngine } from './chart'
import { embedEngine } from './embed'
import { mapEngine } from './map'
import { tableEngine } from './table'
import type { Engine, PrepareContext, RenderModel } from './types'

const ENGINES = { chart: chartEngine, map: mapEngine, table: tableEngine, embed: embedEngine } as const

const engineFor = (kind: VizSpec['kind']): Engine<never, RenderModel> => ENGINES[kind] as unknown as Engine<never, RenderModel>

/** What is wrong with a configuration, in words an editor can act on. Empty: it can be drawn. */
export function validateSpec(spec: VizSpec, ctx: SpecContext | null, embedHosts: readonly string[] = []): string[] {
  if (spec.kind === 'embed') return embedEngine.validate(spec, null as never, embedHosts)
  if (!ctx) return ['Choose a dataset.']
  return engineFor(spec.kind).validate(spec as never, ctx, embedHosts)
}

/** The drawable model for a configuration. Throws with a sentence when it cannot be drawn (the loader draws nothing for it rather than a broken picture). */
export function prepareSpec(spec: VizSpec, ctx: PrepareContext | null, idPrefix = 'viz'): RenderModel {
  if (spec.kind === 'embed') return embedEngine.prepare(spec, null as never)
  if (!ctx) throw new Error('This visualization has no dataset.')
  return engineFor(spec.kind).prepare(spec as never, { ...ctx, idPrefix })
}

export { ENGINES }
