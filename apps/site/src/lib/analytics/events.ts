// The analytics events the site may send, and the one check every event passes before it goes anywhere. Pure.
//
// Two kinds (`ANALYTICS.md`, "Events"):
// - the sponsor placement events, which go only to the site's own counter (`/api/placement-counts`), never to a vendor;
// - the product-analytics events (listening, content, giving), which go to PostHog behind the visitor's choice (`consent.ts`).
// The rest of the taxonomy in `ANALYTICS.md` is added here, one event at a time, when something emits it. Events carry opaque ids and fixed
// words, never titles, names, free text or anything a visitor typed.

import { ZONES, type ZoneId } from '@/lib/placements/registry'

/** The placement events: the unit was drawn and the page's script could see it, it met the viewable rule (`viewability.ts`), it was clicked. */
export const PLACEMENT_EVENT_NAMES = ['sponsor_placement_measurable', 'sponsor_placement_viewable', 'sponsor_placement_clicked'] as const
export type PlacementEventName = (typeof PLACEMENT_EVENT_NAMES)[number]

/** Which placement an event is about. Every field is an id or a fixed word. */
export interface PlacementRef {
  /** The placement record's id (Sponsorship → Placements). */
  placement_id: string
  /** The sponsor record's id; null for WUWF's own promotion or a placement with no sponsor chosen. */
  sponsor_id: string | null
  zone: ZoneId
  kind: 'sponsor' | 'house'
}

export interface PlacementEvent extends PlacementRef {
  name: PlacementEventName
}

// ── Listening (the site's one player, `components/ListenLive/PlayerProvider.tsx`) ──────────────────────────────────────────────────────────

/** `live` is a channel's stream; `on_demand` is a piece of audio (a story's, an episode's). */
export type ListenSource = 'live' | 'on_demand'

/** What is being listened to: the channel's key (`lib/live/channels.ts`) for live, the track's id (`audio-<id>`) for on demand. */
export interface ListenRef {
  source: ListenSource
  stream_id: string
}

/** The listener pressed play and the audio started. One listen runs from the first sound to a pause, a stop, a switch or leaving the site. */
export interface ListenStartedEvent extends ListenRef {
  name: 'listen_started'
}

/** The listen ended. `seconds` is how long it ran, buffering included, whole seconds. */
export interface ListenStoppedEvent extends ListenRef {
  name: 'listen_stopped'
  seconds: number
}

/** On-demand audio passed a quarter of its length (25, 50, 75) or reached the end (100). Once per listen per mark. */
export interface AudioProgressedEvent {
  name: 'audio_progressed'
  audio_id: string
  percent: AudioPercent
}
export const AUDIO_PERCENTS = [25, 50, 75, 100] as const
export type AudioPercent = (typeof AUDIO_PERCENTS)[number]

// ── Content ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const CONTENT_KINDS = ['story', 'episode', 'show'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]
export const CONTENT_FORMATS = ['web', 'audio', 'video', 'live'] as const
export type ContentFormat = (typeof CONTENT_FORMATS)[number]

/** Which piece of content an event is about, as ids. A story's show is its production; its topic is its first category. */
export interface ContentRef {
  content_id: string
  content_kind: ContentKind
  format: ContentFormat | null
  show_id: string | null
  topic_id: string | null
}

export interface ContentViewedEvent extends ContentRef {
  name: 'content_viewed'
}

/** The reader engaged: read (75% of the page and 30 seconds with it in view, `engagement.ts`) or pressed play on its page. Once per view. */
export interface ContentEngagedEvent {
  name: 'content_engaged'
  content_id: string
  content_kind: ContentKind
  engagement_kind: 'read' | 'play'
}

// ── Giving and membership ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `membership` is the Shared text appeal (story pages, the home page); `support` is a Support section on a page of sections. */
export const APPEAL_KINDS = ['membership', 'support'] as const
export type AppealKind = (typeof APPEAL_KINDS)[number]
export const APPEAL_SURFACES = ['story', 'home', 'section'] as const
export type AppealSurface = (typeof APPEAL_SURFACES)[number]

export interface AppealRef {
  appeal_kind: AppealKind
  surface: AppealSurface
}

/** The appeal was half in view in a visible tab (once per page). */
export interface AppealShownEvent extends AppealRef {
  name: 'membership_appeal_shown'
}

/** A person clicked the appeal's button. */
export interface AppealClickedEvent extends AppealRef {
  name: 'membership_appeal_clicked'
}

/** A person pressed the Give page's button to the donation form, with how often they chose (the frequency's key). The gift itself is not
 * known here: it is made on the donation form, and `gift_completed` will come from a verified server-side source. */
export interface ConversionStartedEvent {
  name: 'conversion_started'
  surface: 'give_page'
  frequency: string | null
}

export type MeasurementEvent =
  | ListenStartedEvent
  | ListenStoppedEvent
  | AudioProgressedEvent
  | ContentViewedEvent
  | ContentEngagedEvent
  | AppealShownEvent
  | AppealClickedEvent
  | ConversionStartedEvent

export type AnalyticsEvent = PlacementEvent | MeasurementEvent
export type AnalyticsEventName = AnalyticsEvent['name']

// ── The check ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** An id as the database gives it: a number or a short token. Anything longer or with other characters is not an id and is refused. */
const ID = /^[A-Za-z0-9_-]{1,64}$/

/** The longest listen counted: a day. A longer one is a tab left open, and is refused rather than counted. */
export const MAX_LISTEN_SECONDS = 86_400

const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const isNullableId = (v: unknown) => v === null || isId(v)
const isZone = (v: unknown): v is ZoneId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ZONES, v)
const oneOf =
  (words: readonly unknown[]) =>
  (v: unknown): boolean =>
    words.includes(v)
const nullableOneOf = (words: readonly unknown[]) => (v: unknown) => v === null || words.includes(v)
const isSeconds = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_LISTEN_SECONDS

type Check = (v: unknown) => boolean

const PLACEMENT_FIELDS: Record<string, Check> = { placement_id: isId, sponsor_id: isNullableId, zone: isZone, kind: oneOf(['sponsor', 'house']) }
const LISTEN_FIELDS: Record<string, Check> = { source: oneOf(['live', 'on_demand']), stream_id: isId }
const APPEAL_FIELDS: Record<string, Check> = { appeal_kind: oneOf(APPEAL_KINDS), surface: oneOf(APPEAL_SURFACES) }

/** Every event the site sends, and exactly the fields each may carry. A field not listed is refused, so nothing can ride along. */
const SCHEMAS: Record<AnalyticsEventName, Record<string, Check>> = {
  sponsor_placement_measurable: PLACEMENT_FIELDS,
  sponsor_placement_viewable: PLACEMENT_FIELDS,
  sponsor_placement_clicked: PLACEMENT_FIELDS,
  listen_started: LISTEN_FIELDS,
  listen_stopped: { ...LISTEN_FIELDS, seconds: isSeconds },
  audio_progressed: { audio_id: isId, percent: oneOf(AUDIO_PERCENTS) },
  content_viewed: {
    content_id: isId,
    content_kind: oneOf(CONTENT_KINDS),
    format: nullableOneOf(CONTENT_FORMATS),
    show_id: isNullableId,
    topic_id: isNullableId,
  },
  content_engaged: { content_id: isId, content_kind: oneOf(CONTENT_KINDS), engagement_kind: oneOf(['read', 'play']) },
  membership_appeal_shown: APPEAL_FIELDS,
  membership_appeal_clicked: APPEAL_FIELDS,
  conversion_started: { surface: oneOf(['give_page']), frequency: isNullableId },
}

const isPlacementName = (v: unknown): v is PlacementEventName => (PLACEMENT_EVENT_NAMES as readonly unknown[]).includes(v)

/**
 * The event, if it is one the site sends and well formed, else null. Unknown names, unknown, missing or extra fields, a zone that does not
 * exist and an id that is not an id are all refused, so nothing unexpected (a title, a visitor's words) can ride along. Returns a fresh object
 * holding only the listed fields.
 */
export function parseEvent(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const name = v.name
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SCHEMAS, name)) return null
  const fields = SCHEMAS[name as AnalyticsEventName]
  if (Object.keys(v).some((k) => k !== 'name' && !Object.prototype.hasOwnProperty.call(fields, k))) return null
  const out: Record<string, unknown> = { name }
  for (const [key, check] of Object.entries(fields)) {
    if (!(key in v) || !check(v[key])) return null
    out[key] = v[key]
  }
  return out as unknown as AnalyticsEvent
}

/** A placement event only: what the site's own counter accepts from a browser. Every other event is refused there. */
export function parsePlacementEvent(value: unknown): PlacementEvent | null {
  const event = parseEvent(value)
  return event && isPlacementName(event.name) ? (event as PlacementEvent) : null
}

/** Whether an event is one of the sponsor placement events. */
export const isPlacementEvent = (event: AnalyticsEvent): event is PlacementEvent => isPlacementName(event.name)

/** The event for a placement, from its reference. */
export const placementEvent = (name: PlacementEventName, ref: PlacementRef): PlacementEvent => ({ name, placement_id: ref.placement_id, sponsor_id: ref.sponsor_id, zone: ref.zone, kind: ref.kind })
