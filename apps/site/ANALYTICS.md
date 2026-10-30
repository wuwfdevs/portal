# Analytics

**Status: Specified. Nothing here is built or collecting data.** This is the contract the implementation will be
held to. Where a definition is custom rather than an audited standard, it says so.

## Principles

- **Vendor independent.** Components call a small dispatch adapter with a typed event. A vendor (PostHog is the
  primary candidate; GA4 and Chartbeat are possible complements) sits behind it and can be replaced. Do not
  install redundant trackers.
- **Consent first.** The adapter drops everything until consent is recorded, and drops what the visitor's choice
  excludes. No third-party tracking pixels, ever, on sponsor placements.
- **Minimal.** No raw user text or audio in events or logs. Identifiers, not content.
- **Anonymous stays anonymous.** Never merge an anonymous history into an identified profile without a basis
  (an explicit sign-in by that person). Never link an analytics identity to a donor record.
- **Raw events stay out of the operational database.** They go to the vendor and, later, a warehouse. The
  operational database keeps only aggregates needed to run the product.
- **Trusted sources only for money.** `gift_completed` is emitted by a verified server-side source, never from
  the browser's word.
- **Graceful degradation.** If analytics is down, the site works exactly the same.

## Stable identifiers

Every event may carry these, as opaque ids or slugs, never titles or free text:

`content_id` · `show_id` · `episode_id` · `topic_id` · `publishing_identity_id` · `fellowship_id` · `series_id` ·
`sponsor_id` · `campaign_id` · `placement_id` · `listening_query_id`

Sponsor placements and content share these ids, so a proof-of-performance report joins on them.

## Events

Names are `object_action`, past tense, snake case.

| Event | When | Key properties |
|---|---|---|
| `content_viewed` | A story, episode or video page is shown | `content_id`, identifiers, `format`, `placement_surface` |
| `content_engaged` | Meaningful engagement: scrolled to 75% **and** at least 30 s visible, or any play | `content_id`, `engagement_kind` |
| `audio_progressed` / `video_progressed` | 25/50/75/100% | `content_id`, `episode_id`, `percent`, `source` (live/on-demand) |
| `newsletter_subscribed` | Signup confirmed | `newsletter_id`, `surface` |
| `listening_started` / `listening_answered` / `listening_submitted` | Listening flow steps | `listening_query_id`, `answer_mode`; **never** the answer |
| `follow_toggled` / `save_toggled` | Follow a topic/show, save an item | `target_kind`, `target_id`, `on` |
| `event_registered` | Event registration | `event_id` |
| `sponsor_placement_rendered` | A sponsor unit was put on the page | `sponsor_id`, `campaign_id`, `placement_id` |
| `sponsor_placement_viewable` | The unit met the viewable definition below | same |
| `sponsor_placement_clicked` | The unit was clicked | same |
| `acknowledgment_shown` | An underwriting line was rendered | `agreement_id`, `content_id` |
| `membership_appeal_shown` / `membership_appeal_clicked` | A member-support ask | `appeal_kind`, `surface` |
| `conversion_started` | Handoff to the donation form | `appeal_kind`, `attribution_code` |
| `gift_completed` | **Server-side, verified** | `attribution_code`, `level`; no donor identity |
| `feed_activated` | A member added a private feed in a podcast app or the site | `show_id` |
| `account_created` | A public account was created | `method` |

## Definitions

Kept apart, because they are not the same number:

| Measure | Definition | Standard? |
|---|---|---|
| **Pageview** | A page was loaded and displayed to a human-like client | custom |
| **Placement rendered** | The server put the placement in the page | custom |
| **Placement measurable** | The client could observe it (JS ran, element exists) | custom |
| **Viewable exposure** | At least 50% of the unit's pixels in view for at least 1 continuous second | modelled on the common display standard; **not audited** |
| **Click** | A trusted user-initiated activation of the unit | custom |
| **Audio/video engagement** | Play start and percent milestones, plus seconds played | custom |
| **Delivery vs commitment** | Valid viewable exposures ÷ contracted exposures for the period | custom |

Reports must not present a custom measure as an audited one. Automated traffic (known bot user agents, data-center
ranges, impossible interaction rates) and duplicates (the same visitor and placement inside a short window) are
filtered before delivery is counted; the filter's rules are versioned with each report.

## Reporting

- **Internal report:** counts by content, show, fellowship and listening query for staff.
- **Proof-of-performance** (for a campaign or fellowship): published pieces, reach where it is reliably
  measurable, engagement, plays, acknowledgment exposure, delivery against commitment and clicks. Traffic's
  affidavit of airing is attached later.
- **Aggregation thresholds:** a figure for fewer than a minimum number of visitors is suppressed or merged, so a
  sponsor can never infer an individual. Sponsors receive aggregates, never personal data.

## Consent

Categories: *necessary* (always on; no analytics), *measurement* (events above), *personalization* (relationship
states). The default is off. Consent is stored per browser, revocable, and honoured by the adapter before any
vendor code loads. A signed-in person can export and delete their data.

## Implementation notes (Planned)

1. `src/lib/analytics/events.ts` — the typed taxonomy (a discriminated union) and a runtime validator.
2. `src/lib/analytics/consent.ts` — pure consent state and rules, tested.
3. `src/lib/analytics/dispatch.ts` — the adapter interface and a no-op/console implementation.
4. A vendor implementation behind the interface, chosen after evaluating PostHog against the privacy and
   hosting constraints.
5. Instrument first: content views and engagement, listening steps, newsletter signup, membership appeals,
   sponsor rendered/viewable/clicked, acknowledgment shown.
