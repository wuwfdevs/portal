# Analytics

**Status (2026-11-25): the foundation and the sponsor placement watching are built; nothing is collected.** `src/lib/analytics`
(the events, the consent rules, the dispatcher, the viewable rule) and `components/Placements/Tracked` exist and are tested, but no
visitor's consent is ever recorded and the only sink sends nothing, so no event leaves the browser. The rest is the contract the
implementation will be held to (see "Order of work"). Where a definition is custom rather than an audited standard, it says so.

## Principles

- **Vendor independent.** Components call a small dispatch adapter with a typed event. A vendor (PostHog is the
  primary candidate; GA4 and Chartbeat are possible complements) sits behind it and can be replaced. Do not
  install redundant trackers.
- **Consent first.** The adapter drops everything until consent is recorded, and drops what the visitor's choice
  excludes.
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
states). The default is off. Consent is stored per browser, revocable, and honoured by the adapter before any
vendor code loads. A signed-in person can export and delete their data.

## Order of work

1. **Built (2026-11-25):** `src/lib/analytics/events.ts` (the typed events and `parseEvent`, the one check every event passes, which the
   collection endpoint will reuse), `consent.ts` (the categories and `allows`; no choice means nothing is sent), `dispatch.ts` (`analytics.track`;
   the sink is `noopSink`), `viewability.ts` (50% for one continuous second in a visible tab, once per page view). Placement tiles carry their
   record ids (`PlacementTile.placementId`, `sponsorId`, `zone`) and `components/Placements/Tracked`, the card's own outer element, emits
   measurable, viewable and clicked. **Nothing is collected:** no consent is recorded and the sink sends nothing.
2. **The placement counter, before launch** so there is history at the first renewal: a first-party collection route that runs `parseEvent`
   on what it receives, filters automated traffic and duplicates (rules versioned), and adds to a table of daily totals per placement, event and
   day in the site's database (a migration; no raw events, no addresses kept). A sink that posts to it with `navigator.sendBeacon`.
3. **Consent:** the visitor's choice (a banner and a settings link), stored per browser, read by the dispatcher; the wording through the
   university's privacy review and the UWF IT-04 notice. **Ask counsel first** whether a placement count that stores no cookie, identifier or
   address may run without consent; if yes, placement events move to a category that does not need it and nothing else changes.
4. **Reports:** a staff view of each placement's daily totals in the admin, and a proof-of-performance export for a sponsor (aggregates only,
   small counts suppressed, the definitions and filter version printed on it). Delivery against commitment needs the contracted figure from the
   Portal through `packages/portal-contracts`.
5. **The rest of the taxonomy** (content views and engagement, listening steps, newsletter signup, membership appeals, acknowledgment shown),
   each added to `events.ts` when something emits it, and **a product-analytics vendor** behind the same adapter if staff want one, chosen after
   evaluating PostHog against the privacy and hosting constraints. It is a second destination, never the source of sponsor figures.
