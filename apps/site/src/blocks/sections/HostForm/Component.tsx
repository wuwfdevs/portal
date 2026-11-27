import React, { Suspense } from 'react'

import { SectionBand } from '../SectionBand'
import { lightFormCard } from '../listening-parts'
import type { SectionData, SectionProps } from '../types'

export type HostFormData = SectionData

/**
 * The request form, in a card of its own so it is right on every tone. Loaded when the section draws (it sends through a server action to the Portal).
 * A request is always about a question, so the form offers the open questions that invite hosts, read from the hub the page's shell loaded
 * (`/listens/host` loads it per request). With no hub (the cached catch-all, or the Portal not set up) the form says nothing is asking. The form
 * reads `?query=` in the browser, inside Suspense, to start on the question the visitor came from.
 */
export async function HostFormSection({ block, context }: SectionProps<HostFormData>) {
  const { HostForm } = await import('@/components/Listening/HostForm')
  const hub = context.listeningHub?.kind === 'ok' ? context.listeningHub.hub : null
  const questions = (hub?.open ?? []).filter((item) => item.canRequestHost).map((item) => ({ publicId: item.publicId, title: item.title }))
  return (
    <SectionBand block={block} heading={block.heading}>
      <div className={`max-w-3xl ${lightFormCard}`}>
        <Suspense>
          <HostForm questions={questions} />
        </Suspense>
      </div>
    </SectionBand>
  )
}
