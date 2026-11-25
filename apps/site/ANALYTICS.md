# Analytics

**Status (2026-11-25): the sponsor placement counter is built, end to end; the rest is specified.** The tiles report what they
show, the site's own route adds it to daily totals, and corporate support reads them (and downloads a sponsor's export) on each placement
and sponsor in the admin. **Placement counts run without a consent choice, provisionally** (owner, 2026-11-25, pending counsel; see
"Consent"). Nothing else is collected: the other events below are not emitted yet, and there is no consent banner. Where a definition is
custom rather than an audited standard, it says so.

## Principles

- **Vendor independent.** Components call a small dispatch adapter with a typed event. A vendor (PostHog is the
  primary candidate; GA4 and Chartbeat are possible complements) sits behind it and can be replaced. Do not
  install redundant trackers.
- **Consent first.** The adapter drops everything until consent is recorded, and drops what the visitor's choice
  excludes. The one exception is *counting*, the sponsor placement totals, provisionally (see "Consent").
- **First party on sponsor placements** (owner, 2026-11-25, narrowing the old "no third-party tracking pixels"): no ad
  network or ad server, no sponsor's or verification vendor's pixel or script, nothing that follows a reader to other sites.
  The site counts its own placements. If a sponsor ever needs audited figures, that is a new decision for the owner, and a
  report from a vendor's server is preferred to a vendor's script on the page.
- **Sponsor counts do not depend on a vendor.** The placement counter is the site's own (an endpoint and a table of daily
  totals), so the definitions and filters in a sponsor's report are ours and stay comparable year to year. A product-analytics
  vendor (PostHog the candidate) is a second, optional destination behind the same adapter, for staff questions, never the
  source of a sponsor's figures.
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
| `sponsor_placement_measurable` | The unit is on the page and the page's script can see it (**built**; replaces `sponsor_placement_rendered`, see below) | `placement_id`, `sponsor_id`, `zone`, `kind` |
| `sponsor_placement_viewable` | The unit met the viewable definition below (**built**) | same |
| `sponsor_placement_clicked` | A person clicked or middle-clicked the unit's link (**built**) | same |
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
| **Placement rendered** | The server put the placement in the page. **Not countable per visit:** pages are cached and served many times from one render, so the server never sees each view. Not reported. | custom |
| **Placement measurable** | The client could observe it (JS ran, element exists) | custom |
| **Viewable exposure** | At least 50% of the unit's pixels in view for at least 1 continuous second | modelled on the common display standard; **not audited** |
| **Click** | A trusted user-initiated activation of the unit | custom |
| **Audio/video engagement** | Play start and percent milestones, plus seconds played | custom |
| **Delivery vs commitment** | Valid viewable exposures ÷ contracted exposures for the period | custom |

The site has no `campaign_id`: it knows nothing of how a placement was sold (`PLACEMENTS.md`), so a placement event carries the placement
record and its sponsor, and a report reaches a campaign by joining on `placement_id` in the Portal.

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
states), and *counting* (below). The default for the chosen categories is off. Consent is stored per browser, revocable, and honoured by
the adapter before any vendor code loads. A signed-in person can export and delete their data.

**Counting needs no choice, provisionally** (owner, 2026-11-25: "assume no consent for now"). Only the three sponsor placement events are in
it. They set no cookie and store no identifier, no address and no page: each one adds one to a daily total per placement and is gone. **Open
for counsel:** whether that may run without consent. If counsel says no, `categoryOf` in `src/lib/analytics/consent.ts` puts them under
measurement and they wait for the banner; nothing else changes. Every other event stays behind a choice.

## The placement counter

- **In the page:** `components/Placements/Tracked` (each tile's card) emits the events; `analytics.track` checks them (`parseEvent`); the
  browser sink (`lib/analytics/beacon.ts`) holds them a few seconds and posts them in one batch to `/api/placement-counts` with
  `navigator.sendBeacon`, or at once when the page is hidden or left. A failed post is dropped, never retried, so nothing is counted twice.
- **At the route** (`app/api/placement-counts/route.ts`): the traffic filter (`lib/analytics/filter.ts`, versioned, its rules printed on every
  export) keeps posts from this site's pages, from browsers, at most 20 well-formed events and 4 KB, each kind once per placement per post.
  `tally` then keeps only events for a placement that is switched on and whose zone, kind and sponsor match the record, and takes those from
  the record, never from the browser. It answers 204 with no body whatever it counted, and a failure never reaches the reader.
- **Stored** in `placement_counts` (`src/db/placementCounts.ts`, migrations `20261125_230850_placement_counts` and
  `20261125_233720_placement_counts_attribution`): one row per station day, placement, zone, **sponsor and kind**, and filter version, with the
  three totals. The sponsor is in the key so a sponsor changed during a day never takes over the earlier sponsor's delivery (found in review). A plain table, not a collection; no foreign key, so a deleted placement keeps its
  history. Nothing personal is in it.
- **Read** by `GET /api/placement-items/delivery` (`collections/placementDeliveryEndpoints.ts`, the `sponsorship.manage` permission), drawn by
  the Delivery panel on a placement's and a sponsor's edit screen (`components/admin/PlacementDelivery`), and exported for a sponsor as CSV
  (`sponsorCsv`: figures under 10 shown as "fewer than 10", the definitions and the filter printed, "not audited").
- **Not built:** data-center address ranges and rate limits (they need the address, which is never kept); delivery against a contract's
  commitment (the commitment is the Portal's); the formal proof of performance, which stays the Portal's (`CLAUDE.md`: proof of delivery is
  not Payload's), reading these totals through a signed contract in `packages/portal-contracts` when that is designed.

## Order of work

1. **Built (2026-11-25):** the events, `parseEvent`, consent rules, the dispatcher and the viewable rule (`src/lib/analytics`); tiles carrying
   their record ids; `components/Placements/Tracked`.
2. **Built (2026-11-25):** the placement counter (above): the sink, the route and filter, `placement_counts`, the Delivery panel and the
   sponsor's export. Counting runs without a consent choice until counsel answers.
3. **Next:** ask counsel the counting question. Watch the first weeks of staging and production counts against the pages' traffic, and
   tighten the filter (a new `FILTER_VERSION`) if automated traffic shows through.
4. **Consent** for everything else: the visitor's choice (a banner and a settings link), stored per browser, read by the dispatcher; the
   wording through the university's privacy review and the UWF IT-04 notice.
5. **The rest of the taxonomy** (content views and engagement, listening steps, newsletter signup, membership appeals, acknowledgment shown),
   each added to `events.ts` when something emits it, behind consent, and **a product-analytics vendor** behind the same adapter if staff want
   one (PostHog the candidate, after evaluating it against the privacy and hosting constraints). It is a second destination, never the source
   of sponsor figures.
6. **The Portal's proof of performance:** a signed contract for the Portal to read a placement's daily totals, designed with the Portal's
   booking work.
