'use client'

import type { RelationshipFieldClientComponent } from 'payload'

import { RelationshipField, useConfig, useDocumentDrawer, useField } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

/**
 * The chart picker in a story or a page section: Payload's own relationship field (choose, clear, press + to make one), with an explicit
 * **Edit this chart** button under it. Payload's small pencil is hidden whenever it cannot read the chosen record's title, and a story's
 * editor is the one place nobody should have to hunt for a way into the chart. The button opens the chart's own form in a drawer; saving
 * there changes the chart everywhere it is shown (the visualization is the one copy). When the record is gone it says so, instead of a
 * label that reads "Untitled".
 */
export const VisualizationPicker: RelationshipFieldClientComponent = (props) => {
  const { path } = props
  const { config } = useConfig()
  const { value } = useField<number | string | { id: number | string; value?: never } | { relationTo: string; value: number | string } | null>({ path })
  const id = value && typeof value === 'object' ? ('value' in value && value.value !== undefined ? value.value : (value as { id: number | string }).id) : (value ?? null)

  const [DocumentDrawer, , { openDrawer }] = useDocumentDrawer({ collectionSlug: 'visualizations', id: id != null && id !== '' && Number.isFinite(Number(id)) ? Number(id) : null })
  const [missing, setMissing] = useState(false)
  const [saved, setSaved] = useState(0)

  // Does the chosen record still exist? (Checked again after a save or a delete in the drawer.)
  useEffect(() => {
    if (id == null || id === '') return
    const controller = new AbortController()
    fetch(`${config.serverURL ?? ''}${config.routes.api}/visualizations/${encodeURIComponent(String(id))}?depth=0&draft=true&select[title]=true`, { credentials: 'same-origin', signal: controller.signal })
      .then((r) => setMissing(r.status === 404))
      .catch(() => undefined)
    return () => controller.abort()
  }, [config.routes.api, config.serverURL, id, saved])

  const chosen = id != null && id !== ''
  return (
    <div>
      <RelationshipField {...props} />
      {chosen ? (
        <div style={{ marginTop: 8, marginBottom: 'var(--base)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {missing ? (
            <p role="status" style={{ margin: 0, fontSize: 13 }}>
              This chart no longer exists. Choose another, or press + to make a new one.
            </p>
          ) : (
            <button
              onClick={openDrawer}
              style={{ padding: '7px 12px', borderRadius: 4, border: '1px solid var(--theme-elevation-300)', background: 'transparent', color: 'var(--theme-text)', font: 'inherit', cursor: 'pointer' }}
              type="button"
            >
              Edit this chart
            </button>
          )}
          <DocumentDrawer onDelete={() => setSaved((n) => n + 1)} onSave={() => setSaved((n) => n + 1)} />
        </div>
      ) : null}
    </div>
  )
}
