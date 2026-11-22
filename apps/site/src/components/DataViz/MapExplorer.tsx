'use client'

import 'maplibre-gl/dist/maplibre-gl.css'

import { colors } from '@wuwf/design-tokens'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import React, { useEffect, useRef } from 'react'

import type { MapModel } from '@/lib/dataviz/engines/types'

type Interactive = NonNullable<MapModel['interactive']>

/**
 * The pan-and-zoom map (MapLibre GL JS). It draws the same shapes in the same colours the server drew, from the same data, so it can add
 * movement but cannot disagree. There is no basemap unless the station has set a style address (`MAP_STYLE_URL`): without one no request goes to a map
 * provider. Names and values appear in a popup written as text. Keyboard: the map takes the arrow keys and +/- once it has focus.
 */
export default function MapExplorer({ data, styleUrl, label }: { data: Interactive; styleUrl: string | null; label: string }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = container.current
    if (!el) return
    const map: MapLibreMap = new maplibregl.Map({
      container: el,
      style: styleUrl ?? { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': colors['surface-2'] } }] },
      bounds: data.bounds,
      fitBoundsOptions: { padding: 32, maxZoom: 12 },
      attributionControl: false,
      cooperativeGestures: true,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('shapes', { type: 'geojson', data: data.features as never })
      map.addLayer({ id: 'fill', type: 'fill', source: 'shapes', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.9 } })
      map.addLayer({ id: 'outline', type: 'line', source: 'shapes', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': colors['rule-strong'], 'line-width': 0.75 } })
      map.addLayer({ id: 'points', type: 'circle', source: 'shapes', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': ['get', 'color'], 'circle-radius': 6, 'circle-stroke-color': colors['rule-strong'], 'circle-stroke-width': 1 } })
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      for (const layer of ['fill', 'points']) {
        map.on('click', layer, (e) => {
          const props = e.features?.[0]?.properties as { label?: string; value?: number | null } | undefined
          if (!props) return
          const box = document.createElement('div')
          const name = document.createElement('strong')
          name.textContent = props.label || 'Area'
          box.append(name)
          if (props.value !== null && props.value !== undefined && props.value !== ('null' as unknown)) {
            const v = document.createElement('div')
            v.textContent = String(props.value)
            box.append(v)
          }
          popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map)
        })
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
      }
      void (map.getSource('shapes') as GeoJSONSource | undefined)
    })
    return () => map.remove()
  }, [data, styleUrl])

  return <div aria-label={`${label}. Interactive map: use the arrow keys to move and plus and minus to zoom. The same information is in the data table below.`} className="h-[24rem] w-full overflow-hidden rounded-4" ref={container} role="application" tabIndex={0} />
}
