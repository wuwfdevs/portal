'use client'

import 'maplibre-gl/dist/maplibre-gl.css'

import { colors } from '@wuwf/design-tokens'
import type { GeoJSONSource, Map as MapLibreMap, Marker, Popup } from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import React, { useEffect, useRef } from 'react'

import { mapStyle } from '@/lib/dataviz/map-style'
import type { MapBounds, SitePoints } from '@/lib/explore/filter'
import { FLORIDA_BOUNDS, FLORIDA_OUTLINE_URL, boundsOf } from '@/lib/explore/florida'

// The worker is served from public/maplibre (scripts/copy-maplibre-worker.mjs); MapLibre cannot find it beside its bundled module. The same setting the data map makes.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

const SOURCE = 'sites'
const CLUSTER_CLASS =
  'flex items-center justify-center rounded-full border-4 border-surface font-sans font-bold text-surface shadow-2 outline-none [background-color:var(--tone-accent)] focus-visible:ring-4 focus-visible:ring-ink'
const SITE_CLASS = 'flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ink'
const DOT_CLASS = 'block size-5 rounded-full border-[3px] border-surface shadow-1 [background-color:var(--tone-accent)]'
const DOT_SELECTED_CLASS = 'block size-[1.875rem] rounded-full border-4 border-surface shadow-2 ring-[3px] ring-wuwf-lime [background-color:var(--tone-accent)]'

/**
 * Explore's map: the data map's MapLibre (the same worker and the same flat ground, `lib/dataviz/map-style`) with the sites clustered, so a state's worth of sites is readable at the
 * first glance and separates as the reader zooms. With no style address (`MAP_STYLE_URL`) it draws no basemap and asks no map provider for anything; Florida is then its own outline,
 * a file this site serves (`public/data`). The clusters and sites are real buttons laid over the map (a count, or the site's name; Enter or Space zooms in or selects), not pictures
 * of buttons, so a keyboard and a screen reader reach them; the map itself takes the arrow keys and plus and minus once it has focus. The list beside it holds the same sites,
 * so nothing depends on the map. The colours are the band's tone (`--tone-*`) and the design tokens; there is no hex here.
 */
export default function ExploreMap({
  points,
  selectedId,
  selectedNote,
  styleUrl,
  onSelect,
  onView,
  label,
}: {
  points: SitePoints
  selectedId: string | null
  /** The line under the selected site's name in its popup: "2 of 9 episodes in this window". */
  selectedNote: string | null
  styleUrl: string | null
  onSelect: (id: string | null) => void
  onView: (bounds: MapBounds) => void
  label: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLElement; id?: string }>())
  const popup = useRef<Popup | null>(null)
  // What the map's own handlers read, kept current without rebuilding the map.
  const latest = useRef({ points, selectedId, selectedNote, onSelect, onView })
  // Kept current after each render (a ref is not written during render), before the effects below read it: effects run in the order they are declared.
  useEffect(() => {
    latest.current = { points, selectedId, selectedNote, onSelect, onView }
  })

  useEffect(() => {
    const el = container.current
    if (!el) return
    const map = new maplibregl.Map({
      container: el,
      style: mapStyle(styleUrl, 'wuwf-blue-100'),
      bounds: FLORIDA_BOUNDS,
      fitBoundsOptions: { padding: 8 },
      attributionControl: styleUrl ? { compact: true } : false,
      cooperativeGestures: true,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const live = markers.current

    const style = (item: { el: HTMLElement; id?: string }) => {
      if (!item.id) return
      const selected = item.id === latest.current.selectedId
      const dot = item.el.firstElementChild as HTMLElement | null
      item.el.setAttribute('aria-pressed', String(selected))
      item.el.setAttribute('aria-label', `${item.el.dataset.name ?? 'Site'}${selected ? ', selected' : ''}`)
      if (dot) dot.className = selected ? DOT_SELECTED_CLASS : DOT_CLASS
      item.el.style.zIndex = selected ? '3' : '2'
    }

    const refreshMarkers = () => {
      if (!map.getSource(SOURCE)) return
      const seen = new Set<string>()
      for (const f of map.querySourceFeatures(SOURCE)) {
        const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string; name?: string }
        const key = props.cluster ? `c${props.cluster_id}` : `s${props.id}`
        if (seen.has(key)) continue
        seen.add(key)
        if (live.has(key)) continue
        const [lng, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates
        const button = document.createElement('button')
        button.type = 'button'
        if (props.cluster) {
          const n = props.point_count ?? 0
          const size = Math.round(Math.min(64, 34 + Math.sqrt(n) * 7))
          button.className = CLUSTER_CLASS
          button.style.width = `${size}px`
          button.style.height = `${size}px`
          button.style.minWidth = '44px'
          button.style.minHeight = '44px'
          button.textContent = String(n)
          button.setAttribute('aria-label', `${n} sites. Zoom in.`)
          const clusterId = props.cluster_id as number
          button.addEventListener('click', () => {
            const source = map.getSource(SOURCE) as GeoJSONSource | undefined
            void source?.getClusterExpansionZoom(clusterId).then((zoom) => map.easeTo({ center: [lng, lat], zoom: Math.min(zoom, 14) }))
          })
          live.set(key, { marker: new maplibregl.Marker({ element: button }).setLngLat([lng, lat]).addTo(map), el: button })
        } else {
          button.className = SITE_CLASS
          button.dataset.name = props.name ?? ''
          const dot = document.createElement('span')
          dot.className = DOT_CLASS
          button.append(dot)
          const id = props.id as string
          button.addEventListener('click', () => latest.current.onSelect(id))
          const item = { marker: new maplibregl.Marker({ element: button }).setLngLat([lng, lat]).addTo(map), el: button, id }
          live.set(key, item)
          style(item)
        }
      }
      for (const [key, item] of live) {
        if (!seen.has(key)) {
          item.marker.remove()
          live.delete(key)
        }
      }
    }

    const restyle = () => {
      for (const item of live.values()) style(item)
    }
    // The popup beside the selected site: its name and how many of its episodes the window holds. Text only, built from the site's own words.
    const showPopup = () => {
      popup.current?.remove()
      popup.current = null
      const id = latest.current.selectedId
      const f = id ? latest.current.points.features.find((x) => x.properties.id === id) : undefined
      if (!f) return
      const box = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = f.properties.name
      box.append(name)
      if (latest.current.selectedNote) {
        const note = document.createElement('div')
        note.textContent = latest.current.selectedNote
        box.append(note)
      }
      popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 22, className: 'explore-popup' }).setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(box).addTo(map)
    }
    ;(el as HTMLElement & { __restyle?: () => void; __popup?: () => void }).__restyle = restyle
    ;(el as HTMLElement & { __restyle?: () => void; __popup?: () => void }).__popup = showPopup

    map.on('load', () => {
      // Without a basemap the state is its own outline: land in the page's white, a hairline coast. With the station's style the style draws the land.
      if (!styleUrl) {
        map.addSource('florida', { type: 'geojson', data: FLORIDA_OUTLINE_URL })
        map.addLayer({ id: 'florida-land', type: 'fill', source: 'florida', paint: { 'fill-color': colors.surface } })
        map.addLayer({ id: 'florida-coast', type: 'line', source: 'florida', paint: { 'line-color': colors['rule-strong'], 'line-width': 1 } })
      }
      map.addSource(SOURCE, { type: 'geojson', data: latest.current.points as never, cluster: true, clusterRadius: 44, clusterMaxZoom: 10 })
      // Present so the source is read; the buttons are the visible marks.
      map.addLayer({ id: 'sites-read', type: 'circle', source: SOURCE, paint: { 'circle-radius': 1, 'circle-opacity': 0 } })
      latest.current.onView(boundsOf(map.getBounds().getSouthWest(), map.getBounds().getNorthEast()))
    })
    map.on('sourcedata', (e) => {
      if (e.sourceId === SOURCE && e.isSourceLoaded) refreshMarkers()
    })
    map.on('moveend', () => {
      refreshMarkers()
      latest.current.onView(boundsOf(map.getBounds().getSouthWest(), map.getBounds().getNorthEast()))
    })
    map.on('click', (e) => {
      // A click on the bare map clears the selection; a click on a button never reaches here (the button handles it).
      if ((e.originalEvent.target as HTMLElement).closest('button')) return
      latest.current.onSelect(null)
    })
    const markersAtCleanup = live
    return () => {
      popup.current?.remove()
      popup.current = null
      for (const item of markersAtCleanup.values()) item.marker.remove()
      markersAtCleanup.clear()
      map.remove()
      mapRef.current = null
    }
  }, [styleUrl])

  // The sites in the window changed: the source takes the new points, and the buttons follow when it has loaded them.
  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(SOURCE) as GeoJSONSource | undefined
    source?.setData(points as never)
  }, [points])

  // The selection changed: restyle the buttons, move to the site if it is out of view, and show its popup.
  useEffect(() => {
    const map = mapRef.current
    const el = container.current as (HTMLElement & { __restyle?: () => void; __popup?: () => void }) | null
    if (!map || !el) return
    el.__restyle?.()
    el.__popup?.()
    const f = selectedId ? points.features.find((x) => x.properties.id === selectedId) : undefined
    if (f && !map.getBounds().contains(f.geometry.coordinates as [number, number])) map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 7) })
  }, [selectedId, selectedNote, points])

  return (
    <div
      aria-label={`${label}. Interactive map: use the arrow keys to move and plus and minus to zoom. The same sites are in the list beside it.`}
      className="aspect-[4/3] max-h-[34rem] min-h-[20rem] w-full"
      ref={container}
      role="application"
      tabIndex={0}
    />
  )
}
