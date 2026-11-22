import React from 'react'

import type { PlainTable } from '@/lib/dataviz/engines/types'
import type { VisualizationView } from '@/lib/dataviz/view'
import { cn } from '@/utilities/ui'
import { safeHref } from '@/lib/section-links'

import { DataTable } from './DataTable'
import { MapLoader } from './MapLoader'
import { SvgDrawing } from './SvgDrawing'

export type FigureSize = 'column' | 'wide'

const paragraphs = (text: string): string[] => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

/** The data as a plain table, behind a disclosure: the exact numbers for anyone who cannot read the picture. No script. */
export function PlainDataTable({ table, title }: { table: PlainTable; title: string }) {
  return (
    <details className="rounded-lg border border-rule bg-surface">
      <summary className="min-h-11 cursor-pointer px-4 py-3 font-sans text-sm font-semibold text-ink-2">View the data as a table</summary>
      <div aria-label={`${title}: data`} className="max-h-96 overflow-auto border-t border-rule" role="region" tabIndex={0}>
        <table className="w-full border-collapse text-left font-sans text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {table.columns.map((c) => (
                <th className="border-b border-rule-strong px-3 py-2 font-bold" key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th className="border-b border-rule px-3 py-2 font-semibold" key={i} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td className="border-b border-rule px-3 py-2 tabular-nums" key={i}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {table.more > 0 && <p className="px-3 py-2 text-sm text-ink-3">{table.more.toLocaleString('en-US')} more rows are in the download.</p>}
      </div>
    </details>
  )
}

function Legend({ entries, title }: { entries: Array<{ label: string; color: string }>; title?: string | null }) {
  if (entries.length === 0) return null
  return (
    <div className="font-sans text-sm text-ink-2">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
        {entries.map((e) => (
          <li className="flex items-center gap-2" key={e.label}>
            <span aria-hidden="true" className="inline-block size-3.5 rounded-sm border border-rule-strong" style={{ backgroundColor: e.color }} />
            {e.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One visualization as a reader sees it: the title, the figure, a legend, the exact data as a table, and what a reader is owed (what it shows
 * for someone who cannot see it, where the data came from, how it was made, which version, and a way to download it). Server-rendered;
 * the only scripts are the table's (sort, search, page) and the map's, and each loads only when it is used. The figure sits on its own white card, so its
 * colours are right whatever the page's tone.
 */
export async function VisualizationFigure({ view, size = 'column', headingLevel = 3 }: { view: VisualizationView; size?: FigureSize; headingLevel?: 2 | 3 | 4 }) {
  const { model } = view
  const Heading = `h${headingLevel}` as 'h3'
  const descId = `viz-${view.id}-desc`
  const sourceHref = view.source?.url ? safeHref(view.source.url) : null
  const notes = view.methodology ? paragraphs(view.methodology) : []
  let body: React.ReactNode = null

  if (model.engine === 'chart') {
    body = (
      <>
        <SvgDrawing className="hidden h-auto w-full md:block" describedBy={descId} label={view.title} node={model.wide} />
        <SvgDrawing className="block h-auto w-full md:hidden" describedBy={descId} label={view.title} node={model.narrow} />
        <Legend entries={model.legend} />
        <PlainDataTable table={model.dataTable} title={view.title} />
      </>
    )
  } else if (model.engine === 'map') {
    const styleUrl = process.env.MAP_STYLE_URL?.startsWith('https://') ? process.env.MAP_STYLE_URL : null
    body = (
      <>
        <SvgDrawing className="h-auto w-full" describedBy={descId} label={view.title} node={model.svg} />
        <Legend entries={model.legend} title={model.legendTitle} />
        {model.hasNoData && <p className="m-0 font-sans text-sm text-ink-3">Grey areas have no data.</p>}
        {model.interactive && <MapLoader data={model.interactive} label={view.title} styleUrl={styleUrl} />}
        <PlainDataTable table={model.dataTable} title={view.title} />
      </>
    )
  } else if (model.engine === 'table') {
    body = <DataTable caption={view.title} model={model} />
    if (model.omitted > 0) body = <>{body}<p className="m-0 font-sans text-sm text-ink-3">The first rows are shown; the download has all of them.</p></>
  } else if (model.engine === 'embed') {
    const { EmbedBlock } = await import('@/blocks/Embed/Component')
    body = <EmbedBlock blockType="embed" className="my-0" height={model.height} title={view.title} url={model.url} width={model.width} />
  }

  return (
    <figure
      aria-labelledby={`viz-${view.id}-title`}
      className={cn('not-prose my-8 flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4 text-ink md:p-6', size === 'wide' && 'md:-mx-8 lg:-mx-16')}
      data-viz={view.kind}
    >
      <Heading className="m-0 font-serif text-xl font-semibold leading-snug" id={`viz-${view.id}-title`}>
        {view.title}
      </Heading>
      {view.caption && <p className="m-0 font-sans text-base text-ink-2">{view.caption}</p>}
      {view.altText && (
        <p className="sr-only" id={descId}>
          {view.altText}
        </p>
      )}
      <div className="flex flex-col gap-3">{body}</div>
      <figcaption className="flex flex-col gap-2 border-t border-rule pt-3 font-sans text-sm text-ink-3">
        {view.source && (
          <p className="m-0">
            Source:{' '}
            {sourceHref ? (
              <a className="font-semibold text-wuwf-blue-700 underline" href={sourceHref} rel="noopener noreferrer">
                {view.source.name}
              </a>
            ) : (
              view.source.name
            )}
          </p>
        )}
        {view.data && (
          <p className="m-0">
            {view.data.datasetTitle}
            {view.data.versionLabel ? `: ${view.data.versionLabel}` : ''}
            {view.data.asOf ? `. Data as of ${new Date(view.data.asOf).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}.` : ''}
          </p>
        )}
        {notes.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink-2">How this was made</summary>
            {notes.map((p, i) => (
              <p className="mb-2 mt-0" key={i}>
                {p}
              </p>
            ))}
          </details>
        )}
        {view.download && (
          <p className="m-0">
            <a className="inline-flex min-h-11 items-center font-semibold text-wuwf-blue-700 underline" download={view.download.filename} href={view.download.url}>
              {view.download.label}
            </a>
          </p>
        )}
      </figcaption>
    </figure>
  )
}
