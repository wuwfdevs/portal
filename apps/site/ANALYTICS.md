# Analytics

**Status (2026-11-26): the sponsor placement counter is built, end to end, and PostHog is built behind an opt-out notice.** The placement
counter is unchanged (below). **PostHog (US Cloud) runs from the first page view unless the visitor declines** (owner, 2026-11-26; see
"Consent" and "PostHog"), and carries the listening, content and giving events below plus what PostHog measures on its own. It is off on any
deployment without `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`. Placement counts still run without a consent choice, provisionally (owner,
2026-11-25, pending counsel). Where a definition is custom rather than an audited standard, it says so.

## Principles

- **Vendor independent.** Components call a small dispatch adapter with a typed event. A vendor (PostHog is the
  primary candidate; GA4 and Chartbeat are possible complements) sits behind it and can be replaced. Do not
  install redundant trackers.
- **A notice, and the visitor's choice wins** (owner, 2026-11-26, replacing "consent first"). Measurement is on until the visitor
  declines (the banner, or "Privacy settings" in the footer), or off from the start when the browser sends Global Privacy Control; the
  adapter drops what the visitor's choice excludes. *Counting*, the sponsor placement totals, needs no choice, provisionally (see "Consent").
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
| `content_viewed` | A story, episode or show page is shown (**built**: `components/Analytics/ContentSeen`, from the catch-all route) | `content_id`, `content_kind` (story, episode, show), `format`, `show_id`, `topic_id` (the first category) |
| `content_engaged` | Meaningful engagement: scrolled to 75% **and** at least 30 s visible, or play pressed on the page (**built**, once per view) | `content_id`, `content_kind`, `engagement_kind` (read, play) |
| `listen_started` / `listen_stopped` | The site's player: from the first sound to a pause, close, error, switch or leaving the site (**built**: `components/ListenLive/useListenAnalytics`) | `source` (live, on_demand), `stream_id` (the channel's key or the track's id); `seconds` on stop |
| `audio_progressed` | On-demand audio at 25/50/75/100%, once per listen each (**built**) | `audio_id` (the track's id), `percent` |
| `video_progressed` | 25/50/75/100% (not built) | `content_id`, `percent` |
| `newsletter_subscribed` | Signup confirmed | `newsletter_id`, `surface` |
| `listening_started` / `listening_answered` / `listening_submitted` | Listening flow steps | `listening_query_id`, `answer_mode`; **never** the answer |
| `follow_toggled` / `save_toggled` | Follow a topic/show, save an item | `target_kind`, `target_id`, `on` |
| `event_registered` | Event registration | `event_id` |
| `sponsor_placement_measurable` | The unit is on the page and the page's script can see it (**built**; replaces `sponsor_placement_rendered`, see below) | `placement_id`, `sponsor_id`, `zone`, `kind` |
| `sponsor_placement_viewable` | The unit met the viewable definition below (**built**) | same |
| `sponsor_placement_clicked` | A person clicked or middle-clicked the unit's link (**built**) | same |
| `acknowledgment_shown` | An underwriting line was rendered | `agreement_id`, `content_id` |
| `membership_appeal_shown` / `membership_appeal_clicked` | A member-support ask half in view / its button clicked (**built**: `components/Analytics/AppealWatch` on the membership appeal and the Support section) | `appeal_kind` (membership, support), `surface` (story, home, section) |
| `conversion_started` | The Give page's button to the donation form (**built**, in `DonateCard`) | `surface` (give_page), `frequency`; never the amount |
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

Categories: *necessary* (always on; no analytics), *measurement* (PostHog and the events above), *personalization* (relationship states;
nothing uses it yet, so it stays off and is not offered), and *counting* (below).

**Measurement is on until the visitor turns it off** (owner, 2026-11-26: "build the best thing for our purposes"; PostHog is not stripped down,
so cookies, IP-based location, autocapture and session replay stay on). `effectiveConsent` (`lib/analytics/consent.ts`): a recorded choice
always wins; with none, measurement is on, unless the browser sends **Global Privacy Control**, which starts it off. The choice is stored per
browser in localStorage (`wuwf-consent`, `lib/analytics/consent-store.ts`; never a cookie, never the server, so pages stay cached), and can be
changed at any time.

- **The notice** (`components/ConsentBanner`): a bar at the foot of the window while no choice is recorded, with what is measured, a link to
  the privacy page (the footer's legal link whose label names privacy, `Footer/privacy.ts`), and Accept, Decline and Settings. It never
  blocks the page. It is not the Site banner global and shares nothing with it. Its words are `lib/analytics/notice.ts`.
- **Privacy settings**: a dialog with an Analytics switch and a description of what is always on; opened from the notice and from "Privacy
  settings" in every page's footer (coded, so an editor cannot drop it).
- **Declining** stops PostHog at once (no more events, recording stopped, opted out) and removes the cookies and storage it wrote.
- With no PostHog token on a deployment, neither the notice nor the footer link is drawn: there is nothing to choose about.
- A signed-in person can export and delete their data (PostHog's person, found by their account id; not yet a self-service screen).

**Counting needs no choice, provisionally** (owner, 2026-11-25: "assume no consent for now"). Only the three sponsor placement events are in
it. They set no cookie and store no identifier, no address and no page: each one adds one to a daily total per placement and is gone. A
decline does not stop them. **Open for counsel:** whether that may run without consent. If counsel says no, `categoryOf` in
`src/lib/analytics/consent.ts` puts them under measurement; nothing else changes.

**Open: the university's privacy review and the UWF IT-04 notice** have not seen this wording or the opt-out model. The wording is in one
file (`lib/analytics/notice.ts`) so it can change in one commit when they have; `PRIVACY_PAGE_PARAGRAPHS` there is the text for the privacy
page in the admin.

## PostHog

The product-analytics destination (owner, 2026-11-26), **PostHog US Cloud**, in `lib/analytics/posthog.ts`, the only file that imports
`posthog-js` (pinned). Components never call it: the site's own events go through `analytics.track`, and `routingSink` (`dispatch.ts`) sends
each event to one destination, **placements to the counter only, never to PostHog**, everything else to PostHog.

- **What it measures on its own:** page views on every address change and page leave (`defaults: '2026-08-30'`, a date so an SDK update
  changes nothing without a commit), the referrer and campaign parameters, device, browser and approximate location (from the IP address
  PostHog receives; "discard client IP" is a project setting, left off), clicks on links and buttons (autocapture, rage clicks), script
  errors (`capture_exceptions`), and **session replays** with every typed value masked (`maskAllInputs`) and the text of anything under
  `data-ph-mask` masked: the listening screens (`QuestionSet`, Ask WUWF, everything under `/listens`) and the account pages (`/account`).
  Web vitals follow the project's setting.
- **Secrets in addresses are redacted before anything is sent** (`redactEvent`, PostHog's `before_send`, on every event including replay
  snapshots): a membership claim's `?token=`, a sign-in page's `?next=` (which can hold a claim link) and the token in `/listens/table/<token>`
  become `redacted` wherever they appear (URL properties, autocaptured link addresses, person properties, replay data). Possession of a claim
  token attaches a membership to an account, so it must never reach analytics. A new route that carries a secret in its address is added there.
- **A decline keeps PostHog's own opt-out marker** (`__ph_opt_in_out_<token>`) while removing everything else it stored, so its automatic
  capture stays off for the rest of the page.
- **Loaded only while measurement is on**, lazily (`import('posthog-js')`), from a client component in the root layout (`ConsentBanner`
  calls `posthog.start()`); it follows the choice from then on. Events sent while it loads are held (at most 50).
- **First party:** the browser talks only to this site, under `/relay` (`lib/analytics/posthog-config.ts`; a reserved first segment), and
  `next.config.ts` rewrites pass it to PostHog (assets to `us-assets.i.posthog.com`, the rest to `us.i.posthog.com`). PostHog's API paths end
  in a slash, so Next's own trailing-slash redirect is off (`skipTrailingSlashRedirect`) and `redirects.ts` does the same redirect for every
  address but the relay's (`trailingSlashRedirect`). This traffic, replays above all, counts toward Vercel's data transfer; PostHog's free
  managed reverse proxy (a wuwf.org subdomain by DNS) is the change if that grows, and only `api_host` would change.
- **People:** anonymous visitors have no person profile (`person_profiles: 'identified_only'`). A reader's account page identifies the
  browser by their Supabase user id (`components/Analytics/ReaderIdentity`), the explicit sign-in "Anonymous stays anonymous" asks for, never
  an email, member or donor id; signing out resets it.
- **The project (set up 2026-11-26):** PostHog organization WUWF, project **WUWF.org** (id 768664, US Cloud, timezone America/Chicago).
  The plan allows one project, so **staging and production share it**: every event carries `environment` (`NEXT_PUBLIC_VERCEL_ENV`:
  `production`, `preview`), and the project's internal filter (`test_account_filters`, ticked by default) keeps insights to
  `environment = production`; untick it to see staging. Session replay, autocapture and exception capture are on; client IPs are kept
  (owner). Replay records on every domain for now (previews change address per branch); at launch, set the authorized recording domains
  to wuwf.org. The token is the Vercel variable `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` on wuwf-site, Production and Preview.

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

## The Audience screen

Staff read the numbers in the admin, not in PostHog: **Audience > Analytics** (`/admin/audience`, owner, 2026-11-26; the heading was "Members & accounts"), a custom admin
view (`components/admin/AudienceReport`, registered in `payload.config.ts` under `admin.components.views` and linked from the sidebar tree as
a `view` item, `lib/admin-nav.ts`). The site's server asks PostHog's query API with a **read-only personal key** (`POSTHOG_PERSONAL_API_KEY`,
scope `query:read`, server only; `POSTHOG_PROJECT_ID`) and draws the answers in the admin's own look. Nothing is embedded and nothing is
public: the admin login is the lock (a shared PostHog dashboard would be readable by anyone with its link).

- **Who sees it:** any staff member with any site permission (`canSeeAudience`, `access/permissions.ts`); the screen checks it itself and the
  sidebar hides the link from anyone else.
- **What it shows** (`lib/audience-report/queries.ts`, HogQL; `shape.ts`, pure): page views, visitors, visits, listening hours and listens;
  page views by day; listening by stream (channel or on-demand audio, named from the CMS); the top stories, episodes and shows with how many
  views became engaged reads or plays; membership appeals seen and clicked by place; clicks to the donation form by frequency; and where
  visits come from. Totals only: never a person, an address or a replay ("Open in PostHog" goes to those).
- **Range:** the last 7, 28 or 90 days, the public site or staging (`?days=&env=`; only those values ever reach a query). Answers are kept
  15 minutes per range (`unstable_cache`); a failed query is never kept, and only its panel says so.
- **Counts only visitors who did not decline**, and PostHog drops bots, so it is lower than raw traffic; the sponsor placement counts stay the
  sponsor figures.

## Order of work

1. **Built (2026-11-25):** the events, `parseEvent`, consent rules, the dispatcher and the viewable rule (`src/lib/analytics`); tiles carrying
   their record ids; `components/Placements/Tracked`.
2. **Built (2026-11-25):** the placement counter (above): the sink, the route and filter, `placement_counts`, the Delivery panel and the
   sponsor's export. Counting runs without a consent choice until counsel answers.
3. **Built (2026-11-26):** the notice and privacy settings (opt-out, Global Privacy Control honoured), PostHog behind the same adapter with
   its relay, and the listening, content and giving events.
4. **Next:** ask counsel the counting question, and take the notice's wording and the opt-out model through the university's privacy
   review and the UWF IT-04 notice. Put the privacy-page paragraphs (`lib/analytics/notice.ts`) on the privacy page. Watch the first weeks of
   counts against PostHog's page views, and tighten the counter's filter (a new `FILTER_VERSION`) if automated traffic shows through.
5. **The rest of the taxonomy** (newsletter signup, event registration, listening steps, follows and saves, acknowledgment shown, video
   progress), each added to `events.ts` when something emits it.
6. **The Portal's proof of performance:** a signed contract for the Portal to read a placement's daily totals, designed with the Portal's
   booking work.
