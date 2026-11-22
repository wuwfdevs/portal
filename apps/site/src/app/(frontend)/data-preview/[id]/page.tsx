import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { headers as nextHeaders } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { userCan } from '@/access/permissions'
import { VisualizationFigure } from '@/components/DataViz/Figure'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { readVisualization } from '@/lib/dataviz/read'

// A signed-in editor's view of a visualization: the draft, drawn from the newest version of its data, staged or not. Every request, never cached,
// and never indexed. It is what the admin's Preview button and live preview open.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Visualization preview', robots: { index: false, follow: false } }

type Args = { params: Promise<{ id: string }> }

export default async function DataPreviewPage({ params }: Args) {
  const { id } = await params
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user || !userCan(user as { roles?: string[] }, 'content.write')) notFound()
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const result = await readVisualization({ payload, mode: { kind: 'staff', user }, embedHosts: (settings.embedHosts ?? []).map((h) => h.host) }, id)
  if (!result.ok && result.reason === 'not found') notFound()

  return (
    <main className="container flex max-w-4xl flex-col gap-4 py-8">
      <LivePreviewListener />
      <p className="m-0 rounded-lg border border-rule bg-surface-2 p-3 font-sans text-sm text-ink-2">
        Preview for editors. It uses the newest version of the data, including one not yet published. Readers see the published figure and the newest <em>published</em> version.
      </p>
      {result.ok ? (
        <>
          {result.view.altText ? null : <p className="m-0 font-sans text-sm font-semibold text-warning-fg">Missing: the accessible description. It is required to publish.</p>}
          <VisualizationFigure view={result.view} />
        </>
      ) : (
        <div className="rounded-lg border border-warning-border bg-warning-bg p-4 font-sans text-base text-warning-fg" role="alert">
          <p className="m-0 font-semibold">This cannot be drawn yet:</p>
          <ul className="m-0 mt-2 list-disc pl-5">
            {(result.problems ?? [result.reason]).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}
