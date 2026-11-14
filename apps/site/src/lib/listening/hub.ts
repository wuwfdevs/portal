import type {
  ListeningHub,
  ListeningHubAnswered,
  ListeningHubCampaign,
  ListeningHubEvent,
  ListeningHubKitchenCampaign,
  ListeningHubOpen,
  ListeningOutcome,
} from '@wuwf/portal-contracts'

import { hubSessions } from './event'
import { maxMinutes, plural } from './flow'

/** The words of the listening hub's cards (board 5). Pure, so the sentences are tested. */

const STATION_TIME_ZONE = 'America/Chicago'

/** "open until Nov. 30", or just "open" with no end date. */
export function closesLabel(closesAt: string | null): string {
  if (!closesAt) return 'open'
  const date = new Date(closesAt)
  if (Number.isNaN(date.getTime())) return 'open'
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: STATION_TIME_ZONE })
  const day = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: STATION_TIME_ZONE })
  // AP style abbreviates most months with a period; May, June and July are written out.
  const abbreviated = /^(May|Jun|Jul)$/.test(month) ? (month === 'May' ? 'May' : month === 'Jun' ? 'June' : 'July') : `${month}.`
  return `open until ${abbreviated} ${day}`
}

/** The hub card's line, as the board words it: "2 questions · voice or text · open until Dec. 12". */
export function openMeta(item: Pick<ListeningHubOpen, 'questionCount' | 'allowTextAnswers' | 'closesAt'>): string {
  return [plural(item.questionCount, 'question'), item.allowTextAnswers ? 'voice or text' : 'voice', closesLabel(item.closesAt)].join(' · ')
}

/** The line above a card's question: "Coastal Futures · Leigh Ostrander", or the desk, or nothing. */
export function deskLabel(item: Pick<ListeningHubOpen | ListeningHubAnswered, 'contextLabel' | 'askedBy' | 'fromLabel'>): string | null {
  const parts = [item.contextLabel, item.askedBy].map((part) => part?.trim()).filter((part): part is string => Boolean(part))
  if (parts.length > 0) return parts.join(' · ')
  return item.fromLabel?.trim() || null
}

/** Who answered, as the board words it for a question that has an outcome. No line for zero. */
export function answeredBy(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? 'One person answered' : `${count.toLocaleString('en-US')} people answered`
}

const OUTCOME_KIND_LABEL = { story: 'Story', episode: 'Episode', report: 'Report' } as const

/** "Story · After Isaias". */
export function outcomeKicker(outcome: Pick<ListeningOutcome, 'kind'>, contextLabel: string | null): string {
  const kind = OUTCOME_KIND_LABEL[outcome.kind]
  return contextLabel?.trim() ? `${kind} · ${contextLabel.trim()}` : kind
}

/** "Oct. 23, 2026" from a calendar date, with no timezone shift. */
export function outcomeDate(publishedAt: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(publishedAt)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Component A's line (board 6): "3 questions · by voice · up to 4 minutes · open until Nov. 30". */
export function inviteMeta(item: { questions: { maxDurationSeconds: number }[]; allowTextAnswers: boolean; closesAt: string | null }): string {
  return [
    plural(item.questions.length, 'question'),
    item.allowTextAnswers ? 'by voice or in writing' : 'by voice',
    `up to ${plural(maxMinutes(item.questions), 'minute')}`,
    closesLabel(item.closesAt),
  ].join(' · ')
}

/** One campaign as the hub shows it: its question, then every way to take part in it. */
export interface HubBand {
  campaign: ListeningHubCampaign
  /** The campaign's own question, answered alone. */
  question: ListeningHubOpen | null
  /** Its listed public sessions, soonest first. */
  sessions: ListeningHubEvent[]
  /** Set when anyone may start a private table for it. */
  table: ListeningHubKitchenCampaign | null
}

export interface HubLayout {
  bands: HubBand[]
  /** Open questions that belong to no campaign (a reporter's own question). */
  questions: ListeningHubOpen[]
  /** Sessions and tables the Portal sent no campaign for, shown as they were before campaigns were grouped. */
  sessions: ListeningHubEvent[]
  tables: ListeningHubKitchenCampaign[]
}

/**
 * Groups what the Portal sent by campaign, so a campaign reads as one thing with several ways in. A campaign with nothing to
 * take part in yet makes no band. Anything not tied to a campaign the Portal listed stays in its own list, so a Portal that
 * sends no campaigns (an older one) gives the same page as before.
 */
export function hubLayout(hub: ListeningHub): HubLayout {
  const campaigns = hub.campaigns ?? []
  const sessions = hubSessions(hub)
  const tables = hub.kitchenCampaigns ?? []

  const bands = campaigns.flatMap((campaign): HubBand[] => {
    const band: HubBand = {
      campaign,
      question: hub.open.find((item) => item.campaignPublicId === campaign.publicId) ?? null,
      sessions: sessions.filter((item) => item.campaignPublicId === campaign.publicId),
      table: tables.find((item) => item.publicId === campaign.publicId) ?? null,
    }
    return band.question || band.sessions.length > 0 || band.table ? [band] : []
  })

  const grouped = new Set(bands.map((band) => band.campaign.publicId))
  const inBand = (campaignPublicId: string | null | undefined) => campaignPublicId != null && grouped.has(campaignPublicId)
  return {
    bands,
    questions: hub.open.filter((item) => !inBand(item.campaignPublicId)),
    sessions: sessions.filter((item) => !inBand(item.campaignPublicId)),
    tables: tables.filter((item) => !grouped.has(item.publicId)),
  }
}

/** The band's eyebrow: "After Isaias · open until Nov. 30 · from the WUWF News desk". */
export function bandLabel(campaign: Pick<ListeningHubCampaign, 'title' | 'closesAt' | 'ownerLabel'>): string {
  return [campaign.title.trim(), closesLabel(campaign.closesAt), campaign.ownerLabel?.trim()].filter(Boolean).join(' · ')
}
