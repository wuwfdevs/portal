// The embed engine: a visualization made elsewhere (Datawrapper, Flourish, ArcGIS) kept in the same library, with the same caption, source and
// accessibility text as one made here. It draws through the site's existing embed rules (`lib/embeds.ts`: a built-in or approved host loads
// at once, any other waits for a click, every frame is sandboxed). It has no dataset: the data lives with the other service.

import { EMBED_FAILURE_MESSAGE, resolveEmbed } from '../../embeds'
import type { EmbedSpec } from '../spec'
import type { EmbedModel, Engine } from './types'

export const embedEngine: Engine<EmbedSpec, EmbedModel> = {
  kind: 'embed',
  label: 'Embedded chart or map',
  validate(spec, _ctx, embedHosts) {
    if (!spec.url) return ['Enter the address of the chart or map.']
    const result = resolveEmbed(spec.url, [...embedHosts])
    return result.ok ? [] : [EMBED_FAILURE_MESSAGE[result.reason]]
  },
  prepare(spec) {
    return { engine: 'embed', url: spec.url, width: spec.width ?? null, height: spec.height ?? null }
  },
}
