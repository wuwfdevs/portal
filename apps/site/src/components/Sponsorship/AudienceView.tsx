import React from 'react'

import { shown, toStats, type SponsorshipContent } from '@/lib/sponsorship/content'

import { SectorPicker } from './SectorPicker'
import { ContentHero, ProposalBand, Section, Source, SponsorshipShell, StatGrid, headingProps } from './parts'

/** Board 20: Audience. Evidence in order of closeness to WUWF; every figure carries its source and base, all edited in the admin. */
export const AudienceView: React.FC<{ content: SponsorshipContent }> = ({ content }) => {
  const a = content.audience
  const clamp = (n: number | null | undefined) => Math.max(0, Math.min(100, n ?? 0))

  return (
    <SponsorshipShell content={content} current="audience">
      <ContentHero hero={a?.hero} />

      {shown(a?.wuwf) && (
        <Section {...headingProps(a.wuwf)}>
          <StatGrid columns={3} stats={toStats(a.wuwf.stats)} />
          {a.wuwf.source && <Source>{a.wuwf.source}</Source>}
        </Section>
      )}

      {shown(a?.small) && (
        <Section {...headingProps(a.small)} tone="grey">
          <StatGrid stats={toStats(a.small.stats)} />
          {(a.small.skeptical?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-serif text-2xl font-bold">{a.small.skepticalTitle}</h3>
              <StatGrid columns={4} stats={toStats(a.small.skeptical)} />
            </div>
          )}
          {a.small.source && <Source>{a.small.source}</Source>}
        </Section>
      )}

      {shown(a?.halo) && (
        <Section {...headingProps(a.halo)}>
          <StatGrid columns={3} stats={toStats(a.halo.stats)} />
          {(a.halo.comparison?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3">
              <strong className="text-sm">{a.halo.compareTitle}</strong>
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {(a.halo.comparison ?? []).map((c) => (
                  <li className="flex flex-col gap-1.5" key={c.id ?? c.label}>
                    <span className="text-base text-ink-2">{c.label}</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <div aria-hidden="true" className="h-3.5 rounded-[2px] bg-wuwf-lime-600" style={{ width: `${clamp(c.npr)}%` }} />
                        <span className="text-sm font-bold">
                          {c.npr}% · {a.halo?.nprLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div aria-hidden="true" className="h-3.5 rounded-[2px] bg-ink-4" style={{ width: `${clamp(c.commercial)}%` }} />
                        <span className="text-sm text-ink-2">
                          {c.commercial}% · {a.halo?.commercialLabel}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.halo.caveat && <Source>{a.halo.caveat}</Source>}
          {a.halo.source && <Source>{a.halo.source}</Source>}
        </Section>
      )}

      {shown(a?.national) && (
        <Section {...headingProps(a.national)} tone="grey">
          <StatGrid columns={4} stats={toStats(a.national.stats)} />
          {a.national.source && <Source>{a.national.source}</Source>}
          {(a.national.glance?.length ?? 0) > 0 && (
            <>
              <h3 className="font-serif text-2xl font-bold">{a.national.glanceTitle}</h3>
              <StatGrid columns={3} stats={toStats(a.national.glance)} />
              {a.national.glanceSource && <Source>{a.national.glanceSource}</Source>}
            </>
          )}
        </Section>
      )}

      {shown(a?.sectors) && (a.sectors.items?.length ?? 0) > 0 && (
        <Section {...headingProps(a.sectors)}>
          <SectorPicker
            copy={{ groupLabel: a.sectors.title ?? '', local: a.sectors.localLabel ?? '', national: a.sectors.nationalLabel ?? '', talk: a.sectors.talkLabel ?? '' }}
            sectors={(a.sectors.items ?? []).map((s, i) => ({
              key: s.id ?? `${i}`,
              name: s.name ?? '',
              short: s.short ?? s.name ?? '',
              title: s.title ?? '',
              lead: s.lead ?? '',
              local: toStats(s.local),
              national: toStats(s.national),
            }))}
          />
          {a.sectors.source && <Source>{a.sectors.source}</Source>}
        </Section>
      )}

      <ProposalBand closing={a?.closing} />
    </SponsorshipShell>
  )
}
