import type { ListeningRoom, ListeningRoomTable, ListeningTableState } from '@wuwf/portal-contracts'

/**
 * The organizer's console (board 5g), pure half. It shows where every table is, never what was said: the Portal's `room` reply
 * carries no words. Each read is also the console checking in, which is what lets a table's phone say "Help is coming", so the
 * console polls on a fixed beat while it is open.
 */
export const ROOM_POLL_MS = 15_000

export const TABLE_STATE_LABEL: Record<ListeningTableState, string> = {
  waiting: 'Waiting',
  agreed: 'Agreed',
  recording: 'Recording',
  paused: 'Paused',
  ended: 'Ended',
  sent: 'Sent',
}

export interface RoomCounts {
  total: number
  recording: number
  waiting: number
  paused: number
  done: number
  help: number
}

export function roomCounts(tables: ListeningRoomTable[]): RoomCounts {
  const counts: RoomCounts = { total: tables.length, recording: 0, waiting: 0, paused: 0, done: 0, help: 0 }
  for (const table of tables) {
    if (table.state === 'recording') counts.recording += 1
    else if (table.state === 'waiting' || table.state === 'agreed') counts.waiting += 1
    else if (table.state === 'paused') counts.paused += 1
    else counts.done += 1
    if (table.helpRequested) counts.help += 1
  }
  return counts
}

/** "10 tables · 7 recording · 2 waiting · 1 asked for a hand". Parts that are zero are left out. */
export function roomSummary(tables: ListeningRoomTable[]): string {
  const c = roomCounts(tables)
  const parts = [`${c.total} ${c.total === 1 ? 'table' : 'tables'}`]
  if (c.recording) parts.push(`${c.recording} recording`)
  if (c.paused) parts.push(`${c.paused} paused`)
  if (c.waiting) parts.push(`${c.waiting} waiting`)
  if (c.done) parts.push(`${c.done} finished`)
  if (c.help) parts.push(`${c.help} asked for a hand`)
  return parts.join(' · ')
}

/** Tables that asked for a hand, by number. */
export function tablesAskingForHelp(tables: ListeningRoomTable[]): ListeningRoomTable[] {
  return tables.filter((t) => t.helpRequested).sort((a, b) => a.number - b.number)
}

/** How many tables are on each prompt, for the plan list. Tables that have ended are not counted: they are past the plan. */
export function tablesOnPrompt(tables: ListeningRoomTable[], position: number): number {
  return tables.filter((t) => t.promptPosition === position && t.state !== 'ended' && t.state !== 'sent').length
}

/** "1 h 12 min in", "starts in 20 min", or "ended". The room's own clock is the server's; this is only the sentence. */
export function sinceStart(startsAt: string, endsAt: string, now: Date): string {
  const start = Date.parse(startsAt)
  const end = Date.parse(endsAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return ''
  const minutes = Math.round((now.getTime() - start) / 60000)
  if (minutes < 0) return `starts in ${spanWords(-minutes)}`
  if (now.getTime() > end) return 'past its end time'
  return `${spanWords(minutes)} in`
}

function spanWords(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** What "Call last five minutes" tells the room, before and after it has been called. */
export function lastCallSentence(lastCallAt: string | null, format: (iso: string) => string): string {
  return lastCallAt ? `Last five minutes called at ${format(lastCallAt)}. Tables end and send on their own.` : 'Puts a note on every table’s phone. Say it out loud too. Each table ends its own recording.'
}

export function canCallLastFive(room: Pick<ListeningRoom, 'lastCallAt' | 'status'>): boolean {
  return room.lastCallAt === null && room.status === 'live'
}
