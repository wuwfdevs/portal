// The style a map starts from. With no style address (`MAP_STYLE_URL`) a map draws a flat ground and nothing else: no tile, glyph or sprite request goes to a map provider on a reader's
// behalf, so no provider sees a visit. Colours are the design tokens. Pure.

import { colors } from '@wuwf/design-tokens'
import type { StyleSpecification } from 'maplibre-gl'

/** The flat ground: the colour of water on a map that draws land itself (Explore's Florida outline), a quiet panel colour for a data map. */
export function blankStyle(ground: keyof typeof colors = 'surface-2'): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': colors[ground] } }] }
}

/** The style a map is given: the station's address when it set one, else the flat ground. */
export function mapStyle(styleUrl: string | null, ground: keyof typeof colors = 'surface-2'): string | StyleSpecification {
  return styleUrl ?? blankStyle(ground)
}
