'use client'

import dynamic from 'next/dynamic'
import React, { useState } from 'react'

import type { MapModel } from '@/lib/dataviz/engines/types'

// MapLibre and its style sheet are a separate chunk, fetched only when a reader presses the button.
const MapExplorer = dynamic(() => import('./MapExplorer'), { ssr: false, loading: () => <p className="py-6 text-center font-sans text-sm text-ink-3">Loading the map…</p> })

export function MapLoader({ data, styleUrl, label }: { data: NonNullable<MapModel['interactive']>; styleUrl: string | null; label: string }) {
  const [open, setOpen] = useState(false)
  if (open) return <MapExplorer data={data} label={label} styleUrl={styleUrl} />
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-rule-strong bg-surface px-5 font-sans text-base font-semibold text-ink hover:bg-surface-2"
      onClick={() => setOpen(true)}
      type="button"
    >
      Explore the map
    </button>
  )
}
