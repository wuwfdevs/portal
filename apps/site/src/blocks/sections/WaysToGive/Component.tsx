import Link from 'next/link'
import React from 'react'

import { CopyButton } from '@/components/PageParts/CopyButton'
import { groupViews, panelViews } from '@/lib/giving/content'
import { GIVING_PATHS } from '@/lib/giving/paths'
import { detailsText, groupTarget, selectWay } from '@/lib/giving/ways'
import { paragraphs } from '@/lib/page-content'
import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import { ToneList } from '../giving-parts'
import { SectionActions, eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

type Rows = Parameters<typeof groupViews>[0]

export interface WaysToGiveData extends SectionData, NonNullable<Rows> {
  label?: string | null
  headline?: string | null
  line?: string | null
  stepsTitle?: string | null
  notesTitle?: string | null
  detailsTitle?: string | null
  copyLabel?: string | null
  copiedLabel?: string | null
  detailsNote?: string | null
}

const wayHref = (slug: string) => `${GIVING_PATHS.ways}?way=${encodeURIComponent(slug)}`
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

/**
 * Ways to give. The open choice is `?way=` from the page context (a coded route hands the query in; on any other page it is the first choice).
 * Draws nothing without a headline. The panel after the opening sits on a plain ground whatever the opening's tone is.
 */
export async function WaysToGiveSection({ block, context }: SectionProps<WaysToGiveData>) {
  const headline = block.headline?.trim()
  if (!headline) return null
  const groups = groupViews(block)
  const panels = panelViews(block)
  const selection = selectWay(panels, groups, first(context.query?.way))
  const panel = selection?.panel
  const siblings = selection?.siblings ?? []
  const label = block.label?.trim()
  const lines = paragraphs(block.line)

  const { loadGivingSettings } = await import('@/lib/giving/load')
  const settings = panel?.showDetails ? await loadGivingSettings() : null
  const rows = (settings?.giftDetails ?? []).filter((r) => r.label?.trim() && r.value?.trim())

  const tabs = groups.length > 0 && (
    <nav aria-label={label || 'Ways to give'}>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))]">
        {groups.flatMap((g) => {
          const slug = groupTarget(panels, g.key)
          if (!slug) return []
          const on = selection?.group === g.key
          return [
            <li key={g.key}>
              <Link
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'flex h-full min-h-11 flex-col items-start gap-1 rounded-lg p-4 text-left no-underline hover:no-underline md:px-[1.125rem]',
                  on ? 'border-2 [background-color:var(--tone-tint)] [border-color:var(--tone-accent)]' : 'border [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]',
                )}
                href={wayHref(slug)}
                scroll={false}
              >
                <strong className="text-[1.0625rem]">{g.label}</strong>
                {g.best && <span className="text-sm font-normal [color:var(--tone-muted)]">{g.best}</span>}
                {g.effort && <span className={eyebrowClass}>{g.effort}</span>}
              </Link>
            </li>,
          ]
        })}
      </ul>
    </nav>
  )

  return (
    <>
      <SectionBand block={block}>
        <div className="flex max-w-[44rem] flex-col gap-3">
          {label && <p className={eyebrowClass}>{label}</p>}
          <h1 className="font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-[3rem]">{headline}</h1>
          {lines.map((l) => (
            <p className="text-lg [color:var(--tone-muted)]" key={l}>
              {l}
            </p>
          ))}
        </div>
        {tabs || null}
      </SectionBand>

      {panel && (
        <SectionBand block={{ ...block, tone: 'plain', anchor: 'way' }}>
          {siblings.length > 1 && (
            <nav aria-label="Kind of gift" className="self-start">
              <ul className="m-0 inline-flex list-none flex-wrap gap-1 rounded-lg p-1 [background-color:var(--tone-tint)]">
                {siblings.map((s) => (
                  <li key={s.slug}>
                    <Link
                      aria-current={s.slug === panel.slug ? 'true' : undefined}
                      className={cn(
                        'inline-flex min-h-11 items-center rounded-md px-[1.125rem] text-[0.9375rem] font-semibold no-underline hover:no-underline',
                        s.slug === panel.slug ? 'shadow-sm [background-color:var(--tone-card)]' : '[color:var(--tone-muted)]',
                      )}
                      href={wayHref(s.slug)}
                      scroll={false}
                    >
                      {s.tabLabel || s.slug}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-3.5 lg:flex-1">
              {panel.eyebrow && <p className={eyebrowClass}>{panel.eyebrow}</p>}
              <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{panel.title}</h2>
              {panel.lead && <p className="text-lg [color:var(--tone-muted)]">{panel.lead}</p>}
              <SectionActions
                actions={[
                  { label: panel.buttonLabel, href: panel.buttonHref },
                  { label: panel.secondaryLabel, href: panel.secondaryHref },
                ]}
                className="pt-1.5"
              />

              {panel.showDetails && rows.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg border p-5 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <strong className="text-[0.9375rem]">{block.detailsTitle}</strong>
                    {block.copyLabel && <CopyButton copiedLabel={block.copiedLabel || block.copyLabel} label={block.copyLabel} text={detailsText(rows)} />}
                  </div>
                  <dl className="m-0">
                    {rows.map((r) => (
                      <div className="flex justify-between gap-4 border-b py-2 text-sm [border-color:var(--tone-card-rule)]" key={r.id ?? r.label}>
                        <dt className="[color:var(--tone-muted)]">{r.label}</dt>
                        <dd className="m-0 text-right font-bold">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {block.detailsNote && <span className="pt-2 text-[0.8125rem] [color:var(--tone-muted)]">{block.detailsNote}</span>}
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              {panel.steps.length > 0 && (
                <div className="flex flex-col gap-3">
                  {block.stepsTitle && <h3 className="font-serif text-xl font-bold">{block.stepsTitle}</h3>}
                  <ol className="m-0 flex list-none flex-col gap-3 p-0">
                    {panel.steps.map((step, i) => (
                      <li className="flex gap-3 rounded-lg border p-4 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]" key={`${i}-${step}`}>
                        <span aria-hidden="true" className="font-serif text-2xl font-bold leading-none [color:var(--tone-accent)]">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {panel.notes.length > 0 && (
                <div className="flex flex-col gap-2.5 rounded-lg p-6 [background-color:var(--tone-tint)]">
                  {block.notesTitle && <strong className="text-base">{block.notesTitle}</strong>}
                  <ToneList items={panel.notes} mark="•" />
                </div>
              )}
            </div>
          </div>
        </SectionBand>
      )}
    </>
  )
}
