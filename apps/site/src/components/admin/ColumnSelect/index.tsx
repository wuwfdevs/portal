'use client'

import type { OptionObject, TextFieldClientComponent } from 'payload'

import { SelectInput, useConfig, useField, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

type Column = { name: string; type: string }

/**
 * The picker for a field that names a column of the chosen dataset (a chart's axes, a map's join, a table's sort): the editor chooses from the
 * columns the file actually has, instead of typing a name and being told it is wrong at publish. It reads the columns of the version the
 * visualization will draw (the newest, or the pinned one) from the dataset-versions API as the signed-in editor, and filters them by the types the
 * field says it takes (`admin.custom.columnTypes`: a value axis takes numbers). `admin.custom.source` is `boundaries` for the field that names a
 * property of the boundary dataset instead.
 */
export const ColumnSelect: TextFieldClientComponent = ({ path, field }) => {
  const { config } = useConfig()
  const custom = (field.admin?.custom ?? {}) as { columnTypes?: string[]; source?: 'dataset' | 'boundaries' }
  const boundaries = custom.source === 'boundaries'
  const hasMany = Boolean('hasMany' in field && field.hasMany)
  const { value, setValue, showError } = useField<string | string[] | null>({ path })

  const datasetId = useFormFields(([fields]) => fields[boundaries ? 'map.boundaryDataset' : 'dataset']?.value) as number | string | null | undefined
  const pinned = useFormFields(([fields]) => fields[boundaries ? 'map.boundaryVersion' : 'pinnedVersion']?.value) as number | string | null | undefined
  const mode = useFormFields(([fields]) => fields.dataMode?.value) as string | undefined
  const followsPinned = boundaries ? pinned != null : mode === 'pinned' && pinned != null

  const [columns, setColumns] = useState<Column[] | null>(null)
  const [loadNote, setNote] = useState<string | null>(null)
  const noDataset = datasetId == null || datasetId === ''
  const note = noDataset ? 'Choose a dataset first.' : loadNote

  useEffect(() => {
    if (datasetId == null || datasetId === '') return
    const controller = new AbortController()
    const api = `${config.serverURL ?? ''}${config.routes.api}/dataset-versions`
    const url = followsPinned
      ? `${api}/${pinned}?depth=0&select[columns]=true`
      : `${api}?where[dataset][equals]=${encodeURIComponent(String(datasetId))}&sort=-version&limit=1&depth=0&select[columns]=true`
    fetch(url, { credentials: 'same-origin', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { columns?: Column[]; docs?: Array<{ columns?: Column[] }> }) => {
        const found = followsPinned ? body.columns : body.docs?.[0]?.columns
        if (!Array.isArray(found)) {
          setColumns(null)
          setNote('This dataset has no uploaded version yet.')
        } else {
          setColumns(found)
          setNote(null)
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') {
          setColumns(null)
          setNote('The columns could not be loaded.')
        }
      })
    return () => controller.abort()
  }, [config.routes.api, config.serverURL, datasetId, followsPinned, pinned])

  const types = custom.columnTypes ?? []
  const options: OptionObject[] = (noDataset ? [] : (columns ?? []))
    .filter((c) => types.length === 0 || types.includes(c.type))
    .map((c) => ({ label: `${c.name}  (${c.type === 'string' ? 'text' : c.type})`, value: c.name }))
  // A value that is no longer a column stays visible, so the editor can see what is wrong instead of an empty box.
  const current = Array.isArray(value) ? value : value ? [value] : []
  for (const v of current) if (!options.some((o) => o.value === v)) options.push({ label: `${v}  (not in this dataset)`, value: v })

  const label = typeof field.label === 'string' ? field.label : field.name
  const description = [typeof field.admin?.description === 'string' ? field.admin.description : null, note].filter(Boolean).join(' ')

  return (
    <SelectInput
      description={description || undefined}
      hasMany={hasMany}
      isClearable
      label={label}
      name={field.name}
      onChange={(selected) => {
        if (Array.isArray(selected)) setValue((selected as OptionObject[]).map((o) => String(o.value)))
        else setValue(selected ? String((selected as OptionObject).value) : null)
      }}
      options={options}
      path={path}
      placeholder={noDataset ? 'Choose a dataset first' : 'Choose a column'}
      required={field.required}
      showError={showError}
      value={hasMany ? (current as string[]) : ((current[0] as string | undefined) ?? undefined)}
    />
  )
}
