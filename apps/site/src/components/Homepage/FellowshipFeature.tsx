import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Chip } from '@/components/Article/Parts'
import type { HomepageData } from '@/lib/homepage/load'

/**
 * The fellowship feature's content: the fellowship's chip, the story's headline and line, the links, and the funder line beside it (the acknowledgment panel, kept
 * apart from the story). The coded home page and the Fellowship feature block draw it the same way; the band and the container around it are the caller's.
 */
export function FellowshipFeatureBody({ feature, independenceHref }: { feature: NonNullable<HomepageData['feature']>; independenceHref: string | null }) {
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-start">
      <div className="flex flex-col gap-3">
        <div>
          <Chip href={feature.fellowship.slug ? `/fellowships/${feature.fellowship.slug}` : undefined} tone="teal">
            {feature.fellowship.title} Fellowship
          </Chip>
        </div>
        <h2 className="font-serif text-3xl font-semibold leading-tight text-ink" id="feature-heading">
          {feature.story ? feature.story.title : feature.fellowship.title}
        </h2>
        {(feature.story?.meta?.description ?? feature.fellowship.summary) && (
          <p className="text-lg text-ink-2">{feature.story?.meta?.description ?? feature.fellowship.summary}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-4 text-base font-semibold">
          {feature.story?.path && (
            <Link className="text-wuwf-blue-700 underline" href={feature.story.path}>
              Read the story
            </Link>
          )}
          {feature.fellowship.slug && (
            <Link className="text-wuwf-blue-700 underline" href={`/fellowships/${feature.fellowship.slug}`}>
              All {feature.fellowship.title} reporting
            </Link>
          )}
        </div>
      </div>
      <Acknowledgment
        headingId="feature-support-heading"
        hubHref={feature.fellowship.slug ? `/fellowships/${feature.fellowship.slug}` : null}
        independenceHref={independenceHref}
        lines={feature.acknowledgments}
      />
    </div>
  )
}
