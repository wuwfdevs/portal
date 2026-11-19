'use client'

import { useRouter } from 'next/navigation'
import React from 'react'

/** The source choice: one dropdown instead of a pill per source, so the row does not grow with every station added. */
export const SourceFilter: React.FC<{ sources: { id: number; name: string }[]; current: number | null; hrefFor: Record<string, string> }> = ({ sources, current, hrefFor }) => {
  const router = useRouter()
  return (
    <label className="wuwf-queue__source">
      <span>Source</span>
      <select value={current === null ? '' : String(current)} onChange={(e) => router.push(hrefFor[e.target.value] ?? hrefFor[''])}>
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
