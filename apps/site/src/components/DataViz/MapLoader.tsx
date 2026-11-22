'use client'

import dynamic from 'next/dynamic'
import React, { useState } from 'react'

import type { MapModel } from '@/lib/dataviz/engines/types'

// MapLibre and its style sheet are a separate chunk, fetched only when a reader presses the button.
const MapExplorer = dynamic(() => import('./MapExplorer'), { ssr: false, loading: () => <p className="py-6 text-center font-sans text-sm text-ink-3">Loading the map…</p> })

/**
 * The map's picture (`children`, drawn on the server) and the button that swaps it for the pan-and-zoom map. Only one of the two is on the page at a time, and the
 * button switches back, so a reader never sees the same map twice.
 */
export function MapLoader({ data, styleUrl, label, children }: { data: NonNullable<MapModel['interactive']>; styleUrl: string | null; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open ? <MapExplorer data={data} label={label} styleUrl={styleUrl} /> : children}
      <button
        aria-pressed={open}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-rule-strong bg-surface px-5 font-sans text-base font-semibold text-ink hover:bg-surface-2"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {open ? 'Back to the simple map' : 'Explore the map'}
      </button>
    </>
  )
}
