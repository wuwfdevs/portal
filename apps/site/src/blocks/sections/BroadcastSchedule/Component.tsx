import React from 'react'

import { WeekSchedule } from '@/components/ListenLive/WeekSchedule'
import type { WeekScheduleData } from '@/lib/live/week'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export type BroadcastScheduleData = SectionData

/** The band around the week. A pure view over what the loader returns, so it is tested with fixtures. */
export function BroadcastScheduleView({ block, week }: { block: BroadcastScheduleData; week: WeekScheduleData }) {
  return (
    <SectionBand block={block} heading={block.heading}>
      <WeekSchedule days={week.days} today={week.today} weeks={week.weeks} />
    </SectionBand>
  )
}

/** Broadcast schedule. Draws nothing when the station has no stream set up. */
export async function BroadcastScheduleSection({ block }: SectionProps<BroadcastScheduleData>) {
  const { loadWeekSchedule } = await import('@/lib/live/week')
  const week = await loadWeekSchedule()
  if (!week) return null
  return <BroadcastScheduleView block={block} week={week} />
}
