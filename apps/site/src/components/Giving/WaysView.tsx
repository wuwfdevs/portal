import Link from 'next/link'
import React from 'react'

import { groupViews, panelViews, type GivingContent, type PanelView } from '@/lib/giving/content'
import { GIVING_PATHS } from '@/lib/giving/paths'
import { detailsText, groupTarget, type WaySelection } from '@/lib/giving/ways'
import { cn } from '@/utilities/ui'

import { ButtonLink, CheckList, ContactBand, eyebrow, Hero, Paragraphs, StepList } from '../PageParts'
import { CopyButton } from '../PageParts/CopyButton'
import { ContactActions, GivingShell } from './parts'

const wayHref = (slug: string) => `${GIVING_PATHS.ways}?way=${encodeURIComponent(slug)}`

/** Other ways to give (board 14b): five choices across the top, one open at a time. Each is a plain link (`?way=stock`), so one can be linked to and nothing needs script. */
export function WaysView({ content, selection }: { content: GivingContent; selection: WaySelection<PanelView> | null }) {
  const w = content.ways
  const groups = groupViews(w)
  const panels = panelViews(w)
  const details = w?.details
  const rows = (details?.rows ?? []).filter((r) => r.label?.trim() && r.value?.trim())

  const tabs = groups.length > 0 && (
    <nav aria-label={w?.hero?.eyebrow || 'Ways to give'}>
      <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))]">
        {groups.flatMap((g) => {
          const slug = groupTarget(panels, g.key)
          if (!slug) return []
          const on = selection?.group === g.key
          return [
            <li key={g.key}>
              <Link
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'flex h-full min-h-11 flex-col items-start gap-1 rounded-md p-4 text-left text-ink no-underline hover:no-underline md:px-[1.125rem]',
                  on ? 'border-2 border-wuwf-blue-700 bg-wuwf-blue-100' : 'border border-rule-strong bg-surface hover:bg-surface-2',
                )}
                href={wayHref(slug)}
                scroll={false}
              >
                <strong className="text-[1.0625rem]">{g.label}</strong>
                {g.best && <span className="text-sm font-normal">{g.best}</span>}
                {g.effort && <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-3">{g.effort}</span>}
              </Link>
            </li>,
          ]
        })}
      </ul>
    </nav>
  )

  const panel = selection?.panel
  const siblings = selection?.siblings ?? []

  return (
    <GivingShell content={content} current="ways">
      <Hero below={tabs || undefined} eyebrow={w?.hero?.eyebrow ?? ''} title={w?.hero?.title ?? ''} tone="grey">
        <Paragraphs text={w?.hero?.body} />
      </Hero>

      {panel && (
        <section aria-label={panel.title || panel.eyebrow || 'Way to give'} id="way">
          <div className="container flex flex-col gap-7 py-12 md:py-14">
            {siblings.length > 1 && (
              <nav aria-label="Kind of gift" className="self-start">
                <ul className="inline-flex list-none flex-wrap gap-1 rounded-md bg-surface-3 p-1">
                  {siblings.map((s) => (
                    <li key={s.slug}>
                      <Link
                        aria-current={s.slug === panel.slug ? 'true' : undefined}
                        className={cn('inline-flex min-h-11 items-center rounded-sm px-[1.125rem] text-[0.9375rem] font-semibold no-underline hover:no-underline', s.slug === panel.slug ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink')}
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
                {panel.eyebrow && <span className={`${eyebrow} text-wuwf-blue-700`}>{panel.eyebrow}</span>}
                <h2 className="font-serif text-4xl font-bold leading-tight">{panel.title}</h2>
                {panel.lead && <p className="text-lg text-ink-2">{panel.lead}</p>}
                <div className="pt-1.5">
                  <ButtonLink href={panel.buttonHref} label={panel.buttonLabel} />
                </div>

                {panel.showDetails && rows.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-md border border-rule-strong bg-surface-2 p-5">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <strong className="text-[0.9375rem]">{details?.title}</strong>
                      {details?.copyLabel && <CopyButton copiedLabel={details.copiedLabel || details.copyLabel} label={details.copyLabel} text={detailsText(rows)} />}
                    </div>
                    <dl>
                      {rows.map((r) => (
                        <div className="flex justify-between gap-4 border-b border-rule py-2 text-sm" key={r.id ?? r.label}>
                          <dt className="text-ink-3">{r.label}</dt>
                          <dd className="text-right font-bold">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {details?.note && <span className="pt-2 text-[0.8125rem] text-ink-3">{details.note}</span>}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
                <StepList steps={panel.steps.map((text) => ({ text }))} title={w?.stepsTitle ?? undefined} />
                {panel.notes.length > 0 && (
                  <div className="flex flex-col gap-2.5 rounded-md bg-surface-2 p-6">
                    {w?.notesTitle && <strong className="text-base">{w.notesTitle}</strong>}
                    <CheckList items={panel.notes} mark="•" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <ContactBand
        actions={<ContactActions call="onDark" callLabel={w?.contact?.callLabel} content={content} email="outlineOnDark" emailLabel={w?.contact?.emailLabel} />}
        id="contact"
        text={w?.contact?.text}
        title={w?.contact?.title}
      />
    </GivingShell>
  )
}
