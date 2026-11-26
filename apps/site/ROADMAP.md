# Roadmap and handoff

This file is how a new session picks up without the previous conversation. Rules live in `CLAUDE.md`; design in
`ARCHITECTURE.md`; the event spec in `ANALYTICS.md`. This file holds **state, order of work, and lessons**.
Keep it current: update it in the same commit as the work.

Branch: the current work is on `claude/charming-gauss-p7xx51` in `wuwfdevs/portal` (board 27, see *Resume here*); earlier session branches were merged (PRs 320 to 337). The brief this follows (the "project brief") and the
design canvas are described under *Sources* below.

## Product analytics: PostHog and the consent notice (2026-11-26; built on `claude/nifty-davinci-sc3j2k`)

**Decided with the owner:** PostHog (US Cloud) now, behind a **notice, not an opt-in**: measurement runs until the visitor declines; cookies,
IP-based location, autocapture and session replay stay on ("build the best thing for our purposes"). Global Privacy Control starts it off.
The first events: listening (start, stop with seconds, on-demand quarter marks), content (viewed, engaged) and giving (appeal shown and
clicked, the Give page's click through). `ANALYTICS.md`, "Consent" and "PostHog", has the design.

- **Built:** `lib/analytics` (`events.ts` with every event's fields, `consent.ts` `effectiveConsent`, `consent-store.ts`, `posthog.ts`,
  `posthog-config.ts`, `listening.ts`, `engagement.ts`, `notice.ts`); `components/ConsentBanner` (notice and settings dialog, the footer's
  "Privacy settings"); `components/Analytics` (`ContentSeen`, `AppealWatch`, `ReaderIdentity`); the player's `useListenAnalytics`; the
  `/relay` rewrites with the trailing-slash redirect moved into `redirects.ts`; `data-ph-mask` on the listening and account screens.
- **Set up (2026-11-26):** PostHog project WUWF.org (id 768664; one project on this plan, staging and production told apart by
  `environment`, insights default to production), and `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` on wuwf-site (Production and Preview). At launch:
  set replay's authorized domains to wuwf.org.
- **Open:** the university's privacy review and the UWF IT-04 notice for the wording and the opt-out model; the privacy page needs the
  paragraphs in `lib/analytics/notice.ts`; counsel's counting question (unchanged).

## Sponsor placement measurement (2026-11-25; built on `claude/adoring-wozniak-2wypfv`)

**Decided with the owner:** the site counts each placement's views and clicks itself, for proof of performance (closes `PLACEMENTS.md` decision 2);
"no third-party tracking" is narrowed to what it was for (no ad network or ad server, no sponsor's or verifier's pixel or script, nothing that follows a
reader to other sites; the old rule's reason was never written down); the placement counter does not depend on a vendor, and PostHog or another
product-analytics tool is a later, optional second destination. **Then (same day): "assume no consent for now"** — the placement counts run without a
consent choice, provisionally, until counsel answers whether a count with no cookie, identifier or address needs one (`ANALYTICS.md`, "Consent").

- **Built, first commit (the foundation):** `lib/analytics` (`events.ts` with `parseEvent`, `consent.ts`, `dispatch.ts` with `analytics.track`,
  `viewability.ts`); tiles carry `placementId`, `sponsorId` and `zone` (`tileRef`); `components/Placements/Tracked` is the card's outer element in the
  rail tile, the top unit and the inline band, and emits `sponsor_placement_measurable`, `_viewable` (50% for one continuous second in a visible tab,
  once) and `_clicked` (a person's click or middle click on the link).
- **Built, second commit (the counter):** the browser sink (`beacon.ts`, `sendBeacon` to `/api/placement-counts`, batched, never retried); the route
  with the versioned traffic filter (`filter.ts`, `FILTER_VERSION` `2026-11-25.1`) and `tally.ts` (zone, kind and sponsor from the record, never the
  browser; only switched-on placements); `placement_counts` (`src/db/placementCounts.ts`, a plain table like `story_embeddings`, migration
  `20261125_230850_placement_counts`) through `counts.ts`; the staff endpoint `GET /api/placement-items/delivery` (`sponsorship.manage`); the
  **Delivery** panel on placements and sponsors (`components/admin/PlacementDelivery`) and the sponsor's CSV (`report.ts`, small figures hidden).
  Payload's CLI loads `counts.ts` through the config, so it carries no `server-only` marker (the CLI cannot resolve it).
- **Changed from the spec:** `sponsor_placement_rendered` is not counted (pages are cached; the client's "measurable" is the count of units actually
  put in front of someone). No `campaign_id`: the site does not know how a placement was sold, so a campaign is reached through `placement_id` in
  the Portal.
- **Not built:** data-center ranges and rate limits in the filter (they need the address); delivery against commitment and the formal proof of
  performance (the Portal's; a signed contract to read the totals, later); consent for every other event.
- **Fixed after review (PR 411):** the Delivery panel was a `<form>` inside the document's edit form, so "Show" could submit the document; it is
  now a group with a button. The row key left out the sponsor, so a sponsor changed during a day moved that day's earlier counts to the new one;
  migration `20261125_233720_placement_counts_attribution` adds sponsor and kind to the key (a unique constraint, `NULLS NOT DISTINCT`, and an
  `id` primary key). Its `down` merges split rows into the old key. Tested up, split rows, down (merged), up again on a database holding rows.
- **Next:** ask counsel the counting question; watch staging's counts against its traffic and tighten the filter if bots show through.
- **Checked:** typecheck; lint (no new problems; the two `react/no-children-prop` errors in the ListenLive tests were there before); every unit test
  under `src` (257 files, 3,050 tests); the integration test `tests/int/placement-counts.int.spec.ts` (the route adds to and accumulates the totals,
  refuses bots, other sites, unknown placements and malformed posts; the endpoint's permissions, range checks and CSV); `pnpm verify:migrations`;
  `pnpm build`, and the built server answering 204 at the counter and 401 at the delivery endpoint signed out. **Staging:** the preview build of
  `038a223` applied the migration (batch 72); verified by query: owner `payload_app`, the columns and primary key, no foreign keys, no grants to
  `anon` or `authenticated`, empty. The review fix's migration was applied by the preview of `8542411` (batch 73) and verified the same way (the
  unique key, the `id` primary key, no grants on the table or its sequence). **Seen working on staging (2026-11-25, 23:35 UTC):** three loads of the
  preview's home page produced ten rows, each tile shown 3 times, the top unit viewed 2 of 3, rail tiles fewer, one click, house promotions with no
  sponsor and each sponsor tile with its own. **The Delivery panel was seen in the staging admin by the owner** (placement 1: 3 shown, 1 viewed, 1
  clicked, matching the table); on a phone its table ran off the edge, so it now lays itself out by its own width (`delivery.scss`, a container
  query: a table when wide, a card per row under 560px), checked at 390 and 1000 px with no sideways scroll.
## The homepage rethink (2026-11-25; built on `claude/great-gauss-5hwn51`; design: the "WUWF Homepage Rethink" canvas, https://claude.ai/artifact/Rn43y9Mcs9vvCL5XqDegzF)

The owner reviewed the built home page (staging, demo content) and found five near-identical news runs, a sponsor row between nearly every block, and no sign of WUWF Listens, audio
or support in the first scrolls. The canvas holds the evaluation, the reasoning and the agreed page. Agreed with the owner, in order down the page: the lead and The Briefing
(unchanged); **WUWF Listens** as cards of the reporters' open questions (at most three, a link to the hub, nothing when none is open); the **fellowship feature** when one is
running (moved up); the short videos; **Local News** as the one full run with its lead; **Florida News and NPR News** as one row of three each; **Local Politics, Local Arts and UWF
News** as text-only headline columns ("More by section"); the **podcasts** (the built block, small changes); the membership appeal. **RadioLive and Unearthing leave the home page**
(they keep their hubs). Sponsor tiles: **two tinted bands of three** (after Local News, after NPR News), "Sponsor messages" once per band; the **lower banner is retired**.

- **Built** (one commit each, tests with each): Podcasts' other shows name their newest episode (`otherShowLine`) at a 4.5rem cover; News run's **`row` variant**
  (`NEWS_RUN_VARIANTS`, `newsRunTake`, `rowGridClass`); **More by section** (`sectionHeadlines`, home set; a claim request may now hold several parts, `<key>:<part>`);
  **sponsor rows after every other run** (`flowHomeRail`, `rowFollowsRun`; `SlotPlan` is now `after` and `trailing`), one band label (`SPONSOR_BAND_LABEL`), **`home.band`
  retired** (migration `20261125_200256_home_band_retired`: deletes any placement in the zone, then drops it from the enum; tested on a scratch database holding a banner row);
  **Open questions on the home page** (`sets: ['listens', 'home']`, `ListeningOpenView` `home`, the hub read by `loadPlacedHub` in the home shell); **`homepageToSections`**
  writes the new arrangement (what `seed:home` and the launch use).
- **Decisions taken with the owner while building:** rows after runs 1 and 3 (leftover rows after the last run, never dropped); retire the banner zone rather than hide it; a WUWF
  promotion in a band keeps "From WUWF"; the home page shows reporters' questions only, campaigns stay on the hub. **For counsel:** the sponsor label now sits on the band, not on
  each tile (`PLACEMENTS.md`).
- **Staging's home page record is not rearranged yet.** Its sections are still the old order (five full runs, the panels, no Listens, no fellowship). Staging has no NPR News
  section, so its page would be: lead, Listens, videos, Local News (lead), Florida News (row), More by section (Local Politics, Local Arts, UWF News), podcasts. Rewriting it is a
  content change to the page the owner reviews; it waits for the owner's word (write the `jsonb` column and the latest version row, or give the blocks new ids: see `CLAUDE.md`).
- **Not checked:** the page rendered in a browser (no screenshots taken), the Listens cards against the real Portal (the hub read is not unit-tested: `server-only` does not resolve
  in Vitest, the same reason `loadPlacedQuery` has no test), and the migration on staging (applied by the branch's preview build; verify the zone enum and that placement 11 is gone).

## The hubs redesign (2026-11-23; built on `claude/upbeat-mayer-edqava` (slices 1 to 3, PR 402, merged) and `claude/vibrant-noether-16u48u` (slices 4 on); design: the "WUWF Hubs Redesign" canvas, https://claude.ai/artifact/4xSB7KPURiTSueJr2qXP7W)

RadioLive, Unearthing Florida and The Voyager become pages of blocks in the same order (sub-nav, opening, now, browse, own section, people, support, a set foot), each under its own theme; a show's home is a page that names its show. Decisions are in `CLAUDE.md` ("A show's home is a page of blocks", "Explore") and `PAGE-BLOCKS.md` phase 6.

- **Slice 1, themes and shared extensions** (committed): the `radiolive`, `voyager` and `unearthing` themes; `SectionNav` takes the theme's band tone; Feature has a video frame (nothing loads from the host until it is pressed); List has a past-RadioLive-shows source; FrontPage, NewsRun and ShowSpotlight are offered to the voyager set (its story blocks read only the Voyager's stories; Show spotlight draws only chosen shows); the funder line is a set foot. Unearthing's primary button is ink, not the board's lime: lime on paper is 1.3:1 against the ground, under the 3:1 a button's fill needs.
- **Slice 2, the show home page model** (committed; applied to staging by the preview build and verified there, batch 61): `pages.show`, `pages.isShowHome`, `pages.navHidden`, the one-home-per-show hook, the resolver branch, `SectionContext.show`, show-aware List, Support and funder foot, and strip links from a section's `navLabel`.
- **Slice 3, Unearthing Florida as the first show home page**: the Explore block (clustered map, docked time window, searchable site list, one object); sites have a latitude and longitude, episodes a start and end year (seeded from the period); Then & Now is dropped; `/unearthing-florida` redirects to `/shows/unearthing-florida`; the page and its About page are written on staging by the data migration `20261123_013300_unearthing_home_page`, and the show is listed there.
- **Slice 4, RadioLive as a page** (the coded hub, `components/RadioLive/RadioLiveHub` and `lib/radiolive/nav.ts` are gone): `/radiolive` and `/radiolive/artists` are coded shells that render page records of the radiolive set (`CODED_SHELL_PATHS`; `RADIOLIVE_PAGE_PATHS` lets exactly those two records sit under the reserved first segment, only for a page in the set; `/radiolive/<show>` and `/radiolive/artists/<artist>` stay routes). New: the **Artist index** block (every artist of a published show, a labelled search and an A to Z, the full list drawn by the server so it works without script; `lib/radiolive/artist-index*`); Feature's **"Show the latest recorded RadioLive set"** (`latestSet`: the newest past show with a recording gives the label, headline, line, still and video frame, with the captions track for an uploaded file, so nobody edits the page each month; `lib/radiolive/latest-set.ts`); List's **artists** source now lists artists of shows that are over, most recent first, with "2 appearances · date"; ProfileBand draws its more-link. Saving a show or an artist refreshes the dates, lists and the index (tags). The page and its "All artists" page are written on staging by the data migration `20261123_020000_radiolive_page` from the `radiolive-hub` global (the global stays only for the home page's RadioLive panel). **What the page does not draw that the coded hub did:** the masthead's "next show" with its ticket button and virtual-tickets link and the ticket status on each upcoming row (a Dates row links to the show's page, where tickets are); the hub-wide "Plan your visit" panel (decided: each show carries its own venue, which a Dates row shows); the page strip's Encores and Support links (the board's four are Shows, Watch, Artists, About; the strip also lists "Overview" and "All artists" because they are pages in the set); the "N in the archive" count; the "Give" button's own address (Support gives to the RadioLive production's donation form, with its attribution code). The membership level ("RadioLive 25") has no slot on the board; it is carried as a Callout after Support so no price or contact is lost, and the owner may delete it. The board's Encores band is a hero Feature, so the page's only h1 is that band's headline (the lead is a split, an h2).
- **Slice 5, The Voyager as a page** (the coded hub, `components/Voyager/VoyagerHub` and `lib/voyager/load.ts` are gone): `/voyager` is a coded shell over the page record and `/voyager/about` a page in the voyager set. The hub is a FrontPage (lead and Briefing), one News run for each of the hub's sections (the first five stories, the rest three, each its own band), a short-video rail, the Voyager-only shows spotlight, the staff roster, a Closing band (join) and Support; the strip is Front page, each section, Video, Shows, Staff and About, on the teal tone, and the nameplate is dropped. **On a Voyager page List also reads only the Voyager's** stories, video stories and clips (`ListSpec.voyager`, from `PageSetSpec.stories`; a clip takes its story's identity). The set's foot is `components/Page/SetFooter` → `VoyagerFoot`: the footnote (**Shared text → The Voyager's foot**, `shared_text.voyager_footnote`, added by `20261123_030000_voyager_footnote_column`) and "Published with WUWF Public Media". The pages and the footnote are written on staging by `20261123_030100_voyager_page` from the `voyager-hub` global, where the hub is set up. **Not carried over:** the dateline, the nameplate, a staff card's link to the person's page (the roster has none; the staff are copied once and edited on the page), the board's "All videos" link (`/video` is the station's), and, on the About page, the board's History, Who does what, Editorial independence and Questions, whose words are placeholders on the canvas (an editor writes them). The shows spotlight draws only the hub's podcast until more are chosen, so a Voyager show with no episodes draws nothing. **Pages de-duplicate** (the lead and the Briefing take six stories before the runs), so a newsroom with few stories shows fewer runs; each block draws nothing when it has nothing.
- **Slice 6, close-out** (hubs redesign): the home page's Unearthing and RadioLive panels no longer read a hub global (Unearthing takes its show from the unearthing set's home page, RadioLive reads the shows and takes its line from the RadioLive page's description); the three hub globals are **retired** (hidden, in `NAV_OMITTED`, out of the sidebar) but their configs stay, because the data migrations that wrote the hubs read them on a database built from the migrations and a pushed migration is never edited; the dead loaders and helpers are gone; `sites.map_x` and `map_y` are dropped (`20261123_040000_drop_site_map_xy`, snapshot included); the WUWF Design System's SECTION-BLOCKS, HUBS-AND-SHOWS and SOURCE-OF-TRUTH are updated (no token changed). **Left for the cleanup (PAGE-BLOCKS.md phase 7):** dropping the three globals' configs and tables, with `homepage`, `sponsorship` and `support-page`, after the migrations that read them are rewritten to read with SQL.
- **Both hubs lead with what is newest, not with their name** (2026-11-23, after the owner saw the strip's title and the lead's headline say the same thing). The page strip names the place; the lead says what is happening in it. RadioLive's lead already followed the latest recorded set, and staging's "recorded night" had no recording, so the lead fell back to its typed `RadioLive`: `scripts/staging-demo/seed.ts` now attaches the demonstration recording to it (run `pnpm seed:staging --go` with staging's `.env.local`; this was not run from the sandbox). Unearthing Florida's lead is Feature's new **"Lead with the show's latest episode"** (`latestEpisode`, `lib/shows/latest.ts` `loadLatestEpisode`): the show's newest published audio episode gives the label ("Latest episode · date"), headline, line (its dek), picture, a play button when its audio can be played, and an "About this episode" link; the typed words show only while the show has no episode. The show's summary, which the lead carried, is now the intro of the Explore heading. `20261123_050000_unearthing_lead_episode` changes staging's existing page (data only; no-op where there is no such page; tested up, up again and down on rows). **Two columns (same day):** the lead is Feature's split, words beside the picture, because a hero put a full-width picture under the headline and pushed the actions and the rest of the first screen down; a split's headline is an h2, so the lead is marked `pageTitle` (Feature, split only) to be the page's one h1. `20261123_060000_unearthing_lead_split` changes staging's existing page (tested up, up again and down on rows). RadioLive's lead is a split with an h2 and its Encores hero is the page's h1; that is unchanged. **Audio on the lead and the cards (same day, after the owner asked):** the lead takes the newest *playable* episode of the show's ten newest (else the newest), its Play is the one filled button, "About this episode" the outline button and the typed "Explore the map of sites" a link; List cards now draw a play button for an entry with audio (they had none). The demonstration episodes on staging are in the audio format but have no audio file, so they show no player until audio is attached. **Open question for the owner, not changed:** staging's five migrated Unearthing stories (`/unearthing-florida/...`, `production` set) are format `web` with an audio file, and every place that lists a show's episodes (the show page, the podcast feed and directory, member feeds, List "Episodes", the lead, Explore) defines an episode as format `audio`, so those five are not episodes anywhere. The converter sets `audio` only for Grove's episode and podcast templates (`lib/grove/story.ts`). Decide whether Unearthing's audio-bearing articles should be migrated as episodes (a converter/consolidation change) before the archive is imported; widening "episode" to every story under a show would put show notes in the feed. **Strips, call-to-action cards and the Voyager lead (same day, after the owner asked):** every hub strip was audited. The Voyager's Campus, Sports, Arts & Life and Opinion links went to news runs on the hub, which draw nothing once the lead and The Briefing have taken the newest stories (staging has six Voyager stories), so they were dead; they now go to the sections' own pages (`navHref`, migration `20261123_070000_hub_strip_links`, tested up, up again and down on rows). RadioLive's strip had both "Artists" (a section) and "All artists" (the page): "Artists" now goes to the page and the page is left out of the strip. The strip's title now goes to the set's home (it went to the first link, `#front` or `#episodes`). An in-page link whose section drew nothing is hidden on load. **Unearthing's strip is unchanged:** Episodes (the three newest, on the page), Explore and Collections (cards linking to each `/series/<slug>`) are parts of the page with no page of their own; there is no all-episodes page and no collections index (the gap noted above). Support and Closing band are cards now, and a row of them is one band; the Voyager's Front page lead no longer fills the window's height. **Review fixes (same day):** the call-to-action card moved to the Kit (`components/Kit/CtaCard`) and is one layout everywhere (words, then the action under them, left-aligned); the membership appeal (home and story pages) draws it, so it is no longer a different panel held to 60rem on the home page; RadioLive's Encores band is a split with no picture (it was a hero, a 56px page title) and the lead is the page's h1 (`20261123_080000_radiolive_one_title`, tested up, up again and down on rows). **Callout** is still its own tinted panel (an information block with a link, not an ask). **Pictures on cards (2026-11-24, after the owner asked for photos to evaluate the design):** staging's stories already had featured pictures (all but two of 251), but the List block, featured records, episode lists and the `Card`s that were handed a document directly read only the SEO image, which no story has, so their cards showed none; they now use the lead picture, and a card with no picture draws one placeholder in its frame. On staging the one demonstration story without a picture (`900002`) was given the same placeholder photo as the other demonstration stories, by SQL through the connector (its row and its latest version row together, guarded to that record). **Left without pictures on purpose, so the placeholder shows there:** the real story `95` (DOH, RSV), the shows `Unearthing Florida` and `14 59`, and fourteen people (their initials show). **Not changed:** the strip's title still links to its first item (`items[0]`), which on a show's home is the `#episodes` link and not the show's home; and RadioLive's typed fallback headline is still `RadioLive` where no show has a recording (production at launch).
- **No basemap, and Florida drawn from this site.** The map asks no map provider for anything unless `MAP_STYLE_URL` is set (the provider is the owner's decision, still open). Without one, Florida is its own outline, `public/data/florida-outline.geojson` (Natural Earth, public domain, simplified to about 0.0015 degrees, 30 KB, with the Keys), and the flat ground is `wuwf-blue-100`. With one, the style draws the land and the outline is not drawn.
- **What the coded Unearthing hub drew that the page does not.** The "About the project" box and its "Search every episode" form (the site's header has search; the About page carries the words); the featured episode's in-page player (now "Play the latest", through the site's one player); the era filter and timeline counts (replaced by the window); Collections as a list of each collection's episodes (now Cards that link to the collection, with no typed count); Then & Now (dropped on purpose). **A gap:** with a home page at its address the show has no standard episode list, and a List holds at most 12, so "All episodes" has nowhere to go; the board's "All 104 episodes" link is not built. Decide whether the home gets an "Episodes" page or the List's limit grows.
- **Staging's sites have no coordinates**, and their old schematic positions (`mapX`, `mapY`, now hidden) cannot be turned into places, so staging's Explore map is empty until someone enters a latitude and longitude on each site. Nothing was guessed.

### Gap to plan, not built: locations for the migrated Unearthing Florida episodes

When the old Unearthing Florida episodes move from Grove, each needs its **site** (the place the episode is about), the site's **latitude and longitude**, and the episode's **start and end year**. Today these are typed by hand. At the archive's size (about a hundred episodes now, hundreds more) that does not scale, and the migration is the moment to automate it:

1. **Extract** the places and the years from each episode's script (named entities of kind place and date, with the sentence they came from), through the existing converter's pure/reviewable pattern (`src/lib/grove`: pure code, a report, nothing silently dropped).
2. **Look up** coordinates for each distinct place with a geocoder, remembering the result (a lookup table keyed by the normalised place name) so a place is looked up once. The geocoder is a third party, so it is a build-time script run by staff, never a call made on a reader's behalf, and it needs the owner's approval before the first request (the project's rule for fetching from outside).
3. **Save** them as site records (reusing a site when the place already has one) and fill the episode's site, years and period, **flagged as machine-suggested** so an editor confirms before it counts. A place the geocoder is unsure of is left without coordinates (listed, not mapped), never guessed.

The review queue is the product: the extraction is a suggestion, and the editor's confirmation is what publishes a location. Decide, before building: which entity extractor (a model call has the same disclosure question as the embeddings), who confirms, and how an archaeological site with a restricted location is handled (some sites are deliberately not published with exact coordinates; the site record may need a "show only the area" setting before any coordinates are imported).

## Data visualization system (2026-11-22; built, not committed or pushed)

Design, limits and what was left out are in `DATAVIZ.md`; the rules are in `CLAUDE.md` ("Data visualization"). Collections `datasets`, `dataset-versions`, `visualizations` (sidebar: Data & charts); story block `dataViz` and section `sectionDataViz`; staff preview at `/data-preview/<id>`; migration `20261119_031411_dataviz_tables` (**named early on purpose**, it must run before the Local-API migrations; `verify:migrations` passes). **Not yet done:** the migration has not been applied to staging (a pushed branch's preview build does it with `MIGRATE_ON_BUILD=1`; then verify tables, indexes and foreign keys through the Supabase connector); nothing has been looked at in a browser (admin form, ColumnSelect, the figure at 1440 and 390, the interactive map); no sample data on staging. Owner decisions wanted: whether a basemap provider may be used for interactive maps (`MAP_STYLE_URL`), and whether charts need hover tooltips.

## Direction C2, "bright editorial" (2026-11-21; slices 1 to 3 merged, PR 391; slice 4 merged, PR 392; slice 5 merged, PR 393; slice 6 built on `claude/c2-slice-6-hubs-voyager-v7opde`)

A look change, not a structure change: type weight, corners, chips, buttons, a small colour system for sections, and how a heading is marked. The design is the canvas's boards 1k to 1s ("WUWF.org Home Redesign", https://claude.ai/artifact/CsNftes58pxVRKSFACUEFb; read a board with the Artifact tool, `path: project/<file>`: `DirectionKit.dc.html` is the kit and the place to start, `DirectionBrightPlus` the home page, `DirectionBrightPhone` its phone, `C2Story`, `C2StoryPhone`, `C2List`, `C2Sections`, `C2Hubs`). A board is a mockup: its inline styles name the intent, the Tailwind classes and tokens are the implementation.

**Decided (do not reopen):** lime is allowed on white for the play button and heading marks. The Voyager keeps its masthead. The phone player bar stays as built, with a lime play disc. Untouched: `components/Placements`, `components/Acknowledgment`, the sections' tone model, the starter's `--radius` (it governs the form controls), the themed-show system, the Payload admin.

**The colour is a swatch, not a "desk".** The board's word "desk" has no meaning in this repo (a section is only the first part of a story's address), so the brief's idea of desks derived from sections, fellowships and the Voyager was dropped. An editor gives each **section** a **Colour** from a fixed palette (`lib/swatches.ts`: blue, lime, amber, teal, slate; field `sections.swatch`, default blue). Never a typed colour: every swatch is token classes whose contrast `swatches.test.ts` checks, so no choice can be unreadable. A new colour is one entry there plus its tokens. Topics (categories) have no colour. Fellowships keep their teal `Chip` and the Voyager badge is untouched; nothing maps them to a swatch. No section-to-colour mapping was applied (every section reads blue until the owner assigns them in the admin).

**Built:**
- Slice 1, tokens: `r-4` (16px, `rounded-4`), `wuwf-teal-100`, headline styles at weight 600 (no component reads that yet; they still set `font-bold`).
- Slice 2, `components/Kit/`: `Button` / `buttonClasses` (pill, `md` 44px, `lg` 48px; variants `primary` ink, `action` blue, `play` lime, `outline`, `onDark`, `outlineOnDark`, `tone`, `toneOutline`, `link`), `Eyebrow`, `SectionHeading` (serif 600 with an optional `.mark`), `SectionChip` (`pill` or `dot`), `NumberBadge`. The button constants in `PageParts`, `Listening/styles.ts`, `blocks/sections/parts.tsx` and `listening-parts.tsx` delegate to `buttonClasses`, so a button is defined once; those buttons are now pills (the only visible change so far).
- Slice 3: `Sections.swatch` (migration `20261121_010545_sections_swatch`, additive, **applied to staging and verified 2026-11-21**; production waits for launch) and `sectionOf(story)` in `lib/homepage/story.ts` (title and swatch of a loaded section; `kickerOf` is unchanged).

- Slice 4, the home page (done, checked in a browser at 1440 and 390): lead band wash, semibold headline, Listen and Read the story pills, picture credit as a `SectionChip`; the Briefing with the lime-marked heading and `NumberBadge`s; `Card` `variant="editorial"` (used by `StoryGrid` on the home page and the News run block; list pages keep `default`); `SectionHeader` (and so `TitledSection`) draws through `SectionHeading`, takes a `swatch` and has no rule (its `rule` prop is gone); news modules carry their section's swatch (`FilledModule.swatch`); video posters, podcasts band, Unearthing and RadioLive panels, `MembershipAppeal` and `PlayAudioButton` restyled. `ClipRail` and `MembershipAppeal` are shared, so section pages and story pages changed too.

- Slice 5, story, list and section pages (done, checked in a browser at 1440 and 390): `--tone-mark` per tone (`lib/page-themes/themes.ts`, `page-themes.css` regenerated) and `SectionBand`'s title is the Kit's `SectionHeading mark="tone"`; section, topic, person and `/latest` lists use `Card variant="editorial"` (the lead has a larger headline, `LIST_LEAD`) with the section's swatch on the title's mark and the eyebrow (`StoryListData.swatch`); the fellowship hub, archive block and "More from" use it too, and "More from" and "More like this" draw their headings through `TitledSection`/`SectionHeader`; the story page opens with the section `Eyebrow` and a semibold headline; pagination is pills with an ink current page; block media (picture, gallery, video, embed, widget, feature and profile images, list pictures) is `rounded-4`, block cards stay `rounded-lg`; `MembersOnlyPanel` uses the Kit's `action` and `outline` buttons. The acknowledgment panel, sponsor places, the members-only rules and the one-player rule are untouched. **A story loaded as a relation has no section** (`Posts` `defaultPopulate` omits it), so its card has no chip; every query that feeds a list selects it. **On the dark and teal tones the board's lime mark sits under white text, so the lower part of the letters is on lime** (white on lime is about 1.6:1); it is built as drawn and `themes.test.ts` does not gate it, because the mark is a decoration; the owner should look at it on a dark band.

**Next, in order** (each its own change; screenshots at 1440 and 390 as review evidence):
4. (built, see above) The home page: `HomepageView`, `Slots.tsx`, `FrontPage.tsx`, `PlayAudioButton` (idle `bg-wuwf-lime text-surface-dark`), `MembershipAppeal`. `Card` gets `variant="editorial"` and `lead`, and its section chip: **`Card` draws no section label today**, so this is where it takes `{ title, swatch }` from `sectionOf`. A lead band wash `bg-gradient-to-b from-wuwf-blue-100/45 to-surface`.
5. (built, see above) Story, list and sections pages. Add `--tone-mark` per tone in `lib/page-themes/themes.ts` (plain and grey `wuwf-blue-100`; accent `wuwf-lime-100`; dark and teal `wuwf-lime`; lime `wuwf-lime-600`; softlime `wuwf-blue-100`) and regenerate `page-themes.css`; `SectionHeading mark="tone"` reads it and draws no mark until it exists. Block media `rounded-4`, block cards stay `rounded-lg`.
6. (built, see below) The hubs (RadioLive, Unearthing Florida: replace `#E9D5A8` and the svg hex with `warning-*`), and the Voyager chip only.

- Slice 6, the hubs and the Voyager chip (done, checked in a browser at 1440 and 390 on the staging demonstration seed run locally): RadioLive (page, show page, artist page) and Unearthing Florida (hub and `ExplorePanel`) draw headings through the Kit (`SectionHeading`, weight 600; the highlight is the hub's own: lime on RadioLive's dark ground, white on Unearthing's warm ground, set by redefining `--tone-mark` on the heading), eyebrows through `Eyebrow`, buttons through `Button` (ticket buttons `onDark` lime on the dark masthead, `primary` ink in the list, the RadioLive "Give" ask `action` blue, the secondary ones `outlineOnDark`), media (recording player, show frames, artist and host photos, the map, the featured picture) `rounded-4`, cards `rounded-lg`, show-frame chips pills, the play disc lime. No hex remains in either hub: `#E9D5A8` is `warning-border` at 35% (the picture's mat and the collection rules) and the map's land, outline and caption are `fill-warning-border/25`, `stroke-warning-fg` and `fill-warning-fg`. Each hub keeps its masthead, its sponsor/acknowledgment placement and the one-player rule. The Voyager's **chip** (`The Voyager · Student journalism`, on `Card` and the story page) is the Kit's teal `SectionChip`; its masthead and hub are untouched. `SectionNav`'s title is weight 600.
- **Not built as the board draws it (slice 6):** the board's RadioLive and Unearthing mastheads have buttons the built masthead does not ("Watch the set", "Next show", "Play the latest", "Explore the map of sites") and a two-column layout with a framed video or card; the built mastheads (a photo band with the next show; a title with an about-and-search card) were kept because a hub's masthead is not to change without the owner's word. The Unearthing search button is `warning-fg` (the hub's amber) rather than ink, as the board draws it. The Voyager chip has no board; teal is the colour of the board's "Campus" chip.
- **What remains of Direction C2 after slice 6:** the dark-band heading mark (below) is the owner's call; the two phone-board comparisons (390 captures of slices 4 and 5) were never made line by line; the Portal's design tokens are not mirrored; section colours are still the owner's to assign in the admin; the donate/Listening buttons stay blue and every other inline blue button on pages no slice touched (sponsor, giving and event pages and similar) is still blue until its page is next changed. Nothing else is planned.
- **Open, for the owner: the lime mark under white text.** On RadioLive's dark ground (and the dark and teal band tones) the board's lime highlight sits under white heading text; about the lower third of the letters is on lime (white on lime is about 1.6:1). It is built as drawn and not gated by tests. If it should change, the cheapest fix is a dark `--tone-mark` or `mark="none"` on dark grounds.

**Decisions on the open items (owner, 2026-11-21):**
- Lime's pill text stays `ink-2`; no darker green token for now (one token plus one line in `lib/swatches.ts` if it is wanted later).
- Buttons: ink (`primary`) by default; blue (`action`) only for the donate ask (the header's Donate, the membership appeal) and the Listening screens. The ~25 inline blue buttons move to ink as their pages migrate in slices 5 and 6, not as a separate sweep.
- Section colours are the owner's to assign in the admin. Suggested start: blue default for general news, lime for Coastal Futures, amber for Arts & Music, teal for Education, slate for partner or utility sections. Neighbouring sections on the home page should differ. Nothing is scripted.

**Things the next session will trip on:**
- `components/SectionHeader` is the coded sections' heading and `CLAUDE.md` says not to hand-build one. Make it **draw through `SectionHeading`** (and `TitledSection` follows) rather than putting `SectionHeading` beside it; the `border-b-2 border-ink` rule it draws is what C2 replaces.
- Two colours miss 4.5:1 as the board draws them: Lime's pill text is `ink-2` instead of `success-fg` (4.39:1 on the lime tint); a darker green token would restore the board. `action` (blue) exists so the Listening screens keep their blue and ink hierarchy; whether the ~25 inline blue buttons become ink is decided as pages migrate.
- The Portal's `src/lib/design-tokens.ts` is not changed: it has no `wuwf-teal` to mirror a tint of.
- The cloud sandbox's Postgres stops when the worker restarts; run `bash scripts/dev/pg-up.sh` before `tests/int`, or every spec fails with `ECONNREFUSED` (that looks like a failure of the change and is not).
- Known failures that are not C2's: `pnpm lint` has one error in `ListenLive/PlayerProvider.test.ts`, and vitest reports one unhandled Payload-config error from `src/globals/hooks/revalidateSiteSettings.test.ts`; both reproduce on the base commit.
- The routes whose buttons changed shape in slice 2 (sponsor inquiry form and rate estimator, the giving donate card, the listening screens) were checked only as markup, never in a browser. Look at them on a preview.

## Proposed: pages built from sections (2026-11-19; a plan, nothing built)

`PAGE-BLOCKS.md` is a plan to move every editor-composed page (sponsor, giving, the hubs) into the `pages` collection as an ordered list
of section blocks, with blocks stored as JSON, page sets and page-level themes. **It reverses *Pages and templates* below ("structure a
developer has set... not a blocks field") and the two "every word is the global" decisions in `CLAUDE.md`; those stay in force until
the owner approves the plan and its phase 1 rewrites them.** It has four open decisions for the owner and starts with a phase that
proves the risky parts on a scratch database. Do not start building from it without the owner's go-ahead. **Phase 0 has been run: see
the next two sections.** The plan's block catalogue was then revised to board 28.

## Phase 0 findings: blocks as JSON on Payload 3.92.1 (2026-11-19; investigation only, nothing committed but documents)

What was run, what happened, and what `PAGE-BLOCKS.md` now says differently. Everything ran against a local scratch Postgres
(`wuwf_scratch`, port 5433); no hosted database and no preview build was touched. Result per item: **pass**, **fail**, or **works with
this caveat**. The throwaway field, blocks, renderer, test scripts and the generated migration were reverted and are not in the
repository (the working tree held only documents afterwards).

**Verdict:** drafts, autosave, restore, scheduled publish, live preview and the converter did **not** fail, so the plan was not stopped.
Two findings change the design and the owner should see them before phase 1: the converter has **no `down`** (one can be written; one
worked), and **a block must not read request data on the server** (it gives a cached page a 500). Recommendation: go ahead with JSON
storage, with the changes listed at the end.

### Setup, and what the "fresh sandbox" notes missed

- Node: the sandbox already had 22.23.5, which satisfies the pin (`^22.23.4`), so no download was needed (check `node -v` first).
- Postgres 16 from the roadmap's block, port 5433. **pgvector was not installed** and the migrations run `CREATE EXTENSION vector`:
  `apt-get update && apt-get install -y postgresql-16-pgvector` worked through the sandbox proxy.
- A scratch `.env.local` (ignored by git) pointed at `wuwf_scratch`. The baseline was every committed migration (`pnpm payload migrate`),
  dumped once with `pg_dump` so each experiment could restart from it.
- **Scripts that open Payload in development push schema to the database** ("Pulling schema"). Run them with `NODE_ENV=production`, and
  `< /dev/null` on every Payload command, as the Lessons say. `next dev` pushes too, which is how the throwaway `sections` columns got made.
- Next dev, `pnpm build` and `pnpm start` were run on the scratch database for items 1, 5 and 7 (about 1.5 minutes per build).
  `pnpm build` passed with the scratch code in. Stop servers by pid, not `pkill -f`.
- Test users: the first user created gets every role, so an administrator was made first, then an `editor` and a `publisher`.

### Item 1: drafts, autosave, restore, scheduled publish, live preview: **works with this caveat**

Ran, with a `sections` field (blocks defined once in the root `blocks`, listed with `blockReferences`) on `pages`:

- **Draft, then publish.** A draft whose hero block lacks its required `title` saves. Publishing it fails with the error on the block
  (`sections.0.title`). A draft skips validation, a publish does not, as everywhere.
- **Autosave** through REST the way the admin sends it (the whole document, `?draft=true&autosave=true`, `_status: draft`): three
  autosaves made one draft version row (versions 1 to 2). The public read and the public page stayed on the published blocks; the
  preview route plus its cookie rendered the autosaved blocks.
- **Restore.** `restoreVersion` and the admin's "Restore this version" button (with its confirmation) both made a new published version
  holding the old blocks, block ids included (a deep comparison with the stored version was equal). An editor's restore of a version is
  refused by the existing publish guard. The admin's Versions view rendered a per-block diff ("Sections > Block 01 > Title").
- **Scheduled publish and unpublish.** A `schedulePublish` job queued with `user: { relationTo: 'users', value: id }` and a `waitUntil` a
  second ahead did nothing when run early and published the draft blocks when run after (`success`); a scheduled unpublish returned the
  page to draft. A job queued for an editor fails by the same guard. (A bare user id in the job's input is rejected as a "legacy job".)
- **Live preview.** In the admin, the `#live-preview-toggler` button opened the preview iframe (`/next/preview?path=...`), which showed the
  draft; typing in the hero's title field changed the iframe about 1.1 seconds later (autosave, then `RefreshRouteOnSave`). No page errors.
- **Caveat (not caused by JSON):** a Local API write of a *draft* that sends only some fields (`{ sections }`, or `{ summary }` on a page
  without blocks) can leave `title`, `slug` and `template` empty in that version row, and later writes and a scheduled publish inherit the
  gap ("The following fields are invalid: Title, Slug"). Reproduced on a second scratch database with `blocksAsJSON` off, on a plain
  `standard` page, so it is Payload's handling of partial draft data. The admin always sends the whole form, so editors are not exposed;
  **any script that writes drafts (the phase 3 page migrations, fixtures, importers) must send whole documents**, or write published.
- Not run: the existing `pnpm test:int` suite, and the version diff for more than one block type.

### Item 2: a picture in a block is populated; a deleted picture: **works with this caveat**

- At depth 1 the upload in a block, the upload and the relationship (to a page) in a list inside a block are all populated; `populate:
  { media: { url: true } }` narrowed them; a public read of a published page populated the picture. For stories, `select: { title,
  featuredMedia }` at depth 1 populated a media block and the images of a gallery (the shape `CARD_FIELDS` uses).
- Deleting the media record raised no error and left the page document alone. Reads return the **bare id as a number** (at depth 1 and 0),
  not `null`. Saving the page again with the dead id was accepted, as a draft and as a publish (the picture was not `required`; a required
  upload was not tested). The page rendered with HTTP 200 and showed "no picture" because the component checked `typeof picture ===
  'object'`; a component that reads `picture.url` on a number would render nothing for it, so every block component needs that check.
- A bonus: `where: { 'sections.picture': { equals: id } }` finds the pages that still point at a picture, which is a cheap clean-up query.

### Item 3: `where` on a field inside a block: **works with this caveat**

Ran about 25 queries through the Local API. Worked: `equals`, `in`, `like`, `not_like`, `exists` (true and false), `and`, `or`, on
`sections.blockType`, a text field, a select, a checkbox, an upload, a relationship inside a list inside a block, `layout.*` and
`featuredMedia.blockType` (the old fields, now JSON), `fields.blockType` on forms, `version.sections.blockType` through `findVersions`,
and with `draft: true`.

- **`contains` fails** on a JSON field: the adapter builds an invalid JSON-path operator (`@ ~ "x"`), a database error. `like` is the
  substitute: it is a case-insensitive regular-expression match, so it finds substrings.
- **Values** must match `[\w @.\-+:]*` or the request is a 400 ("... is not allowed as a JSON query value"): no apostrophe, slash, comma
  or `&`. Fine for block slugs, ids and short labels; not for searching free text.
- **`not_equals` and `not_in` mean "some block is not X"**, so "pages with no hero" cannot be asked directly; find the pages with one and
  exclude their ids.
- There is no index on the `jsonb` column; a block query reads every page. Not measured; the pages table is small.
- The REST query string uses the same code path and was not run separately.

### Item 4: field-level access inside a blocks field: **pass**

A hero block had `internalNote` (readable by `content.write`, settable by `content.publish`), `secret` (both publish only), and a field
with a `beforeChange` hook that refuses a non-publisher. Run as a public reader, an editor and a publisher, Local API, `overrideAccess:
false`:

- Public read: neither field is returned. Editor read: `internalNote` yes, `secret` no. Publisher read: both.
- Editor update that changes `internalNote`: the value is silently kept (the old one stays). Editor create with both set: neither stored.
- **The editor cannot read `secret`, so the form never sends it back; the save kept it.** This held when the editor **reordered** the
  blocks and when the editor **deleted** another block: the denied value stays with its block (it is merged back by block id, not by
  position). A block sent with a **new id** (a paste or a duplicate) comes back without it, which is the safe direction.
- The hook-based guard also worked inside a block (the editor was refused, the publisher allowed).
- The access function received `id`, `doc`, `data`, `siblingData`, `blockData` and `req` on update, even for a block listed by
  `blockReferences` (the docs say collection data is not available there; it was on this path; the read path was not probed).
- So **`restrictedBlocksGuard` is not needed for a blocks field**, only for rich text. A test in the style of
  `restricted-blocks.int.spec.ts` should still pin it for each restricted field in a section block.
- Not run: the same by REST, and an editor editing in the admin.

### Item 5: `filterOptions`, copy and paste: **works with this caveat**

- The block picker lists the four generic blocks for a page whose set is `giving` and five once the set is changed to `sponsor` (the
  sponsor-only block appears), **live, without a save**, because `filterOptions` is re-evaluated as the sibling field changes. It works
  with `blockReferences` and reads the sibling field (`siblingData.pageSet`) from the same level.
- **It also validates.** Publishing a `giving` page that holds the sponsor-only block fails ("The block "sectionSponsorRates" is not
  allowed", on `sections.0.id`); the same as a draft saves. A sponsor page holding it publishes; switching that page to `giving` and
  publishing fails until the block is removed. A page with no set rejects set-only blocks. **An unknown block slug is rejected** in this
  field (the Lessons say Payload drops an unknown block in rich text; with `filterOptions` it is an error).
- **Copy and paste in the admin:** the row menu has Move Down, Add Below, Duplicate, **Copy Row**, **Paste Row**, Remove. Copy Row on page
  C, then Paste Row on page D put the block in D, with a **new block id**, and autosave stored it. **Paste Row replaces the row it is used
  on** (the docs say to add an empty block and paste over it). Pasted over a block of another type, the old block's field names
  (`heading`) stayed in the new block's JSON: stale keys, harmless to render.
- Not run: pasting a set-only block into a page of another set (it would be refused at publish by the rule above), "Paste Fields" (the
  field-level paste; the docs say it replaces every row), and copy and paste as an editor.

### Item 6: the converter: **works with these caveats (read first)**

- **Command.** `pnpm payload migrate:create blocks_to_json --file @payloadcms/db-postgres/blocks-as-json` (with `NODE_ENV=production` and
  `< /dev/null`). The name `blocks-as-json` is a file in `@payloadcms/db-postgres/dist/predefinedMigrations`, loaded by
  `getPredefinedMigration`; the work is in `@payloadcms/drizzle/dist/utilities/blocksToJsonMigrator.js`. Then `pnpm payload migrate`.
- **What it wrote.** A migration (`src/migrations/<stamp>_blocks_to_json.ts`, about 130 lines of SQL and a migrator call), its `.json`
  snapshot, an entry in `src/migrations/index.ts`, and **a rewrite of `payload.config.ts`** that added `blocksAsJSON: true` and also
  reformatted the whole file with Prettier (blank lines removed, lines wrapped). The SQL drops the 34 block tables (`pages_blocks_*`,
  `_pages_v_blocks_*`, `posts_blocks_*`, `_posts_v_blocks_*`, `forms_blocks_*`), their enum types, **the `categories_id` column, foreign key
  and index on `pages_rels` and `_pages_v_rels`** (the archive block's relationship), and adds `jsonb` columns `pages.layout`,
  `_pages_v.version_layout`, `posts.featured_media`, `_posts_v.version_featured_media` and `forms.fields`. `up` first writes every
  document and version to `src/migrations/.payload-blocks-migration/entities-batch-N.json` (100 per batch), runs the SQL, then writes the
  rows back through the adapter and deletes the batch files. The whole run is one transaction.
- **Data.** Seeded with the flag off: 3 stories (a media block, a gallery whose images are a list, an embed; one story edited so it has two
  versions), 3 pages (`layout` of media, form, archive with a **category** and with **selected documents**, a call to action with
  **links, one a reference to a page**, a content block with **two columns of rich text**; one page edited so it has versions; one page
  that is a draft only) and a form with text, email, select (options) and textarea fields: 15 documents and versions. Read through the
  Local API (depth 0, drafts, versions) before and after: **zero differences**, including block ids and relationship ids. Timestamps were
  left out of that comparison and were not checked. The Local API reads of old and new are the same
  shape, so no code that reads `featuredMedia` or `layout` through Payload changes; nothing in `src` or `scripts` reads the block tables
  or queries into those fields by SQL (searched).
- **Down: not supported.** The generated `down()` is empty. `pnpm payload migrate:down` rolled back the record and left the JSON schema
  and no block tables (a config with the flag off would then fail). Mirroring the converter backwards in a scratch script worked: read
  every document and version while the JSON columns exist, make the schema diff with drizzle-kit from the JSON schema to the relational one
  (`requireDrizzleKit()`, `generateDrizzleJson`, `generateMigration`), run it, then write the rows back with the flag off. Read through the
  Local API afterwards: **zero differences** from the original. So a real `down` is about 40 lines; Payload does not ship it.
- **Failure mode.** With the flag still `false` in the config when `payload migrate` ran, the write-back failed
  (`column pages__rels.categories_id does not exist`). The transaction rolled back (block tables intact, no migration record), but the
  batch file stayed in `src/migrations/.payload-blocks-migration/` (the next run clears it). Put that folder in `.gitignore`.
- **`pnpm verify:migrations`** passed with the generated migration and the flag set (7 seconds), and **failed** when the flag was taken
  out again (it listed the `CREATE TYPE`/`CREATE TABLE` statements for the block tables), so it covers the change.
- **Order on a preview build.** `scripts/vercel-build.sh` runs `payload migrate` and then `pnpm build`, so the flag and the migration go in
  one commit. Because every preview deployment shares the staging database, once staging is converted any preview of a branch without
  the flag reads tables that are gone (reasoned, not run: staging was not touched).
- Not run: against staging data (its volume is unknown here; batches of 100 are held in memory and written to disk), on Vercel, the existing
  integration tests, a form submission through the form block.

### Item 7: a block that needs request data: **fails as designed; works another way**

Read first: `node_modules/next/dist/docs/01-app` (`caching-without-cache-components.md`, `use-search-params.md`, `connection.md`, the
glossary on request-time APIs). This app does not enable `cacheComponents`. Tested on `pnpm build` then `pnpm start`, with scratch pages
holding one `sectionQuery` block in different modes. Cache state read from `x-nextjs-cache` and `Cache-Control`, and from timestamps in
the HTML.

| Mode | Page at the build | Behaviour |
|---|---|---|
| none (control) | prerendered | `HIT`, `s-maxage=3600`; timestamp never changes |
| `useSearchParams` in a client component inside `Suspense` | prerendered | `HIT`; the browser reads `?way=` (`mail`, `phone`, none); the HTML has the fallback |
| `await connection()` or `await headers()` in a server block (inside `Suspense`) | skipped by the build, dynamic | 200, `Cache-Control: private, no-store`; a new timestamp and the request's `User-Agent` on every request; every other page stays `HIT` |
| the route awaits `searchParams` because the page holds a `server` block | skipped by the build, dynamic | 200, `no-store`; `?way=one` and `?way=two` give different content |
| **`connection()` or the route's `searchParams`, added to a page that was prerendered, by an editor's save** (`headers()` is the same kind of call and was not run for this case) | prerendered, then edited | after the revalidation, **500 on every request**, digest `DYNAMIC_SERVER_USAGE` (the message is hidden in production, only the digest is logged) |
| the same page, `connection()` block removed again | | recovers: one `MISS`, then `HIT` |
| `useSearchParams` block added to a prerendered page | prerendered, then edited | stays `HIT` after the edit; no error |

So the plan's sentence "a block declares the need and the page is rendered per request" holds only for a page that was already dynamic at
the build. The `connection()` lesson above (500 in a route with `revalidate`) is this same failure. An editor cannot tell which state a page
is in, so a server block must not read request data. What works: the client component for a query parameter (run), a client-side fetch or
a server action for a token (reasoned, not run), and a coded route for a page that must be rendered on the server per request. A
separate observation, **not about sections**: on this build a page created after the build (not in `generateStaticParams` then) was
served per request with `no-store`, including a plain `standard` page, and `revalidatePath` after saving did not change that. Pages
present at the build were cached for an hour. The cause was not found, and Vercel was not checked; it deserves a look on staging, since it
means a new editor-made page is not cached until the next deploy (and so does not hit the 500 above until a build prerenders it).

### What `PAGE-BLOCKS.md` was changed to say

Storage section: the converter's command and what it does, no `down` (write one), the flag-before-migrate order, shared staging and other
branches' previews, the dead id as a number, stale keys after paste, the query operator limits, field-level access and `filterOptions`
behaviour. Rendering section: the request-data rule replaces "a block declares the need". Risks table: three rows added. Phase 0 checklist
ticked and annotated. Open decision 2 annotated (converting works; recommend it over rebuilding staging).

### What phase 1 should carry over (not started)

- A hand-written `down` for the storage migration, tested up, down, up on rows seeded with the flag off, with the comparison script's
  idea: read every document and version through the Local API before and after, and diff. Revert the Prettier rewrite of the config. Add
  `.payload-blocks-migration` to `.gitignore`.
- A test over `src/blocks/sections` that fails on `headers`, `cookies`, `connection` or `searchParams` in a block's server code.
- Block components check `typeof value === 'object'` before using a populated relation; a registry test can render each block with
  the relation as a bare number.
- Page-writing scripts send whole documents (the draft caveat). Use `like` and `equals`, never `contains`, in a query on a block field.
- Keep a test for the restricted fields of a section block (read, create, update, reorder), as `restricted-blocks.int.spec.ts` does for
  rich text.
- Look at a new page's cache behaviour on a staging deployment before the sponsor pilot depends on it.

## Phase 0 findings, round 2: freshness, variants, settings, the address (2026-11-19; investigation only)

Four more checks for `PAGE-BLOCKS.md`, run after the plan was revised to follow board 28 of the design canvas. Same method and the same rules as
the first round (scratch Postgres on port 5433, `blocksAsJSON` on, a throwaway `sections` field; `NODE_ENV=production` for scripts; nothing
hosted; everything reverted, the working tree held only documents). The first round's results were read and not repeated. Read before item 8:
`node_modules/next/dist/docs/01-app` (`caching-without-cache-components.md`, `unstable_cache.md`, `revalidateTag.md`, `use-search-params.md`).
Production behaviour was read from `pnpm build` then `pnpm start`. Drafts, live preview, the converter and item 8 did **not** fail.

### Item 8: per-page freshness: **pass**

The route has one setting (`revalidate = 3600`) and the hubs use 600, 1800 and 3600 today. Four prerendered pages each held a Dates-style
block listing two shows, one ending 5.5 minutes after the server started, filtered by `endsAt > now` on the server:

| Block's data | Page cache | The finished show |
|---|---|---|
| in the page record, nothing special | `s-maxage=3600`, render timestamp unchanged for 5.7 minutes | still listed at the last poll, 51 s after it ended (its window is 3600, so it would stay up to an hour) |
| loaded with `unstable_cache(fn, key, { revalidate: 20 })` | **`s-maxage=20`** (this page only) | gone on the first request after the next regeneration (the poll 31 s after it ended) |
| `unstable_cache` with `revalidate: false` and a tag | `s-maxage=3600` | listed until a call to `revalidateTag(tag, 'max')` (a scratch route handler); the first request after was stale, the next current |
| in a client component that hides expired items | `s-maxage=3600` | with script: hidden; **without script: still listed** (the server cannot know the visitor's clock) |

- The block's `revalidate` lowers the window of **the pages that hold it**, as the docs say ("the lowest `revalidate`... determines the
  frequency"); the other pages stayed `HIT` at 3600, and the tag call refreshed only the page that read the tag.
- So the plan's answer: a shared helper loads time-dependent data through `unstable_cache` with a `revalidate` the block (or variant) sets,
  which gives each hub its own interval without a route each. A page so lowered is re-rendered at most once per window per cache, under traffic.
- For a drop-off at a stated moment, a cron route calling `revalidateTag` works (run by hand here; the cron itself was not built, and
  `vercel.json` has one cron today). A hide-in-the-browser step is a complement, not a fix.
- Not run: on Vercel (its CDN's handling of `s-maxage=20`), a block that queries Payload by a computed "now" inside the cache function, and
  `use cache` (this app does not enable `cacheComponents`; `unstable_cache` is the previous model and a later move is a cost).

### Item 9: variant fields: **works with this caveat**

A Feature block with a `variant` select (`hero`, `split`), a required `heroAudio` shown for `hero`, a required `ratio` and a custom-validated
`splitNote` shown for `split`, through the Local API as a publisher and in the admin as a publisher:

- A required field under a **false condition does not block a publish**: hero with no `ratio` and split with no `heroAudio` both published. A
  required field under a **true** condition does ("This field is required"), and so does the custom `validate` for the visible variant.
- A hidden field holding an **invalid** value (`ratio: 'bogus'` under `hero`) was accepted and stored: hidden fields are not validated.
- **Data is kept, never cleared.** Updating a block from `hero` to `split` and back through the API left the old variant's fields in the
  JSON, and a partial update (the new variant's fields only) kept them too. In the admin, switching the variant hid the fields and
  published without error; the stored block kept `heroAudio`; switching back showed the old value; emptying the now-visible required field
  blocked the publish with the error on that field.
- A draft with `draft: true` saved a split block with nothing else filled in (without `draft: true` the same create is validated).
- So: the component reads only its variant's fields, validation must not depend on a hidden field, and leftovers accumulate (clean up
  with the same data script as for renamed fields). Not run: a conditional field that is a relationship or an upload.

### Item 10: settings to pages: **works with this caveat**

Four prerendered pages: two with a price block reading the `sponsorship` global's phone through `getCachedGlobal`, one reading it with
`payload.findGlobal`, one with no price block. The global was saved over REST as a publisher (its existing hook calls
`revalidateTag('global_sponsorship', 'max')` and `revalidatePath('/sponsor', 'layout')`):

- The two `getCachedGlobal` pages went `STALE` and served the **old** value to the first visitor, then the new value from the second request on;
  the page with no block was untouched. No page holding the block was left stale.
- The page that read the global **directly** never changed (still the old value after three rounds): nothing ties it to the tag. It would
  stay stale until its own window ends.
- `revalidatePath('/sponsor', 'layout')` is irrelevant to a page at another path; the tag does the work.
- `revalidateTag(tag, { expire: 0 })` (a blocking refresh for the first visitor) is documented and was not run.
- Not run: a new settings global's hook, a page read in draft preview after a settings change, Vercel.

### Item 11: a client block that starts from the address: **works with this caveat**

A way-switcher block as a client component using `useSearchParams` inside `Suspense`, with the fallback holding the default panel, on a
prerendered page; the same page with a server-side `searchParams` read for the comparison:

- Cached page: `x-nextjs-cache: HIT`, `s-maxage=3600`. With script, `?way=mail` shows "give by mail" and no query shows the default.
  **Without script** (JavaScript off), `?way=mail` shows the **default** panel, as the server HTML does. With script on a slow connection
  (scripts held 1.5 s), first paint is the default and the chosen panel appears after hydration.
- Cost, 100 sequential requests each, localhost, one client (ratios only; not a load test): cached **6.2 ms** and **3 database transactions**
  in all; per request **14.6 ms** and **138 transactions** (about 1.4 and 40 rows per request). A per-request
  page also cannot be served from the CDN, so the difference on Vercel is larger than here.
- A requirement of `/support/ways` is that it works without script, so a client island is not enough for it: it stays server-chosen
  (a coded route shell over the page record, `PAGE-BLOCKS.md` → Rendering). A query parameter that only refines a page (a highlight, a
  prefilled amount) suits the client block.

### What `PAGE-BLOCKS.md` was changed to say (this round)

The catalogue was replaced (about 18 library blocks with variants, about 9 set-only, the reasons recorded, the open Picker price question);
the block-or-variant rule and the variant findings were added to the Design section; the freshness, settings and address findings to
Rendering and Shared data; page-level `noindex` and `noReferrer` fields; the page sets table shrunk; the theme notes (placeholder values for
Voyager and Unearthing, the 3:1 button check, the teal and lime bands); board 28 superseding boards 11 to 13 on layout; phases 2 and 6
rewritten; Barefoot Mary and show pages out of scope; open decisions 5 to 8; two risks; a *Sources* section.

## Phase 1: the sections foundation (built 2026-11-19; applied to staging by the preview build of `946e5fef` and verified there)

`PAGE-BLOCKS.md` phase 1, on the owner's instruction to proceed on the recommendations (tone list: add `teal` and `lime`; per-set edit
permission as proposed; staging converted rather than rebuilt; Home stays a global). Rules for the result are in `CLAUDE.md` → *Pages and
sections*; the map is `ARCHITECTURE.md` → *Pages built from sections*.

**Applied to staging (2026-11-19, after the owner's go-ahead to push).** The preview build of `946e5fef` (READY in about 70 s) ran both migrations on
`wuwf-site-staging`; verified afterwards with read-only queries through the Supabase connector: both recorded (57 in all); `jsonb` columns
`posts.featured_media`, `_posts_v.version_featured_media`, `pages.layout`, `pages.sections`, `_pages_v.version_layout`, `_pages_v.version_sections`, `forms.fields`; the six
page columns; **no `*_blocks_*` table, old block enum, foreign key to one, or `categories_id` column left**; the new enums and the `sections` template value
present; tables owned by `payload_app`, no grants to `anon` or `authenticated`; **the data matches the pre-migration counts exactly**: 249 stories, 256 versions,
247 stories with featured media, 232 media blocks, 15 galleries, 88 gallery images, 25 standard pages; no story has an unknown or a second featured-media block.
Not verified: that a converted story and the sections page render on the preview (the sandbox cannot reach the deployment, and the tool that can creates a
share link on it, which was not asked for), and the new-page caching question from phase 0 item 7.

**State of the branch.** Pushed: the pure code and tests (themes, page sets, block registry, Cards, helpers; no schema, config or route change),
and a commit that restores a migration snapshot an earlier commit had deleted by mistake. The schema and wiring commit `d7cd3dee` was held until the owner
said to push, because a pushed branch's preview build runs the new migrations on the shared staging database (`MIGRATE_ON_BUILD`), which breaks other
branches' previews until they are rebased. **Open branches must be rebased onto this one** (their previews read block tables that no longer exist).

**What was built.** Migrations `20261119_031412_sections_pages` (the `sections` template, page set, theme, navigation, `noindex`, `noReferrer`
and `sections`) and `20261119_031427_blocks_to_json` (Payload's converter with a hand-written `down` and a skip when the tables are empty);
`blocksAsJSON: true`; `pages.sections` as a blocks field from the root `blocks` registry, with `filterOptions` by page set and an anchor check;
the Cards block; `RenderSections`, `SectionBand`; page themes and tones (`teal`, `lime` added) with a generated `page-themes.css`; the page sets
registry with `access/pages.ts` and `hooks/enforcePageSet.ts`; the set sub-navigation (cached under a tag that saving a page in the set revalidates);
`noindex` and `noReferrer` in the page metadata; `keepOnlyBlockTypes` on stories' featured media.

**Checks (scratch database, local).** `pnpm typecheck`: clean. `pnpm build`: passes (47 s). `pnpm verify:migrations`: passes, and fails when the flag is
removed. The whole integration suite: **198 files, 2,239 tests pass**. New tests: themes (contrast of every tone, text 4.5:1 and button 3:1; a
lime button on white measures 1.50), page sets (by role), set navigation, anchors, safe links, the block registry (mutation-checked: a removed
thumbnail, a removed block test and an unregistered directory each fail it), the Cards block, and `tests/int/sections-pages.int.spec.ts` (10 tests: the
field, refusals at publish, and who may create, edit, move, publish and read by page set; mutation-checked by breaking the read rule and the set guard).
Lint: no errors in the new code; one existing error in `src/components/ListenLive/PlayerProvider.test.ts` (`react/no-children-prop`), not touched.

**Findings (they changed the work).**
- **The converter reads through the config as it is when it runs.** `verify:migrations` failed on a fresh database because the converter selected
  page columns that a later migration adds. Fixed by ordering the pair (columns first, then the conversion) and by skipping the data pass on empty
  tables. Tested with content: both migrations in one run, then both rolled back, then both again, read back through the Local API with zero
  differences each time (the simple seed of phase 0: 2 stories, 3 versions, 1 page, 2 page versions, 1 form), and on an empty database. Consequence
  for staging: apply it before any later migration that changes pages, stories or forms. It also means the earlier advice "merge the storage
  migration on its own" no longer holds: the page columns must go with it.
- **JSON storage keeps an unknown block type** in a field with no `filterOptions` (relational storage dropped it). One existing test caught it (a
  story's featured media dropping a pull quote); a field hook restores the old behaviour for that field.
- **A staged deletion rode into a pushed commit** and removed the newest migration snapshot; restored in the next commit. The repository keeps every
  migration's snapshot, whatever the Lessons say about keeping only the newest.
- `blockReferences` is typed by the generated block slugs, so `pnpm generate:types` is needed after a block is added.

**Staging, read 2026-11-19 (read-only, Supabase connector, project `wuwf-site-staging`).** At migration `20261118_221136_network_content` (55 recorded),
so both new migrations are simply pending. 25 pages, all `standard`; none has a layout block (0 call to action, content, media, archive or form
blocks) and no page-category relation; 0 forms. 249 stories and 256 story versions, 247 stories with featured media: 232 media blocks and 15
galleries (88 images, 21 at most in one), and 231 and 16 (91 images) in versions; no video or embed blocks. 44 MB in all. So the converter moves
about 500 documents and versions, in batches of 100, and the whole `blocks` template can go without converting a page.

**Not done, and why.** Removing the `blocks` template, `RenderBlocks`, `heros/` and the starter's page-only blocks: now safe (the data above), but done
as its own small change after the pair is on staging, so the verified migration pair is not regenerated for it. Applying and verifying on staging. The set footer line (it needs the settings
globals of phases 3 and 4). An end-to-end admin save of a sections page in a browser (the picker, the fields and rendering were checked; the save was
covered by the integration tests). Not run: on Vercel.

**Next.** Rebase open branches; look at the preview (a converted story, a sections page) and at a new page's cache behaviour on that deployment (phase 0
item 7's open question); remove the `blocks` template; then phase 2, the library.

## Phase 2: the section library (built 2026-11-19; not yet on staging; the exit is the owner looking at the sample page)

`PAGE-BLOCKS.md` phase 2, on the owner's confirmed order (a first slice, then the guard and Text, then the typed blocks, then the data blocks), the
Picker built with typed prices and a marked seam, and the guard extended before Text shipped. Rules for the result are in `CLAUDE.md` → *Pages and
sections*; the map is `ARCHITECTURE.md`. No migration: a block is JSON. Nothing was pushed to or written on staging or production.

**What was built.** 18 blocks, each with a config, a component, a test, a picker group and a 3:2 thumbnail, and one entry in `registry.ts`: Feature
(hero, split), Featured record (hero, split), Profile band (about, roster), Cards, List (grid, rail, numbered, lead), Dates (rows, cards), Quotes,
Stats (tiles, compare), Steps (grid, list), Questions, Callout (tint, quote), Check list, Table, Picker, Text, Credit, Support, Closing band. Shared
parts in `blocks/sections/parts.tsx` (tone-aware buttons and links, the picture and the `typeof` check). The data blocks read through
`lib/section-data` (pure `shape.ts` and `specs.ts`, tested; `load.ts` with the cached reads). `rules.test.ts` scans every block's source for request
data, direct global reads, raw HTML, an unsafe link, free colour or HTML fields in a config, and static imports that would put Payload inside the
registry (below).

**The guard.** `restrictedBlocksGuard` read only a field's own rich text. `legacy-html-guard.ts` now walks every object in the value it is given, so a
rich-text state nested in a block (the Text block's body, and any later block with rich text) is checked for preserved HTML and script widgets, keyed
by block id (a moved section is not a change). The pages collection guards `['body', 'sections']`. Tests first, then the code: 4 unit tests failed
before the change; an integration case (a page section as an editor, a publisher and an administrator) joins the existing walk over every place with
story content; `restrictedBlocksGuard.test.ts` fails when a section block uses `bodyEditor` and pages does not guard `sections`. Mutation-checked: Pages
guarding only `body`, and the walker back to root-only, each fail the unit and integration tests.

**Findings (they changed the work).**
- **The registry is loaded by the Payload CLI, which cannot load most of what a component imports.** `registry.ts` imports every component and the
  config imports the registry, so a component that statically imports the story renderer (`server-only` modules through the listening block), the
  global helper or a loader (they load the config: a cycle) made `pnpm generate:types` and the integration tests fail ("Cannot find package
  'server-only'", a `.scss` error). Those are imported **inside** the async component, when it draws (`await import(...)`); `rules.test.ts` fails on a
  static import. This is the one thing a new data block must know.
- **A page holding a data block gets its own short cache window.** Run on a production build: the sample page answered `s-maxage=300` and an ordinary
  page `s-maxage=3600`, from the loaders' `unstable_cache` windows (list 300, featured 600, dates 300, credit 300, one shared clock of 300). A stale
  read cache survives a rebuild (`.next/cache`): after changing data, delete it before judging a build.
- **The sample page's publish test found a required field**: Credit's `target` was required, so the sample could not publish on a database with no
  fellowship or show. It is optional now, like every other data block's record (no record, nothing drawn).
- **Audit, 988 text elements and 30 buttons across all six tones on the built page (headless Chromium, desktop width)**: no text under 4.5:1 (3:1 for
  large text), no button fill under 3:1 against its ground; the same audit with the bar raised to 12 flags 382, so it can fail. The Text block needed
  the typography plugin's colours pointed at the band's tone (`--tw-prose-*`); without it body text was dark on dark. The Picker's first markup could
  not style the chosen option (a peer rule does not reach a label inside another element): inputs, choices and panels are siblings now.
- **No horizontal scroll** at 375, 768 and 1280 px, and no console error, on the sample page.
- **The Picker works with script off** (a mouse click on a choice and an arrow key both change the panel), because the options are radio buttons.

**Checks (scratch database, local).** `pnpm typecheck`: clean. `pnpm lint`: no new error (the one existing error, `PlayerProvider.test.ts`, is untouched; the one warning in the new code's neighbourhood is phase 1's `any` in `blocks/sections/types.ts`). `pnpm test:int`: **221 files, 2,473 tests pass** (phase 1 ended at 198 files and 2,239). `pnpm build`: passes. `pnpm verify:migrations`: passes (no migration was added). `generate:types` and `generate:importmap` committed. Mutation checks, each by breaking the code and watching a test fail (all caught): a populated-relation
check removed; a date that never expires; the Picker with no default; the Support link with no `supportHref`; a percentage bar without its clamp; a
table row not padded; a List reading a hidden variant's field; Questions not a `<details>`; a hero without an `<h1>`; a Callout drawing without text;
typed dates that never drop off; request data in a block; a static import of the story renderer. One survivor, the `typeof` check in `populatedMedia`
(a second check on `url` also catches a bare id), got a direct unit test and was then caught.

**The sample page.** `src/lib/sections-sample/build.ts` (pure; one maker per block, a test fails until a new block has one) builds 108 sections (every
block in every tone; each variant at least once, dealt out across the tones) and `scripts/sections/seed-sample-page.ts` writes them as the page
`internal-sections-sample`: a **draft** by default (open it in the admin and use Live preview, which has Mobile, Tablet and Desktop), `--publish` to
make it live at `/internal-sections-sample` (noindex, no referrer, not linked). It refuses any database but staging or one on this machine, writes one
page, reads the rest (pictures, a story, a section, a topic, a show, a fellowship), and `--fixtures` (a database on this machine only) first makes
generated pictures, stories, episodes, artists and RadioLive nights. An integration test publishes the page with no records at all. On the scratch
database it drew 106 of 108 sections (the two community-calendar Dates sections have no events there). **Not run on staging: the owner has not said to.**
`pnpm seed:sections-sample` is the dry run; `pnpm seed:sections-sample --go` writes the draft.

**What a reviewer will see that is not a bug.**
- The sample is a mirror of the catalogue, not a design: the words are board 28's, the pictures on a scratch database are generated gradients.
- A data block draws what its database holds; a section whose record or source is missing draws nothing (the community Dates, Credit without a
  running agreement, Support without the donation form address in the Giving pages global).
- Typed dates in the sample are set relative to the day the page was made, and one is already past on purpose (it must not draw).

**Left out, on purpose (each is a decision or a later phase).**
- **Picker prices are typed text.** The seam (`priceOf` in `Picker/Component.tsx`, the comment on `Picker/config.ts`, the `price` field's help text) is where
  a reference to `sponsorship-settings` goes when phase 3 answers the open question.
- **Featured record picks a story, an episode or a show, or the newest story of a section.** Leads computed from a rule (RadioLive's next show, the Voyager
  and Unearthing leads) are phase 6.
- **Rail has no arrow buttons** (board 28 draws one each, 44 px): it is a labelled region that scrolls and takes the keyboard (`role="region"`, `tabindex`).
  Arrows need a client component; add them if the owner wants them.
- **Table's cells are a typed list** (`hasMany` text per row), so an empty cell is a dash. **Check list is one list**; two lists on a page are two blocks.
- **Closing band has no form.** The Unearthing tip, Voyager pitch and Barefoot Mary story forms (open decision 8) are not built.
- **A-Z of artists** is not built (no page needs it yet). **Dates from the community calendar** reads `loadCalendar` for the next occurrences; it was
  not run against real events on this database.
- **Credit's panel stays a neutral light panel on every tone** (a credit is never in a sponsor's or a hub's colours); on the dark tone it is a light box.
- **Support's address** is the Giving settings' monthly form (moved from the Giving pages global in phase 4).
- **Open from phase 1, untouched:** the unused `blocks` template (its removal is its own small change) and the set footer line (phases 3 and 4).

**Next.** The owner looks at the sample page (on staging, with the owner's go-ahead for the draft write, or from the screenshots and the script on a
scratch database); then phase 3, the sponsor pages (built: see *Phase 3* below), which is the decision point in `PAGE-BLOCKS.md`.

## Phase 3: the sponsor pages (built 2026-11-19; the exit is the owner's, in staging)

`PAGE-BLOCKS.md` phase 3, the pilot, on the owner's instruction to go as far as possible. It is built and tested locally; the preview build of the pushed branch (`ef54363`) applied both migrations to staging, **verified with read-only queries through the Supabase connector**: `payload_migrations` lists `sponsorship_settings` and `sponsor_pages`; the settings tables hold 1 row, 7 dayparts, 2 programs, 4 packages and 7 interests, equal to the old global's; `pages` holds the six sponsor pages (published, set `sponsor`, 11, 12, 6, 7, 5 and 11 sections) among 31. The production database was not touched (it stays empty until launch). **Phase 4 (giving) was not started: the plan makes this phase a decision point, and the owner has not yet reordered a section, hidden one or built a page in staging.**

**What was built.**
- **`sponsorship-settings`** (Site settings; publishers edit): contact details, the proposal form's choices and server messages, the rate card, the Carpool prices, the new-sponsor packages and the events and programs. Data only. Saving it revalidates `global_sponsorship-settings`. Migration `20261119_050302_sponsorship_settings` creates its tables and **copies the values from the old global in SQL** (so the migration does not depend on the config as it will be at replay).
- **Five sponsor-only blocks** (`sets: ['sponsor']`): Rate estimator, Packages, Carpool plan, Open programs, Inquiry form. The plan named three; the Carpool and package prices are settings, so they are blocks that read them. Each has a config, component, test, thumbnail, registry entry and sample maker.
- **Six pages** (`/sponsor`, `/sponsor/on-air`, `/sponsor/digital`, `/sponsor/events`, `/sponsor/audience`, `/sponsor/credit-guidelines`) written at their own addresses by migration `20261119_050400_sponsor_pages` (the Local API, from the old global's current words, through `lib/sponsorship/to-sections.ts`). 52 sections in all (none hidden). `down` removes the six pages; tested down and up on rows. The six routes and `components/Sponsorship/*` are deleted.
- **The set's footer line** (`components/Page/SetFooter.tsx`, `lib/page-sets/footer.ts`): service line, corporate support's phone and address, and the credit guidelines link, under the last section.
- Library changes the pages needed (each optional, each tested): Cards and Stats and Callout take one link under the section (`moreLabel`, `moreHref`); Cards takes a small-print `note`; Stats tiles show a `compare` line under a figure and use four columns for four or eight; Cards uses four columns for four; Feature's line may be several paragraphs; the Picker's panel now always sits on its own row (with seven choices it had sat beside the last one).
- `/sponsor` is no longer a reserved first segment (`lib/paths.ts`); `RESERVED_PATHS` keeps the one address a route owns there, `/sponsor/inquiry-token`.

**Decisions I made (the owner can reverse any).**
- **A Picker's price is typed text** (the phase 2 open question): a block shows a price from the settings only when it exists to show it (the estimator, Packages, Carpool plan, Open programs). Nobody types a rate card number in a section.
- **The goal picker's last goal** ("Back something WUWF puts on") was built from the programs open at the time. It is typed text now, made from the programs open when the migration ran; it no longer follows them. The Open programs section on `/sponsor/events` still does.
- **The sector picker's two figure grids** became lines in each sector's panel ("Local: 65 median age...").
- **The digital page's illustrations** (a sample sponsor in a dashed box) and their note were dropped; a section has nowhere to draw them. This is the one word a test lists as lost on purpose.
- **The old `Sponsorship` global is hidden** in the admin (nothing reads it for a visitor) and kept, with its data, until phase 7.

**The design pass (same day, after the owner's review of the first screenshots).** The first arrangement lost a great deal of the polish the coded pages had, and I had not opened the design canvas: I built the blocks from the plan's descriptions and judged the pages by whether the words survived. I then read board 28 and the sponsor boards (rendered with Playwright from the canvas artifact) and rebuilt the blocks to them. What changed, all in blocks and the theme, none in the architecture:
- **Tone tokens**: `--tone-accent` (eyebrows, prices, links, marks: blue on light grounds, lime on dark), `--tone-ghost` (the outlined button), `--tone-card` and `--tone-card-rule` (the box of a card or tile; translucent on dark) and `--tone-tint` (a note, a chosen option). Contrast-tested for every tone. Two bands of the same tone in a row now read as one (the second gives up its top padding).
- **Heading beside the content** (`placement: side`, a field on every block with a heading): the eyebrow, title, intro and link in a left column, the content on the right, as the hub boards compose "Your name arrives as support" and "Why it works" and the FAQ. A phone always stacks it.
- **Feature** takes an aside: up to four figure tiles with a source line (the hub's dark opening band), or a sample sentence in a card (the on-air page); the split variant takes it too when it has no picture (the digital package band).
- **Boxed figures and cards** at the boards' 8 px radius; Cards with a price and no link words use the price as the link ("From $23 a credit →"); Quotes, Questions, Callout (a tint box with the link on the right), Table (the boards' header style), Closing band, the sponsor blocks and the buttons (a filled primary, lime on dark; an outlined ghost) were restyled.
- **Picker**: pill choices with the chosen one tinted; a panel with a total box and rows (a small label, a name, a detail, a figure on the right) for the goals, and rows for the sector figures.
- **Check list** takes a second list beside the first and a detail line under a row (the credit guidelines' two columns).
- The six pages were re-mapped onto these (`to-sections.ts`) and migration `20261119_150000_sponsor_pages_polish` rewrites the ones already on staging, **only if nobody has edited them since the first migration** (one version); an edited page is left as it is.

**Second pass, with Columns (same day).** The owner said the old coded pages, not only the boards, were the final product, and proposed optional multi-column layouts as blocks that hold other blocks (as Grove does). Built: **Columns** and the inline-only **Illustration** (see `PAGE-BLOCKS.md` → *Columns*), a **soft lime** tone (the old pages' pale lime band), a **Callout `lime` variant** (the pale lime note box), a **Table `pairs` variant** (each row as a plain card beside a marked one), and compact compare bars. The pages were re-mapped to look like the old ones: the hub opens on the tinted band with its figures in a row below, "Why it works" is the dark band again, the notes are lime, the digital page draws its three sample sponsor messages beside the tables (Columns: Illustration | Table), the credit guidelines have their two lists in two columns and their pairs as cards, the package band is pale lime with the price set large. Migration `20261119_160000_sponsor_pages_polish2` rewrites the pages already on staging (only if they have at most two versions; see its comment for the one case it cannot tell). The check list's second list was removed (Columns replaces it); the heading-beside option and the hero aside stay (the hub boards use the first, the on-air page the second).

**Still different from the old pages.** Spacing is a little looser and some tile text a little larger (a band is `py-14`, the old pages' sections were similar but their cards were tighter); the hero's single link is a filled button where the old pages had a text link; the picker's choices are rounder (`rounded-full`) with the chosen one solid dark as before. Otherwise the six pages hold the old pages' structure, words and look.

**Follow-up after the merge (the owner saw the hub's figures twice).** On staging the hub's opening band still held the four figure tiles of the first design pass beside its words, drawn again in the figures row below, and three hub sections still had their heading beside their content. Cause: `sponsor_pages_polish` and `_polish2` rewrote the pages through the Local API, which **merges a block that keeps its `id` with what is stored, so a field the new arrangement omits is kept**. Reviewed all 52 sections on staging by their stored keys and values against what the mapper writes: only the hub had leftovers (the hero's `aside`, `figures` and `asideNote`, and `placement: side` on "not an ad", "why it works" and the FAQ); the other five pages match. Migration `20261119_190000_sponsor_pages_clean` writes the mapped sections straight into the `sections` column and the latest version row (no merge, no new version; skipped for a page with more than three versions), tested locally against a database with those leftovers put back. New tests: no figure or section title is drawn twice on a page (the one repeat the old page itself had, the hub's 66% figure in the row and in "Why it works", is listed), and the hub's headings are above their content. The audience page's repeated source line is still open.

**The first clean migration skipped the hub on staging.** It counted versions (more than three means edited), and the hub had a fourth: an *autosave draft* made at 19:53 UTC by opening the page in the admin, holding exactly the published sections. So the duplicate stayed. `20261119_200000_sponsor_pages_clean2` replaces the count with `pageIsUntouched` (`lib/sponsorship/untouched.ts`, tested): at most three versions that are not autosaves, and every autosave draft equal to the published sections, compared without row ids (the Local API makes up a new id for a row with none stored, on every read). A page someone has changed (a fourth real version, or a draft that differs) is still left alone. Tested locally both ways: an identical draft is fixed, a draft with a changed headline is left alone. **Whoever has the hub open in the admin should reload it after this is applied:** an open editor holds the old sections and its next autosave would write them back.

**Findings.**
- **The registry is loaded by the Payload CLI, and so is anything a block's component imports**, including a client component's server action. The inquiry form's action imported the loader at the top of its file, which would have pulled the Payload config into the registry; it is imported inside the action now.
- **The path rule reserved `/sponsor`.** A record could not take an address under a first segment a route owns. The migration failed on it first; see the change above.
- **The inquiry form on a cached page.** The old page was `force-dynamic` to give the form its timing token. The page is cached now, so the form fetches its token when shown. A visitor without script can read the form but not send it (the old page had the same limit for a form that was open a long time).
- **A fidelity test found five things the first mapping lost** (a label above the goal's price, the events goal in the test fixture, two ids, the sample credit's quotation marks) before the owner could. `lib/sponsorship/to-sections.test.ts` keeps the list.

**Checks (local).** `pnpm typecheck`: clean. `pnpm lint`: no new error (the one existing error is `PlayerProvider.test.ts`). `pnpm test:int`: 232 files, 2,573 tests, all passing (phase 2 ended at 221 files; one unhandled rejection from `plugin-seo` in `revalidateSiteSettings.test.ts` exists before phase 3 and is not from this work); `pnpm build`: passes; `pnpm verify:migrations`: passes (it replays every migration on an empty database, including the one that writes the six pages from the starting wording). The migrations applied to a fresh local database in order, down and up again on rows.

**What the owner does next (the exit).** In staging: open Pages → Sponsorship set; reorder a section; hide one; add a section from the picker (it offers the library plus the five sponsor blocks); make a new sponsor page (it joins the sub-navigation by its `navOrder`). Change a rate in Sponsorship settings and watch the rate card change. If that is not comfortable, stop and revise before phase 4.

**Left out, on purpose.** The Open programs section's heading counts what is open (one, two, more) with the three headings as fields; the estimator's "Your estimate" label and the table's column names are still in code, as before. Dropping the old global's page fields and tables is phase 7. The giving set's footer joins the sponsor set's in phase 4. The unused `blocks` template is still its own small change.

## Phase 4: the giving pages (built 2026-11-19; the exit is the owner's, in staging)

`PAGE-BLOCKS.md` phase 4, on the owner's instruction to proceed. **The plan made phase 3 a decision point (the owner reorders, hides and builds in staging before phase 4); that check had not been recorded when this was started**, so if it finds the model wrong, this phase is revised with it. Built and tested locally; the preview build of the pushed branch (`469682d`) applied both migrations to staging (`wuwf-site-staging`, batch 49), **verified with read-only queries through the Supabase connector**: `payload_migrations` lists `giving_settings` and `giving_pages_as_sections`; the settings tables hold 1 row, 4 levels (8 benefit lines, 11 gift-benefit lines), 4 message tiers, 7 monthly and 6 one-time amounts and 5 broker detail rows, each equal to the old global's, with the same phone and monthly form address; the eight `giving_settings*` tables are owned by `payload_app`, have a foreign key to their parent and three indexes each (one on the root), no RLS and no `anon` or `authenticated` grants, and the `emphasis` enum holds standard, featured, leadership; `pages` holds the four giving pages (published, set `giving`, 9, 6, 2 and 3 sections, the thank-you page `noindex` and `noReferrer`) beside the six sponsor pages among 35. The deployment is READY. The production database was not touched (it stays empty until launch).

**What was built.**
- **`giving-settings`** (Members & accounts; membership staff, publishers and administrators edit): Member Services' phone, email and mailing address, the service line, the donation form's addresses and switch (and the "not set up" sentence), the members' listening level, the levels and Day Sponsor message tiers, the gift card's amounts and defaults, and the details a broker or fund needs. Data only. Saving it revalidates `global_giving-settings`. Migration `20261119_222418_giving_settings` creates its tables and **copies the values from the old global in SQL**. The account page, every show's support page and the Support block read it now.
- **Five giving-only blocks** (`sets: ['giving']`): Gift card (the Give page's opening and the card), Giving levels, Ways to give, Thank-you and Giving contact (variants hero, band and line). The plan named four; the phone and email are settings too, so the contact is a block that reads them. Each has a config, component, test, thumbnail, registry entry and sample maker.
- **Four pages** (`/support`, `/support/ways`, `/support/legacy`, `/support/thanks`) written at their own addresses by migration `20261119_223000_giving_pages_as_sections` (the Local API, from the old global's current words, through `lib/giving/to-sections.ts`). 20 sections in all. `down` removes the four pages; both migrations tested down and up on rows. The four coded views (`GiveView`, `WaysView`, `LegacyView`, `ThanksView`, their shell) are deleted; `DonateCard` stays, as the Gift card's client part.
- **Two coded shells.** `/support/ways` (`?way=` opens one way to give, a plain link, no script needed) and `/support/thanks` (the donor's name, amount and frequency) render their page record through `components/Page/SectionsRoute.tsx` with the request's query as `SectionContext.query`. No block reads the request; on the cached catch-all the query is empty and the blocks show their plain state. `/support` and `/support/legacy` are cached pages (SSG, one hour).
- **The set's footer** (the settings' service line) joins the sponsor set's in `SetFooter`. A page with `noindex` is left out of its set's strip and shows no strip (the thank-you page, as before). The set is named "Ways to give", the strip's old label.
- Library changes the pages needed: Steps takes the optional link under the section; Cards with the heading beside them put four cards two by two; `lib/page-sets/sections-kit.ts` holds what both mappers share (the sponsor mapper now uses it; its tests are unchanged).
- `support` is no longer a reserved first segment (a page may take a path under it, as under `/sponsor`); a **section** may not be named `support` or `sponsor` (`PAGE_SET_FIRST_SEGMENTS`: its list would sit at the page's address), and the two old Grove stories under `/support/` that redirect to the sponsorship pages stay unimportable.

**Decisions I made (the owner can reverse any).**
- **The gift card's amounts and defaults are in the settings**, with the levels they land in (they are numbers that must agree with the levels); the card's words are on the Gift card block.
- **The broker details** (legal name, tax ID, address) are settings rows; the Ways to give block draws them on the panels that ask, with Copy.
- **A panel's steps and notes are text areas, one to a line**, not nested lists (a block holds one level of list).
- **The Ways to give block works at `/support/ways` only**: held on another address it shows the first choice, because the open way is chosen by the query a cached page cannot read.
- **Membership staff keep what they had**: they edit and publish the giving pages and the settings; setting a page's address stays a publisher's (an existing rule), so a new giving page's address is a publisher's to set.

**Compared with the old pages** (a production-mode dev render of the old code and the new, at 375, 768 and 1280 px: no horizontal scroll, no console error, the same titles, one h1 on each). The word-for-word test (`to-sections.test.ts`) fails if a word of the old pages is lost; the one repeat of a word that moved is the strip's label, now the set's name. **Still different from the old pages:** the "more ways to give" cards and the thank-you "while you're here" cards each end in a "Read more" link where the old cards were a link as a whole; the "Where your gift goes" and "Why monthly" items are boxed cards; the leadership level has a blue border where it had a lime tint; the sample sentence on the legacy page no longer sets its `[blanks]` in italics and has a rule where it had a blue bar; the businesses band is a tinted note with a text link where it was a bordered box with a button; the "after you give" steps are a rule over each step where they were boxed columns.

**Left out, on purpose.** Dropping the old global's page fields and tables is phase 7 (`support-page` is hidden and kept). The Unearthing, Voyager and RadioLive pages are phase 6.

**What the owner does next (the exit).** In staging: open Pages, the giving pages; reorder a section; hide one; open the gift card and change the words; change an amount or a level in Giving settings and watch the card and the levels change; open `/support/ways?way=stock`; open `/support/thanks?name=Maria&amount=20&frequency=monthly`. Membership staff should be able to do the same, and nothing else.

**Checks (local).** `pnpm typecheck`: clean. `pnpm lint`: no new problem (the one existing error is `PlayerProvider.test.ts`). `pnpm test:int`: 242 files, 2,694 tests, all passing (phase 3 ended at 232 files and 2,573); the one unhandled rejection from `plugin-seo` in `revalidateSiteSettings.test.ts` exists before this work. `pnpm build`: passes. `pnpm verify:migrations`: passes.

## Phase 5: words still in code (built 2026-11-19; the exit is the owner's, in staging)

`PAGE-BLOCKS.md` phase 5, on the owner's instruction to proceed (phases 3 and 4 still wait for the owner's look in staging). Built and tested locally on a scratch Postgres 16 with pgvector, then **applied to staging by the preview build of `365d41e` and verified there** (below). The production database was not touched (it stays empty until launch).

**What was built.**
- **Shared text** (`shared-text`, Site settings group; publishers and administrators edit). The community calendar's guidelines (paragraphs, each with an optional bold lead-in; an email typed in one becomes a mailto link, through `linkEmails`), the membership appeal (text, button label, button address, checked by the support-link rule) and the fellowship explanation (title, items, the policy link's label). Read through `getCachedGlobal` (tag `global_shared-text`); every screen draws nothing for a part that is empty. Migration `20261119_233120_shared_text` creates the tables and copies the old words from `lib/shared-text/starter.ts`; tested down, up, down, up. The story page, home page, fellowship page and event submission page read it.
- **Broadcast schedule block** and a restyled week view (tone tokens, no fixed colours). The loader (`lib/live/week.ts`) reads the clock through a one-minute cache, so a page holding the block is regenerated at least that often and "today" is never a day behind.
- **List** gained the **shows** source, **episodes from every listed show** (`allShows`), and the layouts **tiles** and **rows**. Both new reads reuse `loadDirectory`, so a show's page and the directory agree. A show save now also revalidates tag `section-data:list`.
- **Five Listens blocks** (set-only): Ask WUWF, Open questions, Sessions and tables, Outcomes, Host form. Each Portal-data block is a pure view over `SectionContext.listeningHub` (tested with a hub fixture) and an async wrapper that loads its client form with `await import()` (the registry is read by the Payload CLI, which cannot load the `server-only` modules the forms reach).
- **Four pages written by migrations** at their own addresses: `20261119_235000_station_pages_as_sections` (`/schedule`, `/podcasts`; the schedule's cards come from the Listen live global's current rows) and `20261119_235500_listens_pages_as_sections` (`/listens`, `/listens/host`, in the listens set, from `lib/listening/hub-pages.ts`; a test fails if a word of the old pages is lost). Both leave a page that already exists at the address (or holding the slug) alone. `down` removes only the pages they wrote.
- **Deleted:** the `/schedule` and `/podcasts` routes, `components/Show/DirectoryView.tsx`, `components/Listening/Hub.tsx`. `/listens` and `/listens/host` are coded shells that render their record.
- New in the platform: `SectionContext.listeningHub` (the one place a request's Portal answer reaches a block), `PageSetSpec.subNav`, `lib/page-sets/sections-kit` unchanged.

**Decisions I made (the owner can reverse any).**
- **A new Shared text global, not Site settings**: Site settings is administrator-only, and an editor should be able to change a guideline.
- **The listens set has no strip.** The old pages had none.
- **The Listens words are on the sections; what the Portal sends is drawn by the blocks.** The tile labels inside a campaign band ("Answer on your own", "Join a session", "Answer", "Save a seat") are component text, like a button's label; the long lines (the empty state, the table tile's explanation, the voice-only intro) are fields on the section.
- **The jump links under the hub's headline** point at the anchors the mapper gives the other sections (`now`, `help-us-report`, `join-a-session`, `kitchen-table`, `came-of-it`, the Ask form). An editor who renames one breaks that link; the field says so.

**Compared with the old pages** (dev renders of the new pages at 375, 768 and 1280 px, the hub with a fake Portal answering on localhost; no horizontal scroll, no console error, one h1 each). **Still different from the old pages:**
- Schedule: "Press **Listen live**" is no longer bold (a Feature line is plain text); with no stream set up the page shows only its opening (it used to answer not found); the week sits in a grey band.
- Podcasts: with no show or episode listed, the page draws its heading only (it used to say "No shows are listed yet."); the latest episodes are a ruled list in a grey band and the show cards are tiles in the card colours; a show with a cover shows it square, as before.
- Listens: the hub's section order and words are unchanged; the Ask WUWF box, a kitchen table and the host form sit in a white card (they carry their own light styling), so on a plain ground the host form now has a padded card around it; when the Portal is not set up or cannot be read, the opening still draws (it used to be replaced by a title and the message). The host page's "← WUWF Listens" is a button (a Feature action) where it was a text link. `/listens/host` is no longer a static page (it renders the record through the shell).
- Shared text: none; the words are copied exactly.

**Found after merge (2026-11-20): the hub's campaigns were missing on staging.** The catch-all's `generateStaticParams` built a static `/listens` from the page record, and production serves a prerendered page before the coded shell, so the sections got no Portal data (dev does not prerender, so my local check and the tests missed it). Fixed by `CODED_SHELL_PATHS` (`lib/page-sets/shells.ts`, with a test that every `SectionsRoute` page is listed); checked in a production build against a fake Portal (campaign band, reporter cards, sessions and the "Answer a question" link all draw) and in the route table (`/listens` is dynamic). `/support/ways` and `/support/thanks` were never prerendered, so were not affected.

**Left out, on purpose.** Dropping the Listen live global's hidden cards field is phase 7. The Unearthing, Voyager and RadioLive hubs are phase 6. The season report list waits for suite phase F.

**Checks (local).** `pnpm typecheck` clean. `pnpm lint`: no new problem (the one existing error is `PlayerProvider.test.ts`). `pnpm test:int`: 253 files, 2,800 tests, all passing (phase 4 ended at 242 files and 2,694). `pnpm build`: passes. `pnpm verify:migrations` passes.

**Staging (`wuwf-site-staging`), verified with read-only queries through the Supabase connector.** `payload_migrations` lists `shared_text`, `station_pages_as_sections` and `listens_pages_as_sections` (batch 50). `pages` holds `/schedule` (3 sections: Feature, Broadcast schedule, Cards), `/podcasts` (3: Feature, List, List), `/listens` (7, set `listens`) and `/listens/host` (2, set `listens`), all published. `shared_text` holds 1 row, 5 guideline paragraphs and 3 fellowship items, with the old membership appeal's words; the three tables are owned by `payload_app`, have no row-level security and no `anon` or `authenticated` access, and each child table has its foreign key and three indexes. The deployment is READY.

**What the owner does next (the exit).** In staging: open `/schedule`, `/podcasts`, `/listens` and `/listens/host` and compare them with the live site; open Pages and reorder a section on the schedule page; open Site settings → Shared text and change the membership appeal, then open a story and the home page. Note that staging's Portal address is the preview Portal, so `/listens` shows whatever that Portal has open (or the "not set up" sentence).

## Staging demonstration content for news sections and placements (2026-11-18)

The owner asked that staging hold enough demonstration data to show every feature built. `scripts/staging-demo/seed-placements.ts` (rules and contents in `seed-placements-core.ts`; beside the older
`seed.ts`, same conventions: staging only, everything labelled **Demonstration**, safe to run twice, never changes what an editor set; dry run by default, `--go` to write) adds, only where missing:
- **A Florida News section with six demonstration stories from a "partner"** (`source: wire`), so the owner's decision to feature partner content has something to show. Staging has no real Florida News or Music & Arts stories (it holds 242 real stories, all WUWF's own).
- **The home page's news sections** (only while it has fewer than three; appended, never removed): Local News, Local Politics, Local Arts, Florida News, UWF News: real sections with real stories.
- **A sample sponsor** ("Example Sponsor (demonstration)") and three plainly-labelled sample pictures (`scripts/staging-demo/assets/demo-sponsor-*.png`), used for a **home banner** with a phone picture and a sponsor tile.
- **Five list-page placements, each aimed differently:** the sample sponsor on the Local News pages (10); the sample sponsor on the all-stories page (20); WUWF's own Book Club on Local Arts and Commentary (30); WUWF's own Protect My Public Media on one reporter (Dave Dunwoody) and one topic (City of Pensacola) (40); WUWF's own app on every list page (50). WUWF's own pictures and links are taken from the home rail already imported.
- Real sponsors' artwork is **not** reused for aiming demonstrations: a real sponsor's ad on a page it did not buy would mislead anyone shown the staging site.
- **Staging was seeded 2026-11-18** by the preview build (no staging credentials in a cloud session) through a temporary marker file and build hook, both now **removed** (git history has them); `seed-placements.ts` stays as a tool. Read back from the database (five news sections, six partner stories, the sample sponsor, 10 rail + 1 banner + 5 list placements) and from the rendered preview: home (5 sections, banner, 9 tiles, 5 sponsor labels), `/local-news`, `/latest`, a reporter page and `/local-arts` each showed the placements aimed at them. Staging has no Music & Arts section, so the home page starts with its own sections. Rehearsed on a scratch database shaped like staging (dry run, run, run again: 21 made, then 0), checked in a browser on every page it touches, tested (`tests/int/seed-placements.int.spec.ts`, 6 tests).
- **Not demonstrable from seed data:** the who-may rules (they need signed-in users of each role), a placement past its last day (the Sinfonia tile is held instead), and the admin screens (not opened in a browser).

## Sponsor rail redesign (built 2026-11-20, reworked the same day)

From the canvas "Sponsor Rail Redesign" (owner-reviewed). **Done:** one card for every tile (label strip with "Sponsor message" or "From WUWF" and the sponsor's name, artwork in a 5:4 frame with a blurred copy of
the picture behind small art); migration `20261120_162233_placement_fills_gaps` (one nullable-default column, "Can fill a gap" on a house promotion); `lib/placements/flow.ts`, `resolveFillers`, `fillsFrame`.
**The first layout (PR 388) put a pair of tiles in a side column beside each news section; on staging a section is about 1,800 px tall and a pair about 660 px, so two thirds of every section was blank and the
video row had no tile. Reworked as option B:** the tiles are full-width rows of three between the sections (the first just below the videos), the news cards run three across with the lead story spanning so no row is
short (`leadSpanClass`), and a short last row is completed by optional promotions or centered. **Lesson:** the pair was sized against placeholder sections; check a layout against the real page's heights before building it.
**Superseded 2026-11-22:** the spanning lead (`leadSpanClass`) put a card beside the lead, so the lead read as part of the grid. A news run's lead is now a row of its own with a rule under it, and the rest sit in an even grid (`LEAD_ROW`, `restGridClass`); a run holds 3 to 7 stories.
**Not done:** the list pages (section, topic, reporter) keep their side rail (now the new card); a "where each tile shows" admin preview (`PLACEMENTS.md`, open item 6); an artwork template for sponsors (corporate support
confirms the 880 x 704 size first). **Not yet checked in a browser at three widths.**

## Editor-made placements (built 2026-11-18; supersedes the fixed rail and banner lists below)

Prompted by the owner: editors should be able to create placements and decide the pages and sections they appear on, with no deploy to rethink the
taxonomy. **`PLACEMENTS.md` is the design; read it first.** Zones stay code (`lib/placements/registry.ts`); placements are records (**Commercial → Placements**, collection
`placement-items`).

- **Built zones:** `home.rail` (10), `home.band` (1) and the new **`list.rail`** (4 per page, beside the stories on a section, topic, reporter and the all-stories page, aimable at chosen
  sections, topics, reporters and `/latest`, or at every list page; "chosen" with nothing chosen is refused, so nothing shows everywhere by accident). `story.rail` and `story.inline`
  are designed, not built, and cannot be chosen.
- **A placement:** name, kind (Sponsor, labeled; House promotion, unlabeled), sponsor (a record in **Commercial → Sponsors**, so one identity across underwriting and placements), zone, picture
  (phone picture for a band), what it says (160 characters), link, order, first and last day, Show. **No package, price or product reference anywhere** (owner).
- **Pure resolver** (`lib/placements/resolve.ts`, 18 tests): given a page and the records, which tiles run: zone and page kind, targeting, on/off, dates (Central-time days), picture, safe link,
  then order (lower first, then oldest), up to the zone's capacity. Pages call it and nothing else, so the Portal's bookings can become a second source later without touching a page.
- **Rules in the collection:** corporate support and administrators make and change anything; **publishers make and change house promotions only** (they cannot make a sponsor placement, change one, or turn one into
  one); the public reads only what is on. The home zones **refuse a placement past their capacity** with what to do (switched-off and ended ones do not count, so a full rail can be rotated); a list zone is
  counted per page by the resolver. Trusted server code (the import, tests) acts with no user and is not blocked by the who-may rule (found by a test: the first version blocked it).
- **Caching:** placements are read once under the `placements` cache tag; saving, deleting or switching one refreshes every page that reads them. A first or last day takes effect when the page next refreshes
  (home within 5 minutes, list pages within the hour).
- **Migration `20261118_191825_placement_items`** (plain SQL; generated in two steps, add then drop, because Drizzle asks interactively whether new tables are renames; tested up, down and up on real rows and
  on a fresh database): creates the collection, copies the old rail and banner into it in order (`order` spaced by ten), **finds or makes each sponsor in Sponsors from the old tile's plain-text name**
  (an existing one is reused), drops the old `placements` global; `down` restores the rail (at most ten) and the banner. Its `down` had a latent flaw in the generated SQL (dropping a table with CASCADE and then
  its constraint), found by running it; fixed with `IF EXISTS`. **Staging's ten tiles migrate when the preview builds**, and make five Sponsors there.
- **`import-rail.ts`** now writes placements (and Sponsors); it makes none twice, never overwrites a rail made by hand (`--replace` clears the zone), and "rail written" means it made at least one.
- **Checked** in a browser at 1440 and 390 px on a fresh database (53 migrations replayed): home 9 tiles; `/local-news` the Alphastar sponsor tile (labeled) then the house promo; `/music-arts` the house promo
  only; `/latest` the house promo then Boyles & Boyles; no overflow, no console errors, no outside scripts. **Not checked:** the admin screens themselves.
- **Not built (and said so in `PLACEMENTS.md`):** the "where this shows" preview and a conflicts view (the resolver is deterministic and the home zones refuse overflow, but an editor cannot see a list-page overlap),
  exclusions ("every section except..."), targeting by story format or show, the story zones, proof of performance, the Portal source.
- **Lessons.** (1) `payload migrate` after the dev server has run asks a data-loss question and hangs without a terminal; use a fresh scratch database. (2) **Never chain `migrate:down` after a failed up**: it rolls
  back the previous batch, which on a freshly built database is every migration (it wrecked a scratch database, nothing else). (3) `payload migrate` reads the migrations directory, not `index.ts`: hide a
  migration by moving the file. (4) A rule about who a person is belongs on signed-in staff only: trusted scripts have no user.

## Home page first screen (built 2026-11-18; the band, board 1g without the Listen bar)

The owner found the first screen poor at 1440 x 900: the picture took 665 px of the 835 under the header, the headline began below the fold, and The Briefing and the lead did not end on the same line. Five layouts were drawn on the canvas (boards 1d to 1h). The first build (board 1h: a two-column lead, picture capped at 40% of the window height) was merged, then the owner saw that the capped picture was too wide and short (800 x 360, 2.2:1) and would crop real photos badly (a 3:2 photo loses a third of its height, a portrait about three quarters). A half-window cap (a true 16:9 at 900, 2.46:1 at 650) was a stopgap; the owner then chose the band.

- **The lead is a band** (`HomepageView`): the story's words on the left (28.75rem), its picture on the right, a normal 16:9 (692 x 389 at 1440) that **never changes shape with the window** (no height cap), the byline level with the picture's bottom edge. The headline is at the top, so it is in view even in a short window (measured at 1440 x 900 and 1366 x 650). A long headline makes the band taller; the picture stays 16:9 and keeps the top. On a phone the picture comes first and everything stacks; with no picture the words take the full width.
- **The Briefing is a row under it**, as many columns as there are stories (up to five); two columns on a tablet, one on a phone. It ends about y=740 at 1440 x 900, leaving the next module's top in view.
- **"Listen now" is gone** (`ListenNow.tsx` was deleted earlier): it duplicated the header's Listen live button and the site's player, made a schedule request on every home view, and was why the right column had been taller than the lead. The player bar still appears once anything plays.
- The side column (`SIDE_COLUMN`, 22rem) now exists only in the lower block: the videos and the news, with the sponsor rail beside them. Section, topic and reporter pages keep a 20rem rail.
- Not built from the board: the "Updated 7:42 a.m." time on The Briefing (nothing stores it), the "Listen to the story" button under the lead, and the Listen bar (dropped on purpose).
- **Crops follow the focal point.** A picture cropped to fit (`object-cover`) is cropped around the focal point an editor sets in the media library (`focalX`/`focalY`; `lib/media/focal.ts`, applied by `ImageMedia`), and around its centre when none is set. A picture shown whole (`object-contain`, a sponsor's artwork) is left alone. Phone check (320 to 1024 px): picture first, then words, then the Briefing; no sideways scroll, and each Briefing item is one tap target.


## Home page: Listen now, and the rail beside the videos and the news (built 2026-11-18)

Two changes the owner asked for after reviewing board 1 and the three layouts drawn as boards 1a to 1c (the owner chose 1b).

- **The sponsor rail now starts level with the short-video row and runs down beside the videos and the news** (it used to start under the videos, beside the news only). The videos and the news share one column (`HomepageView`; `VideoRow` takes a `className` so it can sit in a column). With no videos the rail simply starts beside the news; with no rail the column is full width, as before. On a phone the tiles follow the column, as before. With many tiles the rail can run taller than the column and leave blank space at the left before the banner; the home rail holds up to ten, so editors should keep it to about four or five.
- **"Listen now" under The Briefing** was built here and **removed later the same day** (owner decision: the header's Listen live button and the site's player already do it; see the next section).
- **One two-column template (`SIDE_COLUMN`, a 22rem side column) for the lead section and for the videos-and-news block**, so The Briefing, Listen now and the rail start at the same edge and are the same width (the first version used a 1.7fr/1fr split above and a 20rem column below, so the rail sat about 70 px off). The rule beside The Briefing is drawn in the gutter, not inside the column. The lead picture is 16:9 at least and takes up spare height, and Listen now takes up spare height too, so the bottom of Listen now is always level with the lead's last line (measured with a normal lead, a portrait photo, and a lead taller than the right column).
- Checked with the real components rendered to HTML with the site's CSS at 1440, 1024 and 390 px (rail top level with the video row, Listen now under The Briefing and level with the lead, no sideways overflow; no videos, no rail and no channels each leave no empty box). Not checked: the stream itself, and the schedule answering, on a deployed preview.

## News sections, All stories and sponsor placements (built 2026-11-18)

Prompted by the owner's review of the home page (one news list, no link to more stories, no ad places) and a read of the live wuwf.org home page
(owner-approved 2026-11-18: robots.txt allows all; neutral client; one page plus ten pictures, 3 s apart; raw files kept outside the repository).
The live page is a 70/30 layout: an untitled lead block, then titled runs for Music & Arts, Local News, Florida News and NPR News (each linking to its
section or tag page; only NPR News has "Load More"), and a right-hand column of ten image tiles (five outside businesses and nonprofits, five of
WUWF's own) with **no "Sponsor message" label** and uneven sizes; Google Publisher Tag is set up in the page head but draws no slot on the home page.
There is no "all stories" link on wuwf.org either.

- **News sections** (Home page → *News sections*; replaces the single "Local news" tab). An ordered list of up to six: heading, section, story count
  (3 to 8, default 5), a Show switch. Each links to its section page ("More from ...") and the band ends with **All stories** (`/latest`). A story is
  shown once on the page (lead, Briefing and feature take theirs first, then each section in order). A section with nothing left is left out; with
  none configured, or none holding anything, one "Latest stories" run stands in, so the page is never blank. **Florida News is featured on purpose**
  (owner): a section's run is every published story filed under it, whatever its `source`; the lead and the Briefing still fall back to WUWF's own
  work only. With the rail beside the news (two columns), an odd count makes the first story span both columns. Pure rules `lib/homepage/modules.ts`.
- **`/latest`: every published story, newest first, 12 a page** (a fourth list kind beside section, topic and person; same layout, paging, 404 past the
  end; `latest` is a reserved first segment). Publishing a story refreshes it. The starter's `/posts` list (titles only) is **gone**, redirected
  permanently to `/latest` (`/posts/page/1` to the plain address; other pages keep their number).
- **Placements** (first version, **superseded by *Editor-made placements* above**: the registry became zones and the global became a collection; `PLACEMENTS.md` is current). A typed registry (`lib/placements/registry.ts`) named every fixed
  place: **built** `home.rail` (up to ten tiles beside the news; after it on a phone) and `home.band` (one banner after the news sections, before the
  podcasts: never above the news, not a leaderboard); **designed, not built** `section.rail`, `story.rail`, `story.inline`. The new global **Sponsor and promo
  placements** (Pages & hubs; `sponsorship.manage` or `content.publish` may edit) holds the tiles: kind (Sponsor, drawn with "Sponsor message", or House
  promotion, unlabeled), sponsor name, picture, what it says (alt, 160 characters), link (this site or https), first and last day (a whole day, on the
  station's Central-time date), Show. A tile that is off, expired, not begun, without a picture or with an unsafe link is left out and the rest close up;
  a placement with nothing draws nothing. Sponsor links are `rel="sponsored noopener noreferrer"`; every tile has the same shape (the picture is fitted, never
  cropped, because sponsors' words are in the artwork); no script, frame or outside request. A failed read leaves the placements out and the news up.
  **Interim source only:** which sponsor fills a place stays the Portal's design (see *Sponsorship direction*); no booking, billing or proof of delivery here.
- **Imported the live rail** (`scripts/placements/import-rail.ts`, rehearsed on a local database with the real ten pictures; **run on staging by the owner**,
  then production with `--production`: dry run by default, `--apply`, never overwrites a filled rail without `--replace`, reuses pictures it has).
  **Corporate support must confirm each tile's kind** (sponsor or house) which I read from the destination and the picture; the **Sinfonia Gulf Coast** tile
  is imported *held* because its picture advertises Saturday Nov. 14, already past (the live site still shows it); **Emerald Coast Theatre** (Dec. 3 to 20) and the
  **Santa Rosa County tourism** tile ("Sept. to Nov.") need a last day set; four house tiles point at `wuwf.org/...` pages that do not exist here yet (apps, weather,
  Florida Storms); "Protect My Public Media" is a 300 by 170 picture enlarged by the live site (soft; ask for a bigger one).
- **Staging was seeded 2026-11-18** (the owner asked that nothing be run from their machine, and this session has no staging credentials): a one-off step in `scripts/vercel-build.sh`,
  run by the preview build with the site's own database and storage settings, added the Local News section (the only starter section staging has: it has 13 sections, no Music & Arts or
  Florida News) and imported the ten tiles; read back afterwards from the database (one section, ten tiles, nine showing) and from the rendered preview (nine tiles, four "Sponsor
  message" labels, no outside scripts). The step, its marker file and the script are **removed** (git history has them). **Production is not seeded**: after the production import, add
  sections in Home page → News sections and run `import-rail.ts --apply --production` (or enter tiles in the admin). Reason it was needed: the migration seeds sections only where the Home page
  row already exists, and staging's never had been saved.
- **No packages on the site** (owner, 2026-11-18): placements carry no package, price or product reference, in the registry, the admin or the pages. Packaging and price are the Sponsorship pages'
  and, later, the Portal's. The planned editor-created placements (below) follow the same rule.
- **Migration `20261118_161412_news_sections_and_placements`** (plain SQL; tested up, down and up on rows; `verify:migrations` passes). It creates the new tables, **carries the old Local
  news list over as the first section**, adds Local News, Music & Arts and Florida News (5 each) only where the home page has none yet and those sections exist, then drops
  the old columns; `down` puts the first section back. **A database with no sections yet (production before the import) gets none: after the import, add them in Home
  page → News sections** (until then the page shows one "Latest stories" run).
- **Not done:** an "All stories" link from the header or footer (admin-edited globals); NPR News as a module (needs wire stories imported and labeled "From NPR"); the three designed
  placements; first-party view and click counts for sponsors (undecided: `PLACEMENTS.md`, "Decisions that are open"); the sponsor and Digital pages still say the website Banner is
  priced on request, and the placement artwork sizes in the registry are **proposals** corporate support must confirm; the live page orders Music & Arts above Local News and this
  site does not copy that (editors order the sections). Checked in a browser at 1440 and 390 px with seeded stories and the ten real tiles: no horizontal overflow, no console errors,
  one `h1`, no duplicate ids, no third-party scripts, every tile labeled as it should be. **Not checked:** the admin screens themselves (no browser session in the admin).
- **State.** Full suite **164 files, 1,954 tests pass** (new: modules, placements, the import, `/latest`, the rail and banner markup); typecheck and the production build pass; `verify:migrations` passes; lint has 0 new errors (the one old error is below).
- **Lessons.** (1) My first draft of tile 3's link was a guess from an output cut at 70 characters, and wrong; the manifest is now checked against the saved page address by
  address. (2) The field's 160-character alt limit caught four over-long alt texts in the manifest; the dry run now checks the same limit. (3) `pnpm lint` has **one old error**,
  not from this work: `src/components/ListenLive/PlayerProvider.test.ts` line 35, `react/no-children-prop` (from the single-player commit); the site is not in CI, so it was not caught.
  (4) A story-card test that pins nothing at the top of the page will see the lead and Briefing take the newest stories: pin them (`tests/int/homepage.int.spec.ts`).

## Giving pages, boards 14 to 14d (built 2026-11-17)

The giving section of the reviewed canvas (rethought Nov. 17) is built as public pages: `/support` (14, the Give page), `/support/ways` (14b, other ways to give),
`/support/legacy` (14c) and `/support/thanks` (14d, where a gift ends). The boards win on copy, order and layout, except where noted below. **These pages describe giving
and hand the donor to WUWF's donation form; the site never takes a gift.**

- **Board 14a (the gift form) is deliberately not built as drawn.** It collects card number, CVC, bank routing and account numbers and a UWF employee ID. The site is not the
  ledger (`CLAUDE.md`), has no payment processor, and collecting those details here would put the site in card-data scope for a department of the University. Instead the Give
  card (the board's own: monthly or one time, the levels' amounts, what each comes to) sends the chosen amount and frequency to **WUWF's donation form**. Where it goes is the
  `Giving pages` global's **Donation form address** (Contact and the form tab). With none set, no Give button is drawn and the card says to call (never a dead button).
  **Whether the form reads the amount from the link is unconfirmed (a first test with `?amount=20` did not preselect):** the global has a switch, "The form takes the amount
  and frequency from the link", off until someone tests it, and the parameter names to use; the note under the button changes with it, so the page never says an amount is
  "already chosen" when it is not (`lib/giving/donate.ts`, `donationHref`, tested). Everything 14a draws that is not payment (where it goes, gift or memorial, about you, Day
  Sponsor days and messages) is the donation form's job; **three panels and one FAQ answer assume the form has those fields** (below).
- **Everything editable is in the admin (the standing rule).** The existing Support page global (slug `support-page`, now labelled **Giving pages**, same edit permission: membership
  staff, publishers, administrators) holds every heading, sentence, amount, level, address and switch, with a tab per page. Code holds behaviour: which level a gift lands in and how many
  Day Sponsor messages it earns (`lib/giving/levels.ts`, from each level's monthly minimum and the message tiers), the donation link, the strict reading of the thank-you address,
  which way to give is open, and the markup. A level is `minimumMonthly` ($5, $10, $15, $100); a one-time gift counts by the year against the same line (12 times it).
  The show support page (board 24) and the account page read the same levels and the "members' listening comes with" level, so there is one list of levels (the "$8" level and
  the Combined Federal Campaign line are gone, as the boards say).
- **Migration `20261117_224728_giving_pages`**: tested up, down and up on a database holding first-pass rows; `verify:migrations` passes. It **drops** the first-pass
  fields (hero figures, "other ways" line, businesses and fellowships bands, footer note, level button addresses) and **clears the first-pass levels** (each now needs a monthly minimum),
  then writes the boards' wording once from `lib/giving/starter.ts` (nothing reads that file at runtime). Anything an editor typed into the old page on staging is replaced; production
  has never been migrated. It also overwrites "members' listening comes with" with "a sustaining membership of $10 a month or more".
- **Not built because nothing supports it:** a gift-management account (the Give page's "change by phone or from your receipt email" replaces the board's "or through your account";
  the board's own FAQ already says phone or the receipt link), saving anything about a donor, any record of a gift.
- **The thank-you page reads its address strictly.** The donation form may send the donor back with `?name=&amount=&frequency=`; each is read only if it looks like a first name, a
  whole-dollar amount and `monthly` or `once` (`lib/giving/thanks.ts`), and dropped otherwise, so the address cannot print a sentence of someone's choosing under WUWF's name. Nothing is
  stored. The page is `noindex` and sends no referrer. With none of it, it says thank you without claiming to know the amount.
- **Other ways to give is plain links, not script tabs:** `?way=stock` opens a way (a panel's own name, then a group's, then the first), so one can be linked to and the page works
  without script. The only script is the Copy button and the gift card's selection.
- **New shared pieces** (use these before building the same arrangement again): `components/PageParts` (hero in four tones, titled section, `ButtonLink` that draws nothing without a safe
  address, `Faq`, `StepGrid`, `StepList`, `CheckList`, `LinkCards`, `ContactBand`, `CopyButton`, the pill and button styles), extracted from the sponsorship parts (which re-export them, so
  the sponsor pages are unchanged; its FAQ now uses `Faq`); `lib/page-content.ts` (the text helpers) and `globals/fieldBuilders.ts` (the Payload field builders), likewise re-exported.
- **Tests:** 64 unit tests (levels, donation link, thank-you address, ways, nav, content shaping), 4 render tests for the gift card, the rewritten integration test for the global (who may
  edit, unsafe addresses refused, a stored configuration comes back as the donor's card). Checked in a browser at 1440 and 390 px: no horizontal overflow, no console errors, one `h1` and no
  duplicate ids on each page; the card, the copy button and keyboard selection work.
- **Also fixed:** the admin-navigation test did not list the `sponsorship` global (it failed since the sponsorship commit).
- **Not done here:** links to `/support/...` from the header's About menu and the footer (both admin-edited globals; the header's Donate button already goes to `/support`); sitemap entries.
- **Redirects from Grove's giving pages (built 2026-11-18, active when this site serves wuwf.org).** `src/lib/giving/legacy-addresses.ts` lists each address and why it goes where it does, and
  `redirects.ts` (next.config, so no database and not subject to the doubled-`Location` problem under *Known gaps*) serves them ahead of any page: `/donate` and `/thanks-for-your-support` to
  `/support` (**307**: owner, 2026-11-06, so they can be pointed at the donation form later); `/sustaining-membership` to `/support`; `/membership-levels-and-benefits` and `/day-sponsor-messages` to
  `/support#levels`; `/leave-a-legacy` to `/support/legacy`; `/real-estate-donation` to `/support/ways?way=vehicles`; and the two stories under Grove's `/support/` section
  (`/support/2014-10-31/wuwf-corporate-sponsors`, `/support/2017-02-08/wuwf-corporate-support`) to `/sponsor` (**308**; `support` is a path this site owns, so they could not be imported at their own
  addresses). **Found by reading Grove's own pages (owner-approved 2026-11-18; robots.txt allows all; neutral client; 3 s apart; raw pages kept outside the repository):** `/donate` is not in any sitemap
  (Grove answers it with a 301 to `/thanks-for-your-support`, and every Grove page links to it); 16 other likely addresses (`/give`, `/membership`, `/vehicle-donation`, `/planned-giving`...) are 404; Grove's
  `/support` is a 200 section page, replaced by the Give page at the same address. The six inventory rows in `standalone-dispositions.csv` moved from `proposed:keep` to `proposed:replace`, so **the
  importer should skip them** (a redirect wins over an imported page). Tests check each rule, that none loops or chains, and that a `?way=` destination opens that panel. Grove also serves redirects no
  sitemap lists, so an old giving address printed in a newsletter or read on air is a one-line addition; Search Console's links report is how to find them.
- **What Grove's giving pages showed about the donation form (2026-11-18).** WUWF's form is NPR's donation platform: `https://donate.nprstations.org/wuwf/` with **separate forms** for a one-time gift
  (`/wuwf/wuwf-secure-pledge-form-one-time`) and a sustaining gift (`/wuwf/wuwf-secure-pledge-form-sustaining`), and a **sustainer update form** (`/wuwf/sustainer-update-form`) where a monthly gift is
  changed. The giving global has **one** form address; per-frequency addresses (and a link to the update form for "change or stop a monthly gift") are the likely change: owner to confirm. Also:
  the vehicle partner has a real-estate page (`https://wuwf.careasy.org/real-estate-donation`), which is what the vehicles panel needs for `/real-estate-donation` to land on something that describes it;
  Grove's sustaining page names a different Member Services address (`trish@wuwf.org`) from the boards' (`lolly@wuwf.org`), so the address to publish is a decision.
- **What Grove's giving pages showed about the donation form (2026-11-18), and what was built from it.** WUWF's form is NPR's donation platform, `donate.nprstations.org/wuwf/`, with **separate forms** for a
  sustaining gift (`/wuwf-secure-pledge-form-sustaining`) and a one-time gift (`/wuwf-secure-pledge-form-one-time`), and a **sustainer update form** (`/sustainer-update-form`). The global now has a form
  address for each frequency (a monthly gift goes to its form, a one-time gift to its own, the general address for anything else; a typed-but-unusable address is never replaced by the other frequency's
  form), the Give FAQ items take an optional link (the monthly-gift question links the update form) and a way-to-give panel takes an optional second button (the vehicles panel links the partner's
  real-estate page, `wuwf.careasy.org/real-estate-donation`). Migration `20261118_034853_giving_form_addresses` adds the columns and fills the three addresses, the FAQ link and the button from those
  Grove links. **Pre-filling is still off**: nothing has confirmed these forms read an amount from the address. Still for the owner: the fund and attribution code in each address, whether the forms send a
  donor back to `/support/thanks` (the thank-you page works without it), and whether they have the fields three panels assume (see the pre-launch list). Grove's sustaining page names a different Member
  Services address (`trish@wuwf.org`) from the boards' (`lolly@wuwf.org`), so the address to publish is a decision.
- **Migrations and the Local API (lesson, 2026-11-18).** A migration that writes through the Local API reads the *current* schema, so it breaks on a fresh database once a later migration adds a column to
  the same global; `pnpm verify:migrations` caught it. The giving starter content is therefore written by the **last** migration that touches the global (`giving_form_addresses`), only when the global is
  empty, and `giving_pages` is schema-only. Do not add a Local API write for this global to an earlier migration.
- **Read on Grove and deliberately not redirected:** `/how-can-i-promote-my-cause` routes an event to the Community Calendar, a business to sponsorship, a nonprofit to the quarterly on-air spotlight and a
  story idea to the newsroom (so one destination would drop three of four), and `/our-corporate-sponsors` is a list of sponsor names with no page here to replace it. Both stay `proposed:keep` for the importer.

## Sponsorship pages, boards 16 to 20b (built 2026-11-17; moved into `pages` as sections 2026-11-19, phase 3)

**Moved.** The six pages are records in `pages` (the sponsor set) built from sections, and their prices, rates, contact details, form choices and programs are the `Sponsorship settings` global (see *Phase 3* above). The paragraphs below describe the content and behaviour as built on 2026-11-17 and are history where they say "the `Sponsorship` global" or name a route or view: `CLAUDE.md` → *Pages and sections* is the rule now. The old global is hidden and is dropped in phase 7.

The "Sponsor WUWF" section of the reviewed canvas is built as public pages: `/sponsor` (16, the hub and the inquiry form), `/sponsor/on-air` (17),
`/sponsor/digital` (18), `/sponsor/events` (19), `/sponsor/audience` (20) and `/sponsor/credit-guidelines` (20b). The boards (rethought Nov. 17, strategy
"sell trust, not response") win on copy, order and layout. **This is the business-facing description and price list only.** Placements on the site,
entitlements and proof of performance are still the open Portal-side design above; nothing here books, serves or records a sponsor.

- **Everything editable is in the admin (owner's standing rule: copy and UI configuration live in Payload, not in code or environment variables).** The
  `Sponsorship` global (Pages & hubs; publisher edits) has a tab per page: every heading, paragraph, button label, rate-card row, package, Carpool price,
  discount percent, goal and its lines, placement, figure with its source line, testimonial, FAQ entry, sector view, credit-guidelines list and closing band,
  plus phone, address, the inquiry notice, the form's choices and field labels, and the sample business used in illustrations. Every optional section has a
  **Show this section** switch. Code keeps behaviour only: the estimator's arithmetic (`lib/sponsorship/rates.ts`), the form's validation and anti-abuse,
  the markup. **Still in code:** the six page routes, the placement table headers and "Illustration" captions, form validation messages, and small fallbacks
  (nav names). Migrations `20261117_181047_sponsorship_pages` (events and programs) and `20261117_194934_sponsorship_copy` (the rest; it writes the reviewed
  boards' wording through the Local API once, from `lib/sponsorship/starter.ts`, which nothing reads at runtime), tested up, down and up;
  `verify:migrations` passes. Saving the global refreshes `/sponsor`.
- **Inquiries are mailed, not stored, to an address entered in the admin** ("Where proposal requests are sent", Contact and form tab; a **staff-only field**,
  read only by the server when a form is sent and removed from what pages receive). Sending uses the Resend settings the membership claim already uses (those
  are credentials, so they stay environment variables). Empty address or no mail service: the form says online requests are not set up (the message is an
  admin field) and never pretends to send. Honeypot, signed timing token and length caps guard it; no per-address rate limit (nothing is stored to count).
  **Enter the address and the university's IT-04 notice in the admin before launch.** `Mail` gained an optional `replyTo`.
- **Brackets on the boards are review notes, so the starting content prints none.** A product with no confirmed price or size is left out or reads "Priced on
  request" (the website "Banner" row, e-newsletter and website ad sizes, the rates-effective date, the IT-04 wording, the "draft for UWF review" line on the
  guidelines, the Nielsen / NPR-permission / "do WUWF's counties fall in the C and D group" notes). They are the **pre-launch checklist** below.
- **Decisions to confirm.** The rate card keeps the board's three weekend rows; the root `CLAUDE.md` lists Traffic's names as "Weekend", so check them against
  the Portal's (a label edit in the admin). Package 2's Total Program Rotation credits work out to $19 against $30 open (the board's open question); a test
  records the $19. Typed prices in goals and place cards are text the editor keeps in step with the rate card (the estimator and the package prices read the
  numbers). The Book Club is seeded as open although the board lists "whether the partnership is open now" as unconfirmed: set it to Held if it is not.
- **Not done here.** Links to `/sponsor` from the header's About menu and the footer's For-businesses column (both are admin-edited globals), the Support page's
  "Sponsor WUWF" button address (`/sponsor`, in the Support page global), sitemap entries.
- **Before launch:** corporate support confirms the rate card's effective date, who counts as a new sponsor, package length and end date, website and
  e-newsletter ad sizes, the website banner, event levels and recognition, the IT-04 notice, the final credit-guidelines policy (UWF review), whether WUWF's
  counties fall in NPR's small-markets group, Nielsen's citation and use terms, and NPR's permission to publish Audience Insights data
  (audienceinsights@npr.org). Whether WUWF reports views and clicks to sponsors is undecided; the pages promise nothing about it.

## Cards with audio, audio order, section nav (2026-11-16)

- **One player for all audio** (2026-11-16, after looking at how wuwf.org does it: its story and card "Listen • 7:37" pills all hand off to one persistent player bar). `PlayerProvider` (root layout, so it survives navigation) now plays the live stream or one on-demand track; `PlayAudioButton` is the play button for a track and `PlayerBar` shows it (title linking back to the story, seek slider, back/forward 15 s, volume, "Listen live"). Cards, the story and episode pages, show pages, Unearthing and the home page's podcast and Unearthing slots use it; none has its own `<audio>`. Without script a plain control stands in (`<noscript>`). Not changed: the listening flow's "listen back" of a visitor's own recording, and the RadioLive and clip videos.
- **Story cards play their audio** (a `PlayAudioButton` above the card's stretched link). `featuredAudio` joined `CARD_FIELDS` and the other card selects (posts list, fellowship hub, "More from", related stories). A members-only story's audio comes back empty for the public, so its card shows no player.
- **On a story page the audio player sits straight under the headline block, before the featured media** (`StoryView`, and the themed episode page).
- **Broadcast schedule hero** gained its missing bottom padding.
- **`components/SectionNav` is the standard sub-navigation** (rule in `CLAUDE.md`). RadioLive's hub uses it (`lib/radiolive/nav.ts` lists only sections that render; the old bar linked to Artists, Encores and Support even when empty). **Not yet moved to it:** the Voyager's masthead nav (its own design), and the RadioLive show and artist pages, which keep a "back to RadioLive" breadcrumb. Not checked in a browser at 390 and 1440 px; do that before merging.

## Embeddings admin panel and tunable thresholds (built 2026-11-18)

Asked for by the owner so the archive can be embedded, and the thresholds set by eye, without a terminal. **Branch** `claude/awesome-thompson-lrv2xd`, no PR. Migration `20261118_154406_site_settings_embedding_tuning` (three `numeric` columns on `site_settings`, with defaults) tested up, down and up, `verify:migrations` passes.

- **Site settings -> "Related stories and search by meaning"**: three numbers (related floor 0.1 to 0.9, default 0.35; search floor 0.05 to 0.9, default 0.2; most from one show 1 to 4, default 2). `lib/embeddings/tuning.ts` clamps them and falls back to the defaults; the story page and `/search` pass them to the pure ranking functions. Saving revalidates every page.
- **The "Story embeddings" panel** (same place): "N of M published stories embedded", **Embed the next 20** / **Embed all waiting** (a loop of 20-story requests, with a stop button), and **Show examples**: five random stories with their eight nearest and whether the numbers on the form (saved or not) would show each. Endpoints under `/api/globals/site-settings/embeddings` (`GET` status, `POST .../run?after=<id>`, `GET .../examples?related=&perSeries=`), `lib/embeddings/admin.ts`.
- **Who may use it: `settings.manage`, which only the administrator role holds** (editor and publisher do not; an integration test says so). The embed endpoints spend the provider key, and Site settings already needs this permission to save. **Open question for the owner: should publishers be able to tune the numbers?** That needs the three numbers in their own global with `content.publish` access (a field cannot be editable by a role that cannot save its global), a migration moving the columns, and the embed buttons staying administrator-only.
- **Not covered:** the panel embeds stories with *no vector*. A story edited since it was embedded is re-embedded when it is saved; `backfill.ts` finds any that were not. The first-time estimate of size stays the script's dry run. Not checked in a browser (no admin login here): the panel is typechecked, linted and built but its look and its fetches have not been seen.

## Vector search and similar stories (built 2026-11-13; not yet run on real data)

**Branch:** `claude/eloquent-einstein-acfwc9` (`wuwfdevs/portal`), **no PR opened** (ask before opening one). Migration `20261113_222100_story_embeddings` tested up, down and up;
`verify:migrations` passes; typecheck and lint pass (0 errors, the same 4 old warnings); the full site suite passes (144 files, 1,582 tests). **Nothing is embedded anywhere yet.** Embedding sends story text to a paid third party,
needs a key, and needs the migrated stories; with no key the site behaves exactly as before (no calls, no new section, keyword search only).

**What was built** (`src/lib/embeddings`, `src/db/storyEmbeddings.ts`, `src/hooks/embedStory.ts`, `scripts/embeddings`):
- **One vector per published WUWF story**, in `story_embeddings` (`post_id` primary key and foreign key `on delete cascade`, `vector(1536)`, the model, a hash of the embedded text,
  an HNSW cosine index). A plain table beside Payload's, **not a collection** (no REST/GraphQL exposure; a write does not touch the story's `updated_at` or versions), declared
  through the adapter's `afterSchemaInit` so it is in the migration snapshot and `verify:migrations` covers it. The adapter's `extensions: ['vector']` and the migration create the
  extension. Model `text-embedding-3-small` (the Portal already uses it), fixed in `config.ts`.
- **What is embedded:** title, dek, description and body text (blocks skipped; cut at 24,000 characters). **Never an NPR or wire story** (`source` is not `wuwf`), never a draft, and a
  **members-only story from its title, dek and description only** (its body is not public, and a similarity index must not let the public infer it). Staleness is a hash of the text
  plus the model, so a re-save that changes nothing embedded costs no provider call.
- **Related stories** (`lib/embeddings/related.ts`, section on the story page): the story's stored vector's 30 nearest neighbours, then `pickRelated` (`rank.ts`): similarity floor, a
  small recency preference (1.0 for new work down to 0.85, never outweighing closeness), at most two from one show or series, four shown. Read when the page renders (the page is cached
  like any story); loaded through the Local API with `overrideAccess: false`, so only published stories the public may read are ever offered. No vector, or any error: no section, never a
  failed page. Not shown in previews.
  **How it looks (redesigned 2026-11-18, canvas boards 3a to 3e, "More like this"):** `components/Article/RelatedStories` draws the closest story as a lead (picture, description) and the rest as short rows. A
  story shows "Same topic / series / show" only when it really shares one with the story being read, and "From <date>" when it is over a year old; audio keeps `PlayAudioButton` (outside the stretched link). One story
  takes the full width; a lead with no picture becomes a quiet panel; none renders no section and no heading. The wording and rules are the pure, tested `lib/embeddings/present.ts`. Not built from the boards: the
  Option B "Next up" hand-off (3b), and a byline or reading time on an entry (the query does not select them).
- **Semantic search** (`lib/embeddings/search.ts`, `/search`): **off unless `OPENAI_API_KEY` is set and the Site settings switch "Find stories by meaning in search" is on** (default off; an administrator flips it in the admin, with no deploy; read through the cached global, which the Site settings save already revalidates). It supplements keyword search and never replaces it: when keywords find
  nothing, the stories nearest in meaning fill the page ("No exact matches for ... These stories are about similar topics."); when they find something, up to six more sit under the first page as
  "Stories on similar topics". The type filter applies. A provider failure or a 3-second timeout shows keyword results alone. The query is never logged or stored (held as a vector in the
  server's memory for an hour).
- **The save hook** (`embedStoryAfterChange` on Posts): embeds a story when it is published or edited, waits at most 8 seconds, **never fails or blocks a save and never removes a vector**
  (a draft saved over a published story reports `draft`; deleting would drop a live story from "Related stories"). It **writes on the save's own transaction** (`req`), because the story row is not
  visible to any other connection until the save commits (found by the first integration test run). The importer, the body repair and the shows move set `context.disableEmbedding`.
- **The migration's vectorization step: `scripts/embeddings/backfill.ts`** (`scripts/grove/IMPORT.md`, step 5). Dry run by default (needs no key, sends nothing: counts and the size of what would
  be embedded); `--apply` embeds what is missing or stale, resumable, with a `--limit` for a first small run; after a full scan it prunes vectors whose story is no longer eligible. Same database
  guard as the shows move (staging, or production only with `--production`; a hosted database only in production mode). `scripts/embeddings/inspect.ts` prints the neighbours of a sample of stories
  with their similarity and what the rules would show, to calibrate the thresholds.
- **Tests:** 34 unit tests (text, rank, provider) and 16 integration tests against a real pgvector database (`tests/int/embeddings.int.spec.ts`: the table and its cascade, staleness, the hook and what it
  must not do, similar stories, semantic search). The provider is a fake in tests; nothing was sent to OpenAI, and **the OpenAI request itself has not been run against the real API**.

**Decisions I made, for the owner to confirm or reverse** (nothing in the existing rules covered them):
1. **One vector per story, not passages.** Enough for "Related stories" and for search at this archive's size (about 6,500 stories, 20 or so a month after); a very long story is embedded from its start.
   Passage-level vectors are a later change (the table would gain a chunk index) if search quality on long stories is poor.
2. **"Related stories" is a query at render time, not a stored list.** Always current (a new story shows up under old ones as soon as the page next refreshes) and one table fewer. It costs
   one small indexed query per refresh of a cached page (not measured on the real archive yet).
3. **Semantic results supplement keyword search; no rank fusion.** The keyword search is "every word matches, newest first" with real paging, and blending a relevance list into it would break the paging
   and change results people already rely on. If search logs show semantic should lead, that is a deliberate change.
4. **Two switches.** `OPENAI_API_KEY` (an environment variable, because it is a secret) is indexing. **Site settings -> "Find stories by meaning in search"** is sending visitors' search words to OpenAI, which a key alone must not enable; it is in the admin because it is a policy decision the owner should be able to make without a deploy. (It began as an environment variable, `SEMANTIC_SEARCH=on`; that was changed the same day, migration `20261113_225238_site_settings_semantic_search`.)
5. **Only stories** (`posts`). Not shows, clips, pages or events; not the manual `relatedPosts` field (it exists in the starter and nothing renders it).

**Calibrate before trusting** (`rank.ts`): `MIN_RELATED_SIMILARITY` 0.35, `MIN_SEARCH_SIMILARITY` 0.2 and `MAX_PER_SERIES` 2 are starting values, **not measurements** (nothing is embedded). After the first
backfill run `scripts/embeddings/inspect.ts`, read the neighbours of 15 to 40 stories, and set the floors by eye. Also read old-story pairings for sensitivity (an old crime story offered beside a new one).

**Needs the owner:**
- **Go-ahead to send WUWF story text to OpenAI, and the key.** A paid call: the dry run gives the count and size first; the cost at OpenAI's published rate for this model is small (an estimate from the
  story count: well under a dollar for the archive; **check the current price**). Set `OPENAI_API_KEY` on the site's Vercel project (server only).
- ~~**The licence question already open for the LLM pass** (News Service of Florida and AP text sent to a third-party service)~~ **Settled by the owner, 2026-11-18.**
- **Approval to send visitors' search words to OpenAI** (turn on Site settings -> "Find stories by meaning in search"). **Privacy wording written (2026-11-18):** `lib/embeddings/notice.ts` holds `PRIVACY_PAGE_PARAGRAPHS` for the privacy page. A one-line notice on `/search` was built and then removed (owner, 2026-11-18: nothing identifying the visitor is sent). **The paragraphs still have to be pasted onto the site's privacy page in the admin** (a Page; not done from code), and the switch stays off until they are there. The AP and News Service of Florida licence question is closed (owner, 2026-11-18). The search cache is now keyed by a hash of the words, not the words.
- ~~**Enable the `vector` extension**~~ **Done (2026-11-13).** Staging: the migration created it (`CREATE EXTENSION IF NOT EXISTS vector`, schema `public`) when the preview build of this branch ran `payload migrate`
  on the shared staging database (`MIGRATE_ON_BUILD=1`), so the `payload_app` role can create it. Production: enabled by hand in the same schema (`public`, to match staging), version 0.8.2.
  **Production's database is empty (checked 2026-11-13): no tables and no `payload_migrations` ledger, so the site has never been set up there.** The embeddings migrations cannot be applied alone (they need `posts`); they go with the rest when production is first migrated (`pnpm payload migrate` with the production `DATABASE_URL`, deliberately, at the importer's step 3: `IMPORT.md`). Nothing was applied to production except the `vector` extension. Staging has `story_embeddings` and
  the migration recorded (batch 31); the Site settings column migration (`20261113_225238`) was applied to staging by the preview build of this branch (confirmed in `payload_migrations`, 2026-11-13).
- **A "do not recommend" flag?** An editor may not want an old, sensitive story offered beside new reporting. Not built (it is a field on Posts plus a migration); say if you want it before launch.
- Whether **NPR and wire stories** should ever be embedded (they are not today); it depends on NPR's CDS terms (`ARCHITECTURE.md`, CDS sync).

**Not built:** rate-limiting the search page (each uncached query is one embedding of about ten tokens, a negligible cost, but a bot could still make calls: add a limit if the key's usage ever shows it);
a scheduled sweep (the backfill is run by hand; a failed save-time embed is logged and caught by the next run); ~~an admin screen for embeddings~~ (built 2026-11-18, below); the "reviewed LLM pass" for alt text and topics (a separate item below).

**Where it sits in the migration:** import, repair bodies, move shows (`IMPORT.md` steps 3 and 4), **then embed (step 5)**, then the post-import check. The site can go live without step 5 (keyword search and
every page work), so it does not block the cutover, but **the migration is not complete until `backfill.ts` reports "vectors stored" equal to "eligible" and a second run embeds nothing**; the cutover
checklist includes it.

## Resume here (2026-11-07: boards 27 and 26 built)

**Branch:** `claude/charming-gauss-p7xx51` (`wuwfdevs/portal`), pushed, **no PR opened** (ask before opening one). Full suite
**127 files, 1,447 tests pass**; typecheck, lint (0 errors, the 4 old warnings) and the production build pass; `verify:migrations`
passes; migrations `20261107_043501_board27_header_search_public_file` and `20261107_055404_listen_live` tested up, down and up.

**Board 27 and 27b, menus, search and footer: built 2026-11-07.**
- *Header: everything after the logo is configured in the admin (Header global), nothing is fixed in code.* **Header
  items** (up to 10, any order, drag to reorder) are each a **link** or a **menu**. A menu has a label, a panel heading, one
  sentence and up to 20 links, and opens a panel under the header. It is a real button with `aria-expanded`; Escape closes it and
  returns focus to its button; a click outside or a navigation closes it (`components/SiteNav/MenuBar.tsx`). **Changed 2026-11-20 (owner, after
  reviewing it on a phone):** below `lg` the row no longer scrolls sideways (items past the edge were invisible and a menu opening
  inside a scroller was awkward); a **Menu** button opens a full-height sheet instead (`components/SiteNav/MobileMenu.tsx`: a link is a row, a
  menu is an accordion row, a menu's heading and blurb are desktop-only; Search is a field at its top and Sign in a row at its foot), the phone header is one row (Menu, logo, Donate) and `MenuBar` is desktop only. **Listen live on a phone is the player bar** (`PlayerBar`, below `lg`): it is there from the first page view whenever the station has a stream (before that it appeared only after a first play), its switcher button opens `ListenSheet` (every stream with its own play button, what is on now and next, the schedule link), and the header's Live button is desktop only. Before play it makes no now-playing request, so it shows the stream's name, not the program's. This overrides board 27b's phone
  row. `SectionNav` keeps its sideways strip but fades the edge with more beyond it. (Before that, on a phone the row
  scrolled sideways under the logo, as on board 27b, replacing an older phone menu, also called `MobileMenu.tsx`, removed.) The
  items are the old `navItems` list, extended, so links already entered stay as items of kind "link". **Buttons on the right:**
  Search, Sign in and Donate can each be hidden or relabelled, and Donate's address set (a site path or an https address; anything
  else falls back to `/support`). Sign in shows only while audience sign-in is configured. The optional second row
  (`sections`) is unchanged. A menu with no label or no links cannot be saved. Pure rules: `lib/nav/header.ts` (7 tests);
  `tests/int/header.int.spec.ts` (3). Listen live joined them with board 26 (below).
- *Search* (`/search?q=…&type=stories|shows|video&page=…`): a page, not a popup, built to the board. It is a plain GET form (it
  works without JavaScript). Every word must match the title or the description. Results show their kind and date, with a
  count line, a "nothing matched" state, paging, and a message if search fails. Results pages are `noindex`. The search index now
  covers **stories, episodes, shows, syndicated programs and short video** (`posts`, `productions`, `clips`), each indexed with a
  `kind` and `publishedAt` (`search/beforeSync.ts`; pure rules in `lib/search/query.ts`). Drafts are never indexed. The
  migration backfills the kind and date of stories already in the index. **After deploying, press Reindex on the Search
  collection in the admin once**, so existing shows and clips enter the index (or they enter on their next save). 12 unit and 3
  integration tests (`tests/int/search.int.spec.ts`).
- *Footer.* A new **FCC public file** group: the address (only `https://publicfiles.fcc.gov/...` is accepted), its label
  (default "FCC Public File") and the **accessibility contact**. The link shows on every page, and is a field of its own so
  reordering the legal row cannot drop it. Research (2026-11-07, from secondary sources; the eCFR text could not be read from
  the sandbox): WUWF is noncommercial, so **47 CFR 73.3527** applies. It requires the link from the home page. No link wording
  is required. A contact for people with disabilities who need help with the file must be on the website. A separate rule,
  **47 CFR 73.2080(c)(6)**, requires the current EEO public file report on the website if the employment unit has 5 or more
  full-time staff: link it from the legal row. An amendment to these rules is listed as pending, so have counsel confirm.
- Checked in a browser at 1440 and 390 px (menu opens, Escape returns focus, no overflow, FCC link shows).
- **Not built:** the board's "Ask WUWF" and "Schedule" boxes beside results (listening is deferred, and the schedule arrives with
  board 26); the About and footer text pages (Staff, Ethics and corrections, Contact, Privacy, Accessibility, Terms) are ordinary
  `pages` for editors to write.
- **Starting menus** (migration `20261107_070000_header_starting_menus`, data only): the board's five menus, News, Shows, Watch,
  Community, About, added only where the header has no items yet, with links only to pages that exist (fixed pages by address; a
  section at `/<slug>` or a fellowship at `/fellowships/<slug>` only where that record exists). `down` removes only these
  (`start-` ids). Not yet linked because the pages do not exist: Staff, Contact, Ethics, Privacy, the FCC file (footer), Weather.
- **To go live (owner/editors):** review the starting menus and the buttons in Header; set the public file address (check whether the FCC lists the
  station as `WUWF` or `WUWF-FM` at `publicfiles.fcc.gov/fm-profile/...`) and the accessibility contact; add the EEO report to the
  legal row if it applies; press Reindex.

**Fix, 2026-11-07: story text pale and links invisible on phones in dark mode** (reported by the owner from the staging
preview on an iPhone). There is no dark theme, but Tailwind's `dark:` variant followed the system setting, and the starter's
`dark:prose-invert` on story bodies turned text pale grey and links (inline and the link-line block) white on the white page. The
variant is now tied to a class nothing sets, `color-scheme: light` is set, every `prose-invert` is removed, and
`lib/no-system-dark-mode.test.ts` fails if either comes back. Checked on an emulated iPhone in dark mode. It reaches staging when this
branch is deployed.

**Header revisions, 2026-11-13 (owner's review of the staging site; not yet checked in a browser, the sandbox has no database).**
- *Search* opens a field in the header (`components/SiteNav/HeaderSearch.tsx`); Enter goes to `/search?q=`. The icon is still a real link to `/search`, so it works without JavaScript.
- *Listen live* starts the stream from the header button (`components/ListenLive/HeaderListen.tsx`), with an arrow panel for channels, on now/up next, volume and a link to the schedule. The bottom bar stays once started, so the controls are in reach after the header scrolls away.
- *`/listen` is now `/schedule`* ("Broadcast schedule": the week's programs, channel and day buttons, other ways to listen). `/listen` is gone with no redirect (the site was not live); `/listen/now` (the on-now answer) is unchanged. `ListenPanel` is removed. A page an editor makes at `/schedule` would be shadowed by this route. The seeded Shows-menu link moves to `/schedule` with migration `20261113_220000_header_schedule_link` (data only; not yet run against a database). The schedule's channel buttons stay visible for a stream with no Cadence ID.
- *Authors* in the byline and the author box link to `/people/<slug>`, in standard and themed stories.
- *Featured images:* the opening picture now ignores the block's alignment option and fills its container; the story and live-blog wrappers no longer cap it at 52rem. Themed episodes still use the show's own column.

**Board 26, Listen live: built 2026-11-07** (the design and the research behind it follow this paragraph).
- *Settings, not code:* a **Listen live** global (Site settings): channels (name, short name for the bar, the stream's https
  address, the NPR Cadence channel ID, one line) and the "Other ways to listen" cards. Migration `20261107_055404_listen_live`
  (up, down and up tested) **seeds WUWF's three streams and their Cadence IDs** as read from wuwf.org and Cadence (below), and two
  cards (on the radio; podcasts). With no channels, the player, the header's Listen live button and `/listen` are all hidden.
- *The player:* one `<audio>` in the site layout (`components/ListenLive/PlayerProvider.tsx`), so it keeps playing between pages;
  nothing loads before the reader presses play (`preload="none"`, no autoplay); pause drops the connection and play reconnects, so
  the listener hears the station now, not a stale buffer; lock-screen controls through the Media Session API; state in words
  ("Connecting…", "Playing", "The stream stopped. Press play to try again.") in a polite live region. **The bar**
  (`PlayerBar.tsx`) shows at the bottom of every page once started (not on `/listen`), with a spacer so it never covers the
  footer or a form, and a close button that stops the stream.
- *`/listen`* (`app/(frontend)/listen/page.tsx`), to the board: channel buttons, the large play button, on now with its time and a
  link to the program, up next, volume, the three side boxes, Other ways to listen. On now is rendered on the server first.
- *On now / up next:* `/listen/now?channel=<Cadence ID>` answers **only for a configured channel** (never a general Cadence proxy),
  from `lib/live/cadence.ts`: a server read of Cadence, cached 60 s, 4 s timeout, **last good answer kept** if Cadence fails, else
  nothing. Pure rules in `lib/live/schedule.ts`: a program is never shown after its end; a started "up next" moves up; "up next" is
  left out when the same program continues (HD2's all-day Classical 24); times in Central, AP style. The browser re-asks when the
  current program ends and every 5 minutes while visible. **Fixed after review on PR 339:** the refresh timer plans from the latest
  answer (it had planned from the answer captured at mount, so the bar refreshed only on the 5-minute poll and an ended program
  could stay "On now" that long), the shown time moves on at each program boundary without a request, and each answer belongs to
  its channel (a switch had kept the previous channel's program while the new fetch failed). `useNowNext.test.ts` (3) fails on the
  old hook.
- *Header:* a **Listen live** button (red dot, like the board) among the right-hand buttons: shown or hidden and relabelled in Header
  like the others, and only while there is a channel.
- Tests: `lib/live/schedule.test.ts` (11), `cadence.test.ts` (3), `tests/int/listen-live.int.spec.ts` (5), header tests updated.
  Checked in a browser at 1440 px and on an emulated iPhone: the real 88.1 stream plays, keeps playing after moving to another page,
  the bar shows the program (Echoes), close stops it, no overflow. With Cadence unreachable the page and bar show the channel name
  and nothing invented.
- *The week's schedule* (built later the same day; `components/ListenLive/WeekSchedule.tsx`), to the board: Monday to Sunday in
  Central time, a button per day (today selected, labelled "Today"), the programs in order with their descriptions and links, and
  "On now" on the one airing (rechecked every minute). It follows the player's channel. Data: Cadence's weekly widget POSTs
  `{"channelId","startDate","endDate","from","size"}` to `https://cadence.nprstations.org/api/cadence/widget/` (no key; read
  2026-11-07: 95 programs that week on 88.1, no overlaps, one-minute gaps after Echoes; one block a day on HD2 and HD3).
  `lib/live/cadence.ts` `fetchWeek` (4 s timeout, last good week kept) and `cachedWeek` (15 minutes; a failed read is never
  cached); `parseCadenceWeek` sorts and, if two programs overlap, keeps Cadence's higher `priority`; station-date helpers
  (`stationWeek`, `programsOn`) work in Central time, so 11:30 p.m. Friday is still Friday. If Cadence is down and nothing was
  read before: "The schedule is not available right now. The stream above still plays." 4 more unit tests in `schedule.test.ts`,
  3 in `cadence.test.ts`; checked in a browser at 1440 px and on an emulated iPhone with the real week.
- **Not built:** the pop-out player, a "Listen live" slot on the home page, next week's schedule (the page shows this week), and
  song titles (none exist; see below).
- **Before go-live:** ask NPR whether a station may read Cadence's widget data from its own server (it is undocumented; if not,
  `/listen` falls back to the channel names, or embed Cadence's own "now" widget). Check the HD3 name and description with the
  station (Grove says "WUWF HD3", the stream "Gatewave", the schedule page "Sightline").
- **Sandbox lesson:** Node's own `fetch` ignores the sandbox's HTTPS proxy, so a server-side read of any outside host fails with
  "fetch failed" when testing here. Start the server with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. Not
  needed on Vercel.

**Board 26, the design, revised from research (2026-11-07).** The canvas note took "now playing" from the
program log; the owner doubted it and guessed the stream. The research (vendor docs, trade press and other stations' APIs; some
StreamGuys pages could not be read from the sandbox) supports neither alone:
- **"On now" and "Up next" (the program) come from the schedule, not the stream.** The stream cannot know what is next, and during talk
  and NPR programs its title is often a station ID or stale. Public stations drive "On now" from a schedule database. WUWF's Grove site
  very likely uses **NPR Composer** for its schedule. Composer has an undocumented widget API that returns a week per station
  (sources disagree on whether it needs a key). **Read it on the server, one channel at a time (88.1, HD2, HD3), cache it for a few minutes,
  and keep the last good copy.** If it fails, work out "on now" from the cached week, or hide the line. Never show a program after its
  scheduled end.
- **"Now playing" (a song) only when there is fresh song data**, in this order: a playlist log, if hosts log songs (Composer "On
  Now", or Spinitron); otherwise the stream's own title, read **on the server** (StreamGuys SGmetadata, a paid API with a key and a
  scraper per stream; or Icecast `status-json.xsl`, deprecated and sometimes turned off). Show a song only during a music program, only
  when the data changed recently (about 10 minutes), and never a station-ID string. Otherwise show the program. Nothing for NPR's
  news magazines unless PRSS MetaPub is wired in.
- **Never read metadata in the browser:** in-band ICY metadata needs CORS headers most servers do not send and at least 16 KB of
  audio before the first title; one server fetch serves every listener and keeps any vendor key private.
- **The player** stays as the board has it: a player in front of StreamGuys stream URLs, one per channel, in the site layout so it
  keeps playing between pages, with a bar at the bottom once started.
- **Found on wuwf.org and the stream server (2026-11-07).** robots.txt allows everything; requests spaced 3 s apart with a
  neutral User-Agent. Grove's persistent player (`persistentPlayer.streams`, every page) lists three streams, all plain MP3
  served by StreamGuys' **AIS Streaming Server 9.1.4**:

  | Channel (Grove name) | Stream | Bitrate | `icy-genre` |
  |---|---|---|---|
  | WUWF – News and Information (88.1) | `https://wuwf.streamguys1.com/WUWFFM.mp3` | 64 kbps | News |
  | WUWF HD2 – Classical | `https://wuwf.streamguys1.com/WUWFHD2.mp3` | 96 kbps | Classical |
  | WUWF HD3 ("Gatewave", a radio reading service; its schedule page says "Sightline") | `https://wuwf.streamguys1.com/WUWFHD3.mp3` | 64 kbps | Reader |

  Grove labels two of them `audio/mp4`; the server sends `audio/mpeg`. Each stream answers with
  `Access-Control-Allow-Origin: *` and offers in-stream ICY metadata (`icy-metaint: 1024`), but does **not** expose
  `icy-metaint` to scripts (no `Access-Control-Expose-Headers`), so a browser cannot read titles even if they were sent.
  **No titles are sent:** 20 s of 88.1 and HD2 (Fri. 11:24 p.m. Central) carried 553 empty metadata slots and no title, on
  the music channel too. So the stream cannot supply "now playing" today; the automation would have to start sending
  titles (a question for the engineer). Grove's player carries an empty `schedule` for every channel.
- **The schedule is NPR Cadence** (NPR's replacement for Composer). wuwf.org's schedule pages (`/schedule-for-wuwf`, and
  weekly and daily pages for HD2 and HD3) embed `cadence.nprstations.org/widgets/iframe/daily|weekly?channelId=...`. The
  88.1 channel is `eed45825-935f-4185-8b47-059fcc96a6a6`, the same ID as the 88.1 stream's `channelId` in Grove's player;
  HD2 is `ad7c1f78-645e-4cf2-8b38-88f8519b7464`, HD3 `75d8ec9d-cfc5-45b8-aec9-5bdeb6cd1fd4`. Cadence also serves a
  "now" widget (`/widgets/iframe/now?channelId=...`: the current program and what is next). **No public Cadence API is
  documented**; the next step is to read the "now" widget's own data request (needs `cadence.nprstations.org` allowed in
  the session's network), then ask NPR whether a station may use it server-side. Until then, "On now" can be the Cadence
  "now" widget itself, or nothing; never a guess.
- The session's cloud environment for this repository is **`wuwf-portal`** (personal): the Default plus `www.wuwf.org`,
  `wuwf.org`, `wuwf.streamguys1.com` and `cadence.nprstations.org`.
- **Cadence's data, read 2026-11-07** (with that host allowed): its "now" widget reads
  `https://cadence.nprstations.org/api/cadence/widget/<channelId>` (no key; JSON; `cache-control: public, max-age=15`; **no CORS
  header**, so only a server can read it). It returns `onNow`, `upNext` and `upcoming`, each with the program's name, its start and
  end in UTC and Central, and a program link. **No song data on any channel**, even with `?show_song=true`. HD2 is one all-day
  "Classical 24" block; HD3 a placeholder named "HD 3". The address is undocumented: ask NPR (above).
- **Questions still open.** For StreamGuys: whether SGmetadata (or another metadata service) is on the contract, and whether
  an HLS or AAC version of each stream exists. For the engineer: whether the automation system can send titles into the
  streams, and what it would send during talk; whether MetaPub is used; whether Cadence holds every channel's schedule and logs
  songs on HD2; whether any NPR program airs on delay. For NPR: whether a station may read Cadence's schedule data from its own
  server. Answered: the stream addresses, formats and headers (above).

### Earlier: end of the 2026-11-06 session (homepage slots added later the same day)

**Phase 7a, Barefoot Mary on wuwf.org (built 2026-11-06, branch `claude/sharp-fermi-fmy9un`, pushed, no PR opened).** The design, the owner's
decisions and what is left are under *Phase 7* below. In short: members-only stories and audio (public reads never get the body or the audio),
per-show themes in code, and a themed show's home, episode page, Field Notes, Archive and support page; then seasons, and **7b, audience
sign-in (built; needs the Supabase settings under *Phase 7*)**, then **7c, members' listening** (memberships granted by hand, the claim link, unlocking members' work). then **7d, private member feeds**. **Next for phase 7:** 7e, the membership database sync (needs the system's name and how it exports), and the per-show podcast feed settings. **Full suite 118 files, 1,381 tests pass**; typecheck, lint (0 errors, the 4 old warnings) and the production build pass; `verify:migrations` passes.

**Branch:** `claude/whats-next-oxili3` (`wuwfdevs/portal`), pushed, **no PR opened** (ask before opening one). The earlier session branch (`claude/eloquent-cori-1mgpm8`) was merged (PRs 335 and 336). Full suite **104 files, 1,271 tests pass**; typecheck, lint (0 errors) and the production build pass; `verify:migrations` passes.

**Homepage slots (roadmap item 9): built 2026-11-06.** Four slots below the news, in board 1's order: **short videos** (after the fellowship feature), then the local list, **podcasts**, then **Unearthing Florida and RadioLive** side by side, then the membership band. Each has its own tab in the Home page settings, is on by default, and is **left out when switched off or when it has nothing to show**; a slot whose loading fails is left out and logged, so the news never goes down with a feature (`lib/homepage/load-slots.ts`; pure choices in `lib/homepage/slots.ts`; view in `components/Homepage/Slots.tsx`). *Short videos:* the newest published clips (3 to 10, default 6), or a chosen series first, topped up with the newest. *Podcasts:* one listed original show with its newest episode, playable in place, and its running funder line ("Support for this program"), plus three more shows; the editor may pin the show, else the one with the newest episode. *Unearthing Florida:* the editor's pick (ignored unless it belongs to the hub's series), else the hub's featured episode, else the newest; hidden while the hub has no production. *RadioLive:* the newest recorded set (links to its show page) and the next show with its ticket button or ticket status; **no funder line**, as on the show pages (the stopgap). Saving a clip, a RadioLive show, or the RadioLive or Unearthing page settings now refreshes the home page. The funder panel takes a `headingId` so the page can show two. Migration `20261106_212555_homepage_slots` (up, down and up tested). 15 unit and 6 integration tests; checked in a browser at 1440 and 390 px with demo content (no overflow, no duplicate ids). **Still left out (nothing stands behind them):** the live player and "on now", WUWF Listens, newsletters, "From NPR", sponsor placements, "Follow the show" and "Get tickets alert".

**Show consolidation to `/shows/<slug>`: built 2026-11-06 (the tool; it runs after the import).** `scripts/shows/consolidate.ts` moves every show at Grove's `/show/<slug>` or `/podcast/<slug>` to `/shows/<slug>`, and each episode under it to `/shows/<slug>/<date>/<episode>`; the address hooks write one permanent redirect per old address and repoint older redirects, so there are no chains (about 580 addresses expected). Dry run by default; `--only` one show; staging, or production only with `--production` (`checkSiteDatabase`, an allow-list of the two projects); episodes move before their show, so a stopped run is finished by running it again; it skips and lists two shows that would share an address, an address another record has, and an episode not under its show's address. Also new: **a show's address change now writes a redirect** (it did not: only stories and pages did), and **a new episode of a show already at `/shows/...` gets its address under the show** (otherwise, and for non-audio companion stories, the ordinary story address). Feeds stay at `/podcast/<slug>/rss.xml` (found by the show's name). Pure plan `lib/shows/consolidate.ts` (8 tests), guard tests, 7 integration tests (`tests/int/show-consolidation.int.spec.ts`); checked in the app (old address 308 to the new, the feed still 200). Runbook: `scripts/grove/IMPORT.md` step 4. `CLAUDE.md`'s "migrated shows keep `/show/<slug>`" is updated to the owner's 2026-11-04 decision. **To do on the owner's computer:** after the staging import, the dry run, one show, then all; then the same on production.

**Next, in order:**
1. **The staging import**, then the show move above (runs on the owner's computer; the cloud sandbox cannot reach hosted Postgres).
2. **RadioLive:** the artist and show **backfill** from Grove's old page (a converter, plus an owner-approved photo fetch); calendar merge (list shows in the community calendar from `performances`, never copy them into `events`) and `Event` structured data; check migrated Grove events for RadioLive duplicates first.
3. **Sponsorship**: the business-facing pages (boards 16 to 20b) are built (see *Sponsorship pages*); the delivery design (placements, entitlements, proof of performance) is open and **not a site-only job**: see below. Do not extend the site's `underwriting-agreements` schema or build booking or placement logic in Payload.

**Waiting on the owner:** the wording of the funder panel's independence sentence for programs ("...what WUWF airs"; it now also shows on the home page's podcast feature); whether Encores (`/show/radiolive-encores`) is a separate program; entering the RadioLive page content (RadioLive 25 text and the staff contact, the plan-your-visit facts, the real artist spellings: Pat Byrne, Julie Patchouli); a **Video and RadioLive link in the site header** (a global, edited in the admin); and the sponsorship product list (below).

**Sponsorship direction (a recommendation, not decided; the owner says an existing design may cover it and it was not found in the repository: ask for the project brief or the design doc before building).** The Portal holds the deal (contract, sponsor, typed lines, approved wording, proof of performance); broadcast and digital sponsorship are two line families on one contract, each line anchored either to **a span of time** or to **a specific thing** (a performance sponsor stays on that night's record for good); the site is the delivery surface and defines **placements** as a typed registry in code, with an immutable reference key on each sellable thing; entitlements reach the site as a signed, versioned **snapshot pulled after a signed notice, cached with a last-known-good copy** (never a per-request call; the site must stay usable if sponsorship serving is down); the site's own agreements collection is the interim manual source behind the same resolver. **Stopgap in force:** a RadioLive show page carries no funder line, only `/radiolive` does. The resolver's header still cites a canvas board; point it at a repo document once one exists.

**Working in the cloud sandbox, new this session:** the local Postgres stops when the sandbox idles (run `bash scripts/dev/pg-up.sh`; see *Running things in a fresh sandbox*); scripts that use Payload need `.env.local` sourced (`set -a; . ./.env.local; set +a`) and run from inside `apps/site`; integration tests that upload files need `// @vitest-environment node`; run route handlers in tests with `next/cache`'s `unstable_cache` mocked; `.env.local` and demo data are local only (gitignored).

### Earlier hand-off (end of the 2026-11-04 session: the migration gaps assessment)

**Branch:** `claude/eloquent-cori-1mgpm8` (`wuwfdevs/portal`). The earlier branch (`claude/practical-brahmagupta-v01n90`, the migration gaps assessment) **was merged into `claude/main`**; this one carries the sitemap index, podcast feeds and the 410 fallback below, and has no PR yet.

**What this session did** (the details are under *URL inventory and disposition*, near the top of *Grove migration*): re-read all 276 sitemaps (200,964 URLs) and probed
the pages outside the census; found **1,433 more WUWF stories** (`news` 252, `music-arts` 57, nine small sections 116, `florida-news` 1,008) and 36 podcast episodes, so about
6,500 stories to migrate; the converter handles all of them. Built: podcast converter, **episode text fix** (episodes read the wrong field and saved empty), link map and
`linkMap` (wire and old `/post/` links repointed or removed), **syndicated programs** (`kind` on productions, migration `20261104_182013`), episode-body repair, **real page
metadata** (the starter's "Payload Website Template" title is gone; `NewsArticle` data), and the owner decisions recorded below.

**Next, in order** (the first four are code; each is described where noted):
1. **Podcast feeds: built 2026-11-06.** `/podcast/<slug>/rss.xml` (route `app/(frontend)/podcast/[slug]/rss.xml`, pure XML in `lib/shows/feed.ts`) serves any *original* production's published audio episodes, newest first, guid = `legacy.groveId` (a new episode gets `wuwf-episode-<id>`), cached 10 minutes at the CDN. **Gaps:** no iTunes `category` (Productions has no field for it; Apple wants one: add a field with a migration, or copy it from Grove's feed, which was read once but not kept); `explicit` is always `false`; the enclosure address is our storage, so the feed is only useful after the audio copy; EcoMinutes WAV question still open. Check the real feed in Apple Podcasts Connect/Overcast once staging has the audio.
2. **Cutover plumbing:** the **410 fallback is built (2026-11-06)**: `src/proxy.ts` (a page cannot set a status) asks `/api/gone-check` whether a story, page, show or editor redirect owns a bare `/YYYY-MM-DD/slug` (or `/show/14-59`) and answers 410 with a plain page only when nothing does; any failure of the check lets the request through to the normal route, never a 410. Checked on a production build (410 for a bare address and `/show/14-59`, 404 for a section path) and in `tests/int/feeds-sitemaps-gone.int.spec.ts`. **Still to do:** the show
   consolidation to `/shows/<slug>` (**the tool is built, 2026-11-06**: run it after the import, see *Resume here*); a **sitemap index** (**built 2026-11-06**: `/sitemap.xml` lists `/sitemaps/posts-<n>.xml` (2,000 stories each, cut by id, so the file count follows the story count), `pages.xml`, `lists.xml` (sections, topics, people: page 1 only) and `shows.xml`; `lib/seo/sitemap-plan.ts` is pure and tested, `sitemap-data.ts` does the reads; `robots.txt` is now `app/robots.ts` and the `next-sitemap` postbuild is gone. **Not run against a database yet; check `/sitemap.xml` on the staging preview.** Not in it yet: events, live blogs beyond their story record, and the wire/NPR exclusion, which waits on the owner's address-shape decision); (`/show/14-59` is covered above.)
3. **Importer to staging** with `--link-map census/url-inventory/link-map.json`, then the rehearsal steps below; and mark the 35 syndicated programs (the importer does it).
4. **The reviewed LLM pass** for alt text (63% of 5,455 images have none), short or missing descriptions (5%) and topic suggestions (35% have none): **suggest-only**, a staff
   review queue, checks against the story's own text, a 100-story hand check first. **Needs the owner's go-ahead and an API key.** Not started.
   *Design as proposed to the owner (2026-11-04):* a one-off script, not a runtime feature (the site must not depend on an AI service being up). Output goes to a
   **staff-only review queue** with provenance (model, date, prompt version); the site uses only approved values and the Grove original is kept for rollback. **Descriptions:**
   built only from the story's own text, 70 to 160 characters; every name, number, date and quotation in the output must appear in the source or it is dropped, then a
   second faithfulness check against the source; a wire story may only have its headline, teaser or description changed. **Alt text:** describe what is visible, never name a person
   from a face (only from a caption, credit or the body), flag low confidence, skip decorative images; review with the picture beside the suggestion. **Topics:** choose only from the
   existing 905 tags (a closed list, at most three), never invent one. **Before bulk:** hand-check about 100 stories and proceed only if the substantive error rate is low, then sample
   each batch. Confirm first that sending News Service of Florida and AP text to a third-party service is allowed by those licences.
5. **Short video (boards 7, 8): built 2026-11-06.** New collection `clips` ("Short videos", migration `20261106_150459_clips`, up, down and up tested, `verify:migrations` passes): a file from the `video` library, **WebVTT captions kept as text and required to publish** (validated; served at `/video/<slug>/captions.vtt`), a `series` (the board's rows: "After Isaias", "RadioLive moments"), an optional `story` with its own button label, contributors (else the file's credit), drafts. Pages: `/video` (newest clip, Up next, a row per series, then "More video" for clips with no series) and `/video/<slug>` (`first segment video` is now reserved). Native player, captions on by default, nothing loads before play, no autoplay. The series' running funder line shows with the clip (`getSeriesHubAcknowledgments`). In `video.xml` of the sitemap. 18 unit and 5 integration tests; checked in a browser at 1440 and 390 px (no overflow, captions track showing). **Not built, on purpose:** Share and Save (no service behind either), "audio description available" (no recordings exist), the board's swipe viewer (the phone gets the same page with a "Next video" button), and a Video link in the header (the header is a global: add it in the admin). **To go live:** create the series, upload vertical clips with posters, write captions.
6. **RadioLive (board 12): built 2026-11-06.** Two collections and a global (migration `20261106_154058_radiolive`, up, down and up tested, `verify:migrations` passes): `artists` (name, photo, short bio, own link), `performances` ("RadioLive shows": title, start time in Central, venue, lineup of artists, photo, ticket status and the **ticketing site's address** (WUWF sells nothing), and after the night the recorded `video` with **captions required**, drafts), and the **RadioLive page** global (the production, whose agreements give the funder line; hero photo; host; Encores; the support call, whose link is validated like the giving page's). Pages: `/radiolive` (next show with its ticket button, latest recorded set, upcoming list, past sets to watch, artists, host and Encores, support, funders), `/radiolive/<slug>` (lineup, tickets or the recording), `/radiolive/artists/<slug>` and `/radiolive/<slug>/captions.vtt`; `radiolive.xml` in the sitemap; `radiolive` is a reserved path and no show may take the slug `artists`. A show stays "upcoming" for its whole Central day. Artists appear on the page only after a show they played is over. 8 unit and 6 integration tests; checked in a browser at 1440 and 390 px (no overflow). **Left out on purpose (nothing stands behind them):** "tell me when tickets go on sale", the Lineup email signup, the board's giving levels (its extras are marked "proposed"; a gift is made on the donation form), "Every artist, A-Z" and a page for the story of RadioLive (the host block takes a link). **To go live:** create the RadioLive production, then artists and shows, and fill the RadioLive page settings.
   **RadioLive follow-up (2026-11-06).** *Stopgap (2026-11-06, owner approved):* **a show page carries no funder line; only `/radiolive` shows the production's running funders**, so a recording is never credited to a sponsor who did not fund that night (and a sponsor whose term ended is not dropped from archives); revisit when the sponsorship design says which sponsor is tied to which night. *Fixed:* a past show with no recording no longer offers tickets (it says the recording is not posted yet), and the funder panel says "Support for this program" on RadioLive pages (`subject="program"`; **its independence sentence now reads "...what WUWF airs": owner to confirm the wording**). *Migration decisions (owner):* Grove's `/radiolive` page is **replaced, not imported** (the path is reserved; `standalone-dispositions.csv` says `proposed:replace`); `/celebrating-35-years-of-radiolive` imports as an ordinary page and is the target for the host block's "story of RadioLive" link (set it in the RadioLive page settings once it exists); `/show/radiolive-encores` imports as its own small original show with `listed: false`, and the Encores button should point at it (owner to confirm it is a separate program); the three `/post/radiolive-*` addresses that were 404 on Grove (`schedule`, `archive-1`, `audio-archive`) now map to `/radiolive` in the link map and its cache (**they were dead links on Grove, not redirects, so no inbound redirects are added**); `/post/radiolive-videos` still maps to its story. *Reading of the old page (one page, owner-approved, robots.txt allowed it, raw JSON kept outside the repository), what it says that the new build lacks:* (1) a show can have **two ticket links**, in person (radiolive.org) and **virtual** (a ticketing-service page): **done 2026-11-06**, `virtualTicketsUrl` (a second button on the page, the list and the show page); (2) recordings are on **YouTube** (a RadioLive playlist): **done 2026-11-06**, `recordingUrl` accepts one YouTube or Vimeo video (not a playlist) and shows it through the site's embed rules (privacy-enhanced YouTube address, sandboxed frame, nothing of ours runs in it); an uploaded file still wins if both are given. **The site cannot check that a YouTube video has captions, so only an uploaded file is labelled "with captions"**; the admin field tells editors to turn captions on there (migration `20261106_174248_radiolive_virtual_and_hosted_recording`, up, down and up tested); (3) **RadioLive 25**, a $1,000-a-year membership (two lanyards for the year, event invitations, artist updates) handled by a named staff contact: **done 2026-11-06**, a *Membership level* group on the RadioLive page settings (heading, text, contact name, email, phone, optional link; hidden when the heading is empty; email and phone are checked on save and again on render, and shown only as links that passed). **The wording and the staff contact are entered in the admin, not in code**: the old page (public) names a staff member with an email and phone, and the owner chose to publish them; prefer a role address if one exists; (4) "plan your visit" facts (first Thursday, show at 6 p.m., soundcheck from 4 p.m. for 30-45 minutes, first-come seating after soundcheck, tickets $10, email confirmation, check in under your name, Museum of Commerce, 201 Zaragoza St.): **done 2026-11-06**, a *Plan your visit* panel (label and text rows) beside the upcoming list, hidden when empty; **the facts are for an editor to enter** (migration `20261106_175346_radiolive_visit_and_membership`, up, down and up tested); (5) the design canvas misspells two artists (**Pat Byrne**, **Julie Patchouli**; the old page and their own sites use these): use the real spellings; (6) the old page lists the coming schedule (Dec. 3, 2026; Jan. 7, 2027) and about 25 past shows from Oct. 2024 with lineups and each artist's own site: a **backfill source for artists and performances** (a converter plus an owner-approved fetch of the photos); (7) the page carries four partner promos (image plus link): **existing digital placements, for the sponsorship product list**, and not content to import.
7. Then the earlier build program: Barefoot Mary and member feeds (7: **7a built 2026-11-06**, see *Phase 7*; 7b to 7e next). Filling the homepage slots (9) is **done** (see *Resume here*).

**The cutover pipeline: what is needed and what was dropped (agreed with the owner, 2026-11-04).** The test for what to build is the *silent* failures: a loud one (a held story, an
exception, a 404) shows up in rehearsal; the one silent failure we had was episode text vanishing while everything said "clean". **Needed, in order:** (1) **the fidelity checker, DONE**
(`scripts/grove/check-fidelity.ts`, `src/lib/grove/fidelity.ts`, see `IMPORT.md`); (2) **the full fetch** of every WUWF-made page not yet fetched (about 3,590 local stories, 486 show
episodes, about 1,460 events, and the credited authors; roughly 6,000 requests, about 6 hours; the owner's approval first; the census runner's `pnpm census run` extends along the plan);
(3) **one full rehearsal on staging**, including **the embedding step** (`scripts/embeddings/backfill.ts`, `IMPORT.md` step 5; see *Vector search and similar stories*), plus a small **post-import check script** (the story count matches the source; every migrated page answers 200 with a real title and some body text;
images load; the stored vectors equal the eligible stories); (4) **a database backup before the production import, and a content freeze on Grove during the final run** (a checklist step, not code). **Dropped for now:** a general delta mode
for the importer (with a freeze, the few changed stories can be replaced one by one), a coverage report for all 200,964 URLs (the policy is decided; spot-check a sample of the 410s), a scripted
undo (the backup covers rollback), and elaborate pass/fail gates (the rehearsal's report is enough). **Known gaps in the importer, for whoever builds (3):** a story already in (matched by
Grove id) is left alone, so an edit made on Grove after the import never arrives (the body repair only fixes specific cases); and nothing checks the database after a save.

**Waiting on the owner:** the wire address shape (recommended: keep `/{YYYY-MM-DD}/{slug}`, origin in `source`, canonical to the publisher; *Wire story address shape*);
Search Console access (page indexing and links exports); how CDS stories are addressed; the licence terms question for News Service of Florida and AP text sent to a third-party
LLM; the six ambiguous link targets (`needsDecision` in the link map); `programUrl` for each syndicated program (editors, in the admin); whether new EcoMinutes episodes are MP3
not WAV; **running on the owner's computer:** the episode body repair against staging (dry run, then `--only` one, then all) and the importer rehearsal.
**Keep `census-raw-005` to `-007`** (the only copy of the 2,072 raw WUWF pages fetched today) with `-001` to `-004`.

**Tooling that survives the sandbox:** `scripts/census/gap-probe/` (how to refresh the inventory and counts before cutover; read its README first),
`census/url-inventory/` (every count, the link map and its answer cache, the show table), `scripts/grove/resolve-links.ts`. A fresh sandbox needs Postgres brought up (below) and
`apps/site/.env.local` (`DATABASE_URL=postgresql://wuwf@127.0.0.1:5433/wuwf_site` plus the secrets from `.env.example`; gitignored).

### Previous hand-off (end of the 2026-11-03 session; kept for its staging, infrastructure and sandbox notes; **its branch and PR 325 lines are out of date**: PR 325 and later were merged)


**Branch:** `claude/eloquent-thompson-7gpsj2` (`wuwfdevs/portal`), pushed, and **PR 325** (https://github.com/wuwfdevs/portal/pull/325) is open for it: push more commits to update it, do not open another. The repo's PR-text check needs a Summary, What changed and Test plan section; keep the description current when the scope changes. Everything below is committed.

**Where the work is.** The owner's instruction: build every board **except sponsorship (16-20) and listening (5-6)**, which were deferred (sponsorship was built later, 2026-11-17: see *Sponsorship pages*). The build
program is under *The build program*. **Phases 1 to 4 are done** (standard pages; shows, episodes, podcast directory; the community
calendar with public submissions and editorial approval: see *Community calendar*; author profiles and the Unearthing Florida and Voyager hubs: see *Phase 4*). **Next: phase 5** (short video), 6 (RadioLive), 7 (Barefoot Mary and member feeds: **design with the owner first**, it needs
sign-in, entitlements and private feeds), 8 (redirects, sitemap, search results, gallery page, retire the starter `/posts`), 9 (fill
homepage slots). The per-session task list does not survive; recreate it from that list. Pattern that worked for each phase: read the board and
Grove's JSON for the page type, decide the data model (reuse an existing collection when the shape fits: a show is a production, an
episode is a story), converter with tests on synthetic pages and on the real census (`scripts/grove/convert-*.ts`), collection fields with a
migration (`pnpm payload migrate:create <name>`, then `pnpm verify:migrations`), loader reading with `overrideAccess: false`, a server view,
integration tests, a production build, a browser check at 1440 and 390 px, then ROADMAP and a commit.

**Running outside this repository (ask the owner for the results):**
- **Status at hand-off (2026-11-03): the 40-story staging rehearsal is done and clean** (0 failed, 0 held; files in the bucket, audio plays, admin checked by the owner). Staging has all migrations through batch 11. Two importer gaps were found and fixed: files for shows, pages, authors and events had never been fetched (run `--phase fetch` before `save`, on the same sample), and author profiles are now saved only when a migrated station story credits the person (`authorsSkippedByRule` in the report). **Next, in order:** (1) a larger sample (about 200) on staging: fetch, then save, to exercise the author filter on real matches; (2) redeploy staging from the branch and check an image URL has a single `?`; (3) owner decisions: what a skipped person's `/people/` address does (recommended: not found), a full fetch for the whole corpus (thousands of third-party requests, needs approval), and whether to remove staging author profiles saved before the filter existed; (4) production import only on the owner's explicit go-ahead.
  **Update (2026-11-03, later): the 200-story staging sample ran.** Fetch and save: 196 stories had all their files, 4 held (two files refused: one `http://` address and one NPR audio that answered with a non-audio type; two failed: a host whose robots.txt cannot be read, and an NPR mp3 the server cuts off mid-download twice), 151 saved, 76 already there; 3 failed because the body was required and they are audio-only pieces. **Fixed:** a story with featured audio, video or a photo may have no body text (`src/lib/story-body.ts`, tested, no migration); the importer now prints the field message of a failed save. The 10 author pages in the data are all non-station people, so the author filter kept none: **the filter's "keep" case is still untested on real data, and no station author has a Grove author page downloaded.** Every credited person already has a record and a `/people/<slug>` page (stories plus whatever bio and photo the byline carried); Dave Dunwoody (101 stories) has neither. `scripts/grove/list-credited-people.ts` (read-only) lists who is credited and whose author page is missing, to size a fetch of the missing `/people/` pages from wuwf.org, **which needs the owner's approval**. Seven staging profiles saved before the filter credit no migrated story (Bonny Wolf, Charles Michael Ray, Dani Matias, Geoff Nunberg, Laura Roman, Mario Armstrong, Rachel Cramer): the owner decides whether they go.
  **Update (2026-11-03, end of the staging sample work).** Staging: 231 stories, 16 author profiles with a Grove address (all 21 station authors' pages were fetched on the owner's Mac with `scripts/grove/fetch-author-pages.ts --go`; the sample credits 16 of them, so the filter's keep case is now proven on real data). Held: 3 stories, all because a file cannot be had: an NPR audio that answers with a non-audio type (Pooley housing story), a third-party host whose robots.txt cannot be read (90works), and an NPR mp3 the server cuts off twice (Acoustic Interlude, Oct 9 2022). Fixed on the way: T.S. Strickland's staging address is `t-s-strickland-2` (Grove's; the old rehearsal had made `t-s-strickland`), the seven pre-filter NPR profiles were deleted from staging (owner approved), and `--upgrade-http <exact address>` fetches the https version of one named http file (used once, for Jessica Palombo's photo; the owner confirmed her amendments story is WUWF's). Image URLs on the redeployed preview have a single `?` (owner checked). **Decided:** a skipped person's `/people/` address is "not found". **Still open:** whether the full corpus file download (about 3,830 files, hours) has run (the owner thinks so; the ledger count on the Mac decides: it was 575 for the 200-story sample) and needs approval if not; the bylines `bbarrett`, `lmyers` and `christian garman` are spellings of real people and would become extra records in a full import; "Music to get vaccinated by" was saved with no audio (check against Grove); production import only on the owner's explicit go-ahead.
- **The importer rehearsal.** The owner started a separate Cowork session on their own computer that runs `scripts/grove/import.ts` (see
  `scripts/grove/IMPORT.md`) against **staging**: a 40-story rehearsal, then the full file download (3 to 4 hours, resumable). That session
  uses the code as it was then (before standard pages, shows and episodes were added to the importer, and before topics and authors kept
  Grove's slugs). When the owner pastes its report: check the held stories and the "decisions" counts, then open a few `/tags/` and
  `/people/` addresses on the staging preview.
- **Waiting on the owner:** the rehearsal report; the **approval to import into production** (then create a production login the same way
  as the staging one: `create role importer_production login password '<new>' in role payload_app;` through the Supabase tool, apply the
  production migrations deliberately, and have production's own S3 keys and pooler URL in the import settings); the 2024 election live blog
  check (does Grove show "load more"?); wording review of fixed copy (the fellowship hub's "How the fellowship works", the front-page
  membership band).

**Infrastructure (no secrets here; none are in the repository).** Supabase (WUWF org, `us-east-1`): `wuwf-site-staging` (ref
`avgeycgvaufwdfzdsogi`) and `wuwf-site-production` (ref `gyidqxhkkhajfazbcrug`); each has a login role `payload_app` (not a superuser; the
app and migrations connect as it) and a private bucket `wuwf-site-files`; staging also has `importer_staging`. The session pooler is
`aws-0-us-east-1.pooler.supabase.com` (5432 session, 6543 transaction; user `<role>.<project-ref>`). Vercel (team `WUWF`,
`team_y6qwjjgoZVgKrtElTK1nZET7`): project `wuwf-site` (`prj_YaSfN6SHJtDLj8Pf6nAQERO8hqbL`), Root Directory `apps/site`, build command
`bash scripts/vercel-build.sh` (applies migrations on **Preview** builds only, via `MIGRATE_ON_BUILD=1`). A push to a branch builds a Preview
against **staging**; the staging site is behind Vercel sign-in. **Production has no deployment and none may be started without the owner's
say-so.** Preview env is set (database, secrets, storage, the staff sign-in secret shared with the Portal's Preview). Production env has only
the two public Supabase variables. The Portal's Production env is deliberately unset for the website tool.

**Working in the cloud sandbox (hard-won).**
- Outbound is **HTTPS through a proxy only**: no direct Postgres, so the importer and `payload migrate` against Supabase cannot run here;
  they run on the owner's computer (Cowork) or in Vercel's build. Supabase's SQL tool (HTTPS) works for small administrative SQL.
- Hosts must be allowed in the environment's network settings; the NPR file hosts, `wuwf.org` and the Supabase hosts were allowed by the owner.
- Local Postgres dies when the sandbox idles: run `bash scripts/dev/pg-up.sh` (a fresh sandbox too; see *Running things in a fresh sandbox*). Run scripts that use Payload with `NODE_ENV=production` and `< /dev/null`, so
  development mode does not push schema changes.
- Never create a Vercel deployment with the tool for a project that has no production deployment yet: it came back as a *production* one
  (cancelled in seconds, nothing went live). Push a branch instead.
- Secrets: the owner pasted some credentials in chat; the auto-mode classifier refuses to let the agent read secret files back. Do not work
  around it; generate and set values in one step, and tell the owner when a value was shown in the session log.
- The census raw pages (`raw/001-004`, from the owner's four zips) and the live-updates pages live only in a sandbox scratch folder and are
  gone with it; the owner has the zips. Re-fetch the three live blogs with `scripts/live-updates/probe.ts fetch` (neutral client, 3 s apart).

**Decisions the owner made this session (do not reopen):** separate Supabase projects from the Portal's; embeds: a built-in list plus
approved hosts load without a click, any other public https host loads behind a click, and **script widgets (the election guide) load
without a click** from built-in or approved hosts, publisher-only to add; **no third-party scripts otherwise**; the importer's defaults
(sections from the path, "WUWF Staff" for no byline, extra byline names kept and flagged); editors post live updates, publishers open and
end a blog, bylines optional, comments left out, polling our own endpoint; the full import goes to **production, rehearsed on staging first**;
sponsorship and listening were deferred (sponsorship pages built 2026-11-17).

## Where things stand (Milestone 1)

| Area | State |
|---|---|
| Workspace conversion (Portal to `apps/portal`, pnpm) | **Done**, verified identical to baseline |
| Payload Website starter in `apps/site`, PostgreSQL | **Done**; boots, typechecks |
| Shared packages (design-tokens, listening-core, portal-contracts) | **Done**, tests in each |
| Visual foundation: tokens → CSS, self-hosted fonts, header/footer driven by their globals, no dark theme | **Done**; checked in a browser at 1440 and 390 px |
| Article page (board 3) with the acknowledgment panel | **Done**; checked in a browser, and the edit-the-agreement loop verified on a production build |
| Story blocks derived from the template census (2026-11-02): Media (per-use caption, credit, source, alt override, alignment), Gallery (carousel, grid, list; slide titles), Pull quote, Embed (adds width/height and link-only X and Facebook posts), Audio (new), Preserved HTML; Promo removed | **Done**; checked in a browser at 1440 and 390 px; tables and a native video player are **not** (one table in 1,500 pages stays preserved HTML) |
| **Link-line block** (2026-11-03, owner decision; **not in Grove's data**) | **Built.** Grove had no element for a short label and a link. Editors typed two patterns by hand into paragraphs, and the link text often carried the tags as typed characters (`<b>…</b>` shown on the page): a bold "RELATED:" and a link, and the centred stock line "Support Local Stories. Donate Here." One `linkLine` block now covers both: a label, then a link to a picked WUWF story (its title and address follow it) or to any page, https or http address, or mailto, with new-tab. The converter recognizes exactly those two patterns, and only builds a block when its address passes the block's own rule (`src/lib/link-line.ts`, shared by the editor's validator, the page and the converter), so a line the editor would refuse to save is never built; anything else stays a paragraph, so nothing is lost. A separate fix reads typed markup in the words of a link, or in ordinary text, as HTML again so the formatting it asked for is applied and the tags are gone (`<i>Frontiers in Psychology</i>`, a misnested `</b>…<b>`, `1<sup>st</sup>`, `<br>`, `<wbr>`, `<font>`, `&nbsp;`; an empty typed pair is dropped). It only reads **formatting** tags and only when the text carries a closing tag, a `<br>`/`<wbr>` or a `&nbsp;`: text that merely mentions an opening tag, or that holds a typed image, frame, link, script or Grove element, stays exactly as typed, so typed text can never become media or an embed. Reported as `link.escaped-markup-repaired` (in a link) or `text.escaped-markup-repaired`; a link left with no words is dropped and reported as `link.empty-text`. **Run on the real census pages (2026-11-03, 1,566 pages, 1,513 converted, still 1,509 clean / 4 flagged / 0 exceptions):** 130 link-line blocks in 76 stories: 81 "Related" lines (54 stories, 25 with more than one; all had `target="_blank"` in Grove and keep it) and 49 "Support Local Stories." lines ("Donate Here" 35, "Support Public Media" 14); none has an address the block would refuse and none has a tag left in its text. 147 escaped-markup repairs in 86 stories (ordinary inline links, mostly italic titles and organization names); none of the 1,724 links on the real pages shows a tag any more (9 did), and no story lost or changed a word (checked story by story against the previous converter). **The new converter changes 131 of the 1,513 stories (8.7%)**: 55 only in repaired links, 45 only with link lines, 31 both. Left as paragraphs on purpose: a "RELATED:" link followed by a teaser, one long prose paragraph that links to the donation address, and the 29 other support-style sentences in the sample. Each support line reports `support.appeal-sent-to-support-page` with the address it replaced. No migration (blocks live in the rich-text JSON; `verify:migrations` passes). Unit tests for the converter, block and address rule; 4 integration tests; production build passes; checked in a browser at 1440 and 390 px (44 px link targets, no overflow). **Support lines go to `/support`** (owner decision, 2026-11-03): the converter writes `/support` into every one of the 49 blocks, and `redirects.ts` sends Grove's old donation address `/thanks-for-your-support` to `/support` for every other place it is still used (the one prose paragraph in the sample that links there, stories outside the sample, newsletters, on-air mentions). The redirect is temporary (307) so it can be repointed at the donation form later; checked against a production build (307 to `/support`, which answers 200). **Not repaired, found on the way:** 6 stories whose text carries JSON fragments (`","_id":…`) and an escaped Grove embed element after a YouTube address; these are polluted source data, left exactly as they were, and need a decision (they hold the video's real address, so each could become an embed). **Not yet done:** re-convert and repair stories already imported |
| **Repair of bodies already imported** (2026-11-03) | **Built, not yet run on staging.** The importer skips a story that is already in, so the 200 stories on staging keep the bodies the old converter made (the `<i>…</i>` links and plain "RELATED:" lines). `scripts/grove/repair-bodies.ts` re-converts each story's Grove page and replaces **only the body**, and only when the stored body holds typed markup or has a Related/Support line as a paragraph, the words a reader reads are identical, nobody has edited the story since the import (version history), and every file it needs is already in the library. Dry run by default; staging-only guard; runbook in `scripts/grove/IMPORT.md`. Pure decision logic in `src/lib/grove/repair.ts` (8 tests); the database half in `scripts/grove/repair-bodies-core.ts` (7 integration tests: dry run writes nothing, apply repairs only the body, edited / words-differ / missing-files / no-source-page are skipped, a second run changes nothing, limit). **Rehearsed on a scratch database** with 224 real census stories saved as the old converter saved them: 63 repaired (the same 63 an independent count predicted), 154 untouched; every repaired story read the same words, had no typed markup left and two versions; a second run found nothing. **To do:** run the dry run against staging, review the list, repair one story (`--only`), look at it, then all; redeploy or revalidate staging so pages refresh |
| **Grove converter** (`src/lib/grove`, pure): one Grove article page to one story plus a fidelity report; asset tokens, exact path, slug, ids and dates kept | **Done** (2026-11-02). Run on all 1,566 real census pages: 1,498 converted (exactly the census's WUWF-originated count), 3 ambiguous copies and 65 non-articles skipped by design; **1,493 clean, 5 need a person, 0 exceptions** (after the embed-host change below; it was 1,480 / 18). The 5 include the voter guide's script, which is removed and flagged; every path and Grove id matches the manifest; output is deterministic. 91 tests (6 mutation-checked), plus an integration test that publishes a converted story through Payload and reads it back. The importer is built (next row); the files are not yet downloaded |
| **Video player block and video library** (`video` collection; the `videoPlayer` block in story bodies and as featured media; Grove's HTML5 video files convert to it with their poster pictures) | **Done** (migration `20261102_234817`, tested up, down and up). Native controls, nothing loaded until played, files served with range support so readers can seek. Checked in a browser on a real story. Large files need the storage adapter's direct upload on Vercel |
| **Embeds from any public host, and script widgets** (owner decisions 2026-11-03) | **Done.** A built-in host list (now including the election-guide service, `static.electup.com`) and hosts approved in Site settings load **without a click**; any other public https host embeds behind a click-to-load card; private, internal and own-site addresses are refused. A `widget` block (script URL, container id, `data-*` settings, event, height) runs a script in a sandboxed frame (no `allow-same-origin`), by the same load rule, and only a publisher can add or change one. The converter turns Grove's election-guide pattern into one. History: the widget block was removed on 2026-11-03 when the owner expected to build a new guide, and restored the same day once the owner said the old guides must render inline with no click |
| **Importer and asset downloader** (`scripts/grove/import.ts`, `src/lib/assets/download.ts`, `src/lib/grove/import-rules.ts`) | **Built and tested; the real download has not run.** Two resumable phases: `fetch` (one file at a time, 3 s apart, neutral headers, robots.txt per host, https and public hosts only, size caps, a ledger of every attempt outside the repository, stops after five 403s) and `save` (library record per source file, matched on `legacy.sourceUrl`; sections, categories, contributors; story matched on Grove id so a re-run changes nothing; a story whose files are not all downloaded is **held**, never saved pointing at nothing). Owner's rules applied and reported: no section → section from the first path segment (93 stories); no byline → "WUWF Staff" (117); byline text that is only a fragment of a credited name is dropped with a note, any other extra name becomes a contributor and is flagged (6 stories have extra byline text). Rehearsed locally with generated placeholder files for 33 stories (saved, then a second run saved nothing). **Blocked:** this session's network policy refuses `cpa.ds.npr.org`, `media.npr.org` and `npr.brightspotcdn.com` (403 from the egress proxy), so no real file has been fetched. The environment's allowed domains need those hosts added |
| **File storage adapter** (S3-compatible, for Supabase Storage; `src/plugins/storage.ts`) | **Wired, not tested against a real bucket.** Off unless `S3_BUCKET` is set (then files stay on disk, as in tests and local work). On: all three upload collections store in the bucket and uploads go from the editor's browser straight to it (Vercel's 4.5 MB server limit). Migration `20261103_004740` adds the adapter's two columns to media, audio and video in every environment. Needs the bucket, its S3 keys and a CORS rule allowing PUT from the site |
| Media and audio libraries; featured media and audio on stories (replace `heroImage`) | **Done** (migration `20261102_220306`, data move tested up, down and up again). `credit`, `source` and a unique write-once `legacy.sourceUrl` on media and audio; `featuredMedia` is one photo, gallery or video, `featuredAudio` one audio file |
| Grove-ready identity: `legacy.legacyPath`, `legacy.groveId` (contentId), `legacy.modifiedAt`, `legacy.nprId`, `source` on posts and pages; migrations verified | **Done**; the block set, importer and NPR read-only enforcement are **not** (see *Grove migration*) |
| Content model, staff roles, access control | **Done**, integration-tested |
| Underwriting resolution + Coastal Futures / Example Foundation demonstration | **Done**, 26 unit + integration tests |
| Initial production migration | **Done**; matches the dev push exactly |
| Docs (README, ARCHITECTURE, ANALYTICS, this file) | **Done** |
| Staff sign-in: Portal half (`website` registry row, access predicate, audit policy, `/website` token route, roles) | **Done**; migration applied to preview and production (2026-10-30). Tool is registered **disabled** |
| Staff sign-in: site half (verify, refuse reused `jti`, sync account, session cookie + strategy, revocation) | **Done**, 27 tests incl. replay, race, takeover, tampering |
| Sourcework-to-CMS publish channel | **Deferred and removed** (owner decision, 2026-10-30); see *Deferred* below |
| Giving page `/support` (board 14): levels, figures, calls to action edited in the admin (`Support page` global) | **Done**, checked in a browser at 1440 and 390 px; button addresses and the audience figures are for WUWF to supply (see below) |
| URL scheme: unique `path` on stories and pages, `sections`, one catch-all route, permanent redirects on address change, trailing slash 308 (2026-11-02) | **Done**; 27 integration + 38 unit tests, mutation-checked; production build and `pnpm smoke:paths` pass. Contributors, shows and events get a `path` when their routes exist (one line in the resolver's registry) |
| Production build (`pnpm build`) | **Passes again** (2026-11-02). It had failed since 2026-10-31 without anyone noticing; see *Lessons* |
| Fellowship hub `/fellowships/[slug]` (board 4) | **First slice done** (2026-11-03): eyebrow, title, summary, a stats line, the funder panel (agreement lines whose term is running, read on the server), mission headline, mission and focus areas, the fellow, the latest story and all work (published only), and the "how it works" strip. All of it is edited on the fellowship record in the admin. Migration `20261103_023039`; 4 integration tests, 12 unit tests; checked in a browser at 1440 and 390 px. **Left out on purpose, because the features are not built:** follow, ask the fellowship a question and the open-questions list (listening, and the board's per-question "Me too" counts conflict with the no-public-tallies rule), the newsletter signup, explore by place, related coverage across WUWF, and "all of the fellow's work" (no contributor pages yet). The "how it works" copy is the board's, fixed in the component: the owner should confirm the wording |
| **Live blogs** (`/live-updates/<slug>`): a live blog is a **story** (a post with `format: live`, 2026-11-03: it appears in section, topic and byline lists, search, the sitemap and home page picks like any other story) with a `live-updates` collection for its updates, the page, polling, structured data, the Grove converter | **Built** (2026-11-03). A blog is a publishable record (a publisher opens and ends it; ending stamps the time); an update is its own record that an **editor** posts, live on save, with a stable anchor, a Central-time stamp, an automatic "Updated" label when its words change, optional bylines, up to three pinned. The page is cached and refreshed the moment an update is saved (so an emergency surge is served from cache); while a blog is live and the tab is visible it asks our own endpoint every 45 s and offers "New updates available" without moving the reader or refreshing by itself; an ended blog polls nothing. `LiveBlogPosting` data for search, no third-party scripts, comments left out. Migration `20261103_025619`; 8 integration + 18 unit tests; checked in a browser (real Isaias blog, 143 updates, at 1440 and 390 px, the polling prompt included). The converter turns all three archive blogs into 161 updates with no exceptions. **Not done:** importing them into the database (a step to add to the importer; the pages are fetched with `scripts/live-updates/probe.ts fetch`), a faster "post an update" screen than the standard create form, paging for a blog over 250 updates, live blogs in the sitemap, and the election blog check below |
| **Shows, episodes and the podcast directory** (boards 9, 10; Grove `RadioShowPage` and `RadioShowEpisodePage`) | **Built** (2026-11-03). A **show is an original production** (the thing an underwriting agreement attaches to), extended with an exact address (`/show/<slug>` migrated, `/shows/<slug>` new; only a publisher can change it; it cannot collide with a story or page), tagline, schedule, hosts, description, a "listed" flag and Grove ids. An **episode is a story** (`format: audio`, the audio as its featured audio) that belongs to a show, so it reuses the story page, lists, search and importer; its page shows "Episode · <show>". Show page: tagline, summary, host/schedule/episode-count line, cover, funder panel (hub rules), the newest episode with its player, about, hosts, all episodes (newest 20), more originals. `/podcasts` lists every listed show with its count and newest episode, then the newest episodes. Both refresh when a show or episode is saved. Converters: `convertShowPage` and episodes through `convertStory` (the show comes from the page, else from the address, and is said so; an NPR-distributed show is not archived). Corpus: **1,513 stories convert (15 episodes), 1,509 clean, 4 flagged, 0 exceptions**. The importer saves shows first, then episodes attached to them (a minimal unlisted show is made, and reported, if an episode's own show page was not in the data). Migration `20261103_033745`; 7 integration + 9 unit tests; checked in a browser at 1440 and 390 px. **Left out (deferred or not built):** follow the show, leave a message (listening), email signup, transcripts, member feeds, related reporting; show-level podcast feed URLs |
| **Community calendar** (Grove `EventPage`; the live calendar and its submission form) | **Built** (2026-11-03). A public form (the station's own fields, one-time and recurring) saves a **draft event marked "pending review"** (2026-11-03: there is no separate submissions collection; the review status, notes, submitter and private picture are staff-only fields on `events`, and publishing is approving); staff review and edit; a **publisher** approves and the event goes live at once; an editor can edit, ask for information or reject. `/community-calendar` (what is coming up, or day by day when dates are picked; category, keyword and date filters; Grove's old `?f0=` filter addresses still work), the event page (schema.org data, upcoming dates, external links marked user-supplied), `/community-calendar-event-submission` (works without a script; honeypot, signed timing token, per-address rate limit, plain text only, pictures checked by their bytes and kept private). Grove's events convert (10 of 10 real samples clean) and import at their exact addresses. Migration `20261103_042706` (up, down and up tested; seeds the 12 categories). 121 unit + 27 integration tests (the whole suite: 933); checked in a browser at 1440 and 390 px (51 automated checks: no overflow, 44px targets and 16px fields on my content, the form with and **without a script**, a refused form keeps its answers). **Left out / open:** see *Community calendar* below (IT-04 notice wording, staff notification, ICS download, attaching a submitted picture, the other 1,464 events unseen) |
| **Pages: template system and standard pages** (Grove `ContentPage`) | **Built** (2026-11-03). `pages` gets a `template` (standard, or `blocks` for the starter's older layout, which keeps rendering), a short lead and a body made of the same blocks a story holds; a page is served at its exact address by the same resolver as stories; drafts stay private. The converter turns Grove's standard pages (modules, containers, a sub-heading that holds a video) into that, never dropping anything: on the 24 census pages, 22 clean and 2 flagged (a Vimeo address that is not a video). The importer now brings standard pages in with the stories. Also fixed: **NPR Pym interactives** (a `data-pym-src` placeholder plus NPR's loader script) were being lost; they now embed the same address as a frame, `apps.npr.org` is a built-in embed host, and the loader is reported as replaced, not lost (this rescues the election simulator page and the same pattern in stories and live blogs). Migration `20261103_032912`; 11 unit + 3 integration tests; checked in a browser (livestream behind a click, Vimeo and NPR inline, no overflow at 390 px). **Next templates for pages:** a hub template (for Unearthing Florida, The Voyager and other hubs) arrives with phase 4 |
| **Story lists**: section (`/local-news`), topic (`/tags/<slug>`) and person (`/people/<slug>`) pages | **Built** (2026-11-03). One shared list page for all three, at Grove's own addresses, 12 stories a page, newest first, the newest large on page 1; pages after the first at `<address>/page/<n>` (`/page/1` and a page past the last are 404s; a real page at one of these addresses wins over a list). Real links for paging (44 px, no script), a title and canonical per page, an empty list says so. Publishing, changing or removing a story refreshes the first page of its lists at once; deeper pages catch up within 10 minutes. The homepage's local-news grid links to its section page. 4 unit and 6 integration tests; checked in a browser at 1440 and 390 px. **Not done:** a design for these pages (the boards have none, so they reuse the story card and the fellowship layout), a search-results layout, a people index, sections and lists in the sitemap, and the empty `/posts` starter list (still the starter's, titles only). **For the importer:** topics and people must be created with Grove's own slugs so the 905 tag and 1,148 people addresses survive; `scripts/grove/import.ts` now passes them, **but an import already running uses the old code** (slugs from names, usually the same, not always): check a few `/tags/` and `/people/` addresses after it |
| Homepage `/` (boards 1, 2) | **First slice done** (2026-11-03). Edited in the **Home page** global (fixed tabs, publish permission): **emergency coverage** (switch, label, headline, text, link; first-class, at the very top; refreshed the moment it is saved), lead story, up to five top stories ("The Briefing"), a fellowship feature (with its funder panel), and a local-news list (any section, 3 to 12). Anything left empty is filled from the newest published WUWF work, a pick that is no longer published falls away, and no story appears twice. Publishing, unpublishing or deleting a story refreshes the front page; it also refreshes on a 5-minute schedule. The old "home" page record is no longer used. Migration `20261103_024053`; 8 unit + 6 integration tests; checked in a browser at 1440 and 390 px. **Left out on purpose (their features are not built):** the live player and "on now", the WUWF Listens question, newsletters, "From NPR", sponsor placements. (Podcasts, RadioLive, Unearthing Florida and short videos were added 2026-11-06: see *Resume here*.) The membership band's wording is the Article page's; the owner should confirm the front-page copy |
| **Author profiles and the Unearthing Florida and Voyager hubs** (Grove `AuthorPage`; boards 11, 13) | **Built** (2026-11-03). See *Phase 4*. |
| Audience listening: screens over the Portal's signed listening API (decided 2026-11-04: the Portal owns the data; the site has no listening collections) | **Phase B built (2026-11-09):** the full question set (`/listens/<publicId>`, boards 5b and 6-H), the inline asks B, C and D (since replaced by the full set in every placement), and the hub (`/listens`, board 5, as far as the Portal serves it). Verified in a real browser at 1440 and 390 px against a stand-in Portal that checks every signature; **not yet against the real Portal**: it needs `PORTAL_ORIGIN` and `PORTAL_LISTENING_SECRET` set here and the matching secret in the Portal, and the Portal's two 2026-11-09 migrations applied. Unverified until the first real upload: the raw `PUT` to the signed upload address. **Not built:** an editor block to place B, C or D in a story, topic page or episode (needs a Payload migration; `components/Listening/ListeningInline` is what the block will render), Ask WUWF, host requests, sessions, tables, and the campaign and report bands (suite phases C to E). See *Listening: where it stands* below |
| Analytics foundations | Sponsor placement counter built end to end (counts, Delivery panel, sponsor CSV); other events and consent not built (`ANALYTICS.md`) |
| Supabase Auth, audience profile + RLS, passwordless sign-in, entitlements model | Not started |
| Starter lint errors (Header, Card, Theme provider) | **Fixed** (components replaced); 3 warnings remain in the starter's e2e tests |

Milestones 2–4 are unchanged from the project brief (shows platform and Barefoot Mary, member feeds, the
listening hub, short video, sponsorship section and measurement, membership sync, intelligent publishing). Nothing
in them has been started.

## Next, in order

> **Superseded for pages and templates by *Resume here* and *The build program*.** The older list below is kept for the items it still covers (analytics, Supabase Auth, final pass).

1. ~~**Node.**~~ Done: 22.23.4 (the Payload minimum) pinned in `.node-version`/`.nvmrc`, and `engine-strict`
   in the root `.npmrc` makes an unsupported Node fail the install. Portal, site and packages all re-verified on it.
   Still to do on Vercel: set the project's Node version to 22.x for both projects.
2. ~~**Portal migration**~~ Done and applied to both projects (`20261105140000_website_tool_registry.sql`). The tool
   is registered `available` but `enabled = false`, so the dashboard card reads "Unavailable". **At launch:** an
   administrator enables it at `/admin/tools`, and the Resources release note ships in the same step (it was
   deliberately not written yet: announcing a tool nobody can open adds noise to "What's new").
3. ~~**Portal token route**~~ Done: `apps/portal/src/app/(portal)/website/route.ts`. Needs `WEBSITE_ORIGIN` and
   `WEBSITE_IDENTITY_SECRET` set in the Portal's environment (see its `.env.example`); unset, it answers that sign-in
   "isn't set up on this server yet" and logs why. The site must hold the same secret as `PORTAL_IDENTITY_SECRET`.
4. ~~**Site sign-in route**~~ Done (`src/lib/portal/`, `src/app/api/portal/sso/route.ts`, `portal-sign-ins` collection).
   Needs `PORTAL_IDENTITY_SECRET` (= the Portal's `WEBSITE_IDENTITY_SECRET`). Create the break-glass admin first.
5. ~~**Before any more body work: the census**~~ Done, the blocks are built from it, and **the converter is built and run on the whole sample** (see *The converter*). **Next in the migration: the asset pipeline (needs the owner's approval to fetch, and the site's Supabase storage), then the importer.** The pages below do not depend on either.
6. **Pages**, built to the boards with `@wuwf/design-tokens`. Done: the foundation, the article. **Next: the
   fellowship hub** (`/fellowships/[slug]`, board 4: the article's "About the fellowship" and "Explore the project"
   links already point at it), then the **homepage** (boards 1-2, editor-curated placements, no hard-coded arrays, and
   emergency coverage as a first-class state). Every acknowledgment through `getAcknowledgments`.
7. **Listening:** the Inline ask then the full flow as screens over the Portal's signed listening API
   (server-to-server calls asserting the subject; audio to Portal storage by signed upload URL). No
   collections here and no staff review in Payload — review is in the Portal. Needs the listening contract
   in `@wuwf/portal-contracts` first (Portal-side work).
8. **Analytics foundations** per `ANALYTICS.md`: the placement counter built 2026-11-25; next its "Order of work" step 3.
9. **Supabase Auth** with `@supabase/ssr`, audience profile + RLS, entitlements with manual grants.
10. Final pass: acceptance criteria (project brief §17), browser verification at phone width, update every doc.

> **For phase E (2026-11-11):** the Portal side of every screen on boards 5c to 5i is built and applied, and the contract
> (`packages/portal-contracts/src/listening.ts`) carries its messages: `event`, `seat-save`, `table-open`, `table-state`, `table-agree`,
> `table-update`, `table-segment`, `table-segment-complete`, `table-end`, `conversation`, `speakers-save`, `highlights-save`,
> `conversation-send`, `contact-card-open`, `contact-card-save`, `room`, `room-call`. The site serves `LISTENING_TABLE_LINK_PATH`
> (`/listens/table/<token>`) and `LISTENING_CARD_LINK_PATH` (`/listens/card/<token>`) and holds the table session token for a phone; the
> Portal keeps only its hash. Print no card for a real session until those two pages exist. A transcript is rendered and dropped, never stored
> here. `apps/portal/docs/audience-listening-suite-design.md` §10 is the record.

## Listening: where it stands

The Portal is the system and the site is the screen (suite design: `apps/portal/docs/audience-listening-suite-design.md`). The site stores
no submission, consent record, audio or transcript: it calls the Portal's signed API from its server, and audio goes from the browser to
the signed upload address the Portal issues.

**Built (suite phase B, 2026-11-09).**

- `src/lib/listening`: `config.ts` (the two environment variables), `portal-call.ts` and `portal.ts` (the one signed door to the Portal;
  a body is never logged), `visitor.ts` (the `wuwf_listening_visitor` cookie, 30 days, and the keyed per-day address hash), `flow.ts` (what
  each screen says and what blocks it), `send-answer.ts` (reserve, upload, complete: "saved" is said only after the Portal confirms),
  `inline.ts` (when a question can be answered inline), `hub.ts` (the hub's sentences), `messages.ts` (one sentence per refusal code).
- `src/components/Listening`: `QuestionSet` (the full set; its `placement` is `page`, `story`, `topic` or `voice`), `HubView`, `ListeningInline` (the server component that places one of them and renders nothing when the question
  is closed or listening is not set up), `useRecorder` (native `MediaRecorder`; the microphone is asked for once).
- Routes: `/listens` (the hub) and `/listens/<publicId>` (the full set). Server actions: `listens/actions.ts`.
- Decisions made while building, to confirm: the hub lives at `/listens`; text buttons use `--wuwf-blue-700`, not the boards' `--wuwf-blue`
  (white on it is 3.4:1, under the site's 4.5:1); the full set offers Record and Write only when the query turns written answers on;
  every placement shows the query's full question set (owner decision, 2026-11-18; the one-question inline asks B, C and D were removed); no hub card shows a count of answers unless the question has an outcome.

**Placing a question (built 2026-11-10).** `listeningAsk` is a story-body block (`blocks/ListeningAsk`: the question's code or its
`/listens/<code>` address, and "in the story" (**the full question set, embedded: the same screens and rules as `/listens/<code>`, 2026-11-18, owner decision**) or "after an episode or video" (the same set, leading with recording) with an optional recipient and one line about what
happens to it); a topic has an optional **Listening question** field and shows it at the head of its first page (`categories.listening_question`,
migration `20261110_171043`). Both render `ListeningInline` through `loadPlacedQuery`, which sends no rate-limit hash and keeps the
Portal's answer for five minutes, so a story or topic page that holds a question stays built ahead instead of rendering on every view (the
ordinary `loadQuery` reads headers and never caches). A closed or unknown question renders nothing; the Portal still refuses a late answer.
The block adds no schema (a story body is rich-text JSON). One listening component to a page is an editor's rule, not enforced in code.
`20261110_172000` adds "WUWF Listens" (`/listens`) to the seeded Community menu in the header only; the footer has no seeded content, so
its link is placed in Site settings → Footer.

**Built (suite phase C, 2026-11-10): Ask WUWF and host requests.** `components/Listening/AskWuwf` is a section of the hub (a question or a
story idea, 2,000 characters, an optional email "only to tell you what came of it", the IT-04 notice); `HostForm` is board 5c at
`/listens/host` (name, email, invitation or open session, seats 12/30/60, people expected, where, when in the sender's own words, who they
would invite, whether they would like a journalist to join). Both go through the server actions `sendAsk` and `sendHostRequest`, which check
with `lib/listening/inbox.ts` (pure, tested; each field picked by name, nothing spread into the signed body) and then the Portal's
`inbox-send` and `host-request` messages. Nothing promises a reply: Ask WUWF says a person reads every one and that no reply, story or date
is promised; the host form says someone will write back within a week because the board does, and the Portal's staff list flags a request
still new after five days. Seats and the `event` page wait for phase D. Needs the Portal's `20261110120000` (applied to both Portal projects).

**Built (suite phase E, 2026-11-13): sessions, tables, the after-page and the organizer's console.** Routes under `/listens`:
`table/<token>` (what a table card's QR opens; the link is used by a press, never on load, so a previewer cannot use up a card),
`session` (the table's phone: agreement, recording, prompts, pause, help, end), `session/after` (name and merge voices, mark lines, send),
`card/<token>` (board 5i), `events/<publicId>` (a public session and its seat form) and `room/<eventPublicId>` (the organizer's console;
needs a site account, and `proxy.ts` refreshes the sign-in there as on `/account`). Code: `lib/listening/{table,table-token,table-session,
table-load,card,event,after,room}.ts` (the first six pure and tested, `table-session` and `table-load` server only), the server actions
`listens/{table,card,event,room}-actions.ts`, and `components/Listening/{TableLink,TableSession,useSegmentRecorder,ContactCard,SeatForm,
AfterTable,RoomConsole}`. Four things are load-bearing: (1) **the table session is an httpOnly cookie** (`wuwf_table_session`, path
`/listens`) the browser's script never sees; every table call is made by a server action that reads it; (2) **the phone records segments of
under five minutes** (`SEGMENT_CUT_SECONDS`), each a whole file, and `SegmentQueue` sends them oldest first, one at a time, saying "sent" only
after the Portal confirms; (3) **the site never supplies a highlight's words or reads a card's contents**: marks are a start time and a tag,
and the facilitator learns only a count of cards; (4) **a transcript is rendered and dropped.** The follow-up (2026-11-13) closed the gaps the first cut left: **the facilitator gives an email at the agreement** (required; the page says what
it is for and that it is removed about a month after the event), WUWF emails them an **after-page link** (`/listens/after/<token>`, a route that
keeps the token in an httpOnly cookie `wuwf_after_session` and sends the browser to `/listens/session/after`; it works for fourteen days and
the four after-page messages try it before the table's own session), an **organizer is made by a link** (`/listens/room/claim/<token>`, a press
on a signed-in page calls `room-claim`), **the hub lists upcoming public sessions** (`hubSessions`), and a copy of every unsent segment and of the
one being recorded is kept in the browser's IndexedDB until the Portal confirms it (`lib/listening/segment-store.ts`), so a reload or crash loses
seconds, not the conversation; a browser that will not give storage records without a backup and the page says so. Untested: the IndexedDB
adapter itself. **Not run
against a live Portal or a real phone**: the signed-upload PUT, `MediaRecorder` on iOS Safari and the screen wake lock are untested here.

**Completion of phase E (2026-11-13).** The recorder and after-page now do what the Portal's §12 decided. `useSegmentRecorder` asks for the screen wake
lock again on `visibilitychange`, watches the microphone track (`ended` shows a banner with "Reconnect the microphone"; `mute` says the phone is not hearing;
`recordingNotice` in `lib/listening/table.ts` is the pure wording), and stamps each segment with `startedAt` (kept in IndexedDB too) so the Portal can show
where nothing was recorded; the agreement screen asks how many are at the table (optional, 1 to 20, sent as `people`) and tells the facilitator to plug the
phone in and keep the page open. The after-page offers a name the transcription heard ("It sounded like Rosa. Use this name") and "Lines that may matter"
(`proposals`), each a button and never applied by itself. The hub offers **"Host a table of your own"** for campaigns that accept kitchen tables
(`kitchenCampaigns`, `KitchenTable`, `kitchen-actions.ts`): the Portal makes the event and its table and the link comes back once; the page goes straight to
`/listens/table/<token>`. **Still untested on a real phone**: whether a given Android or iOS phone keeps recording with the screen locked. The page cannot
make it, and says what happened rather than promising.

**Environment.** The Portal's address is **Site settings > Portal address** (scheme and host only; `PORTAL_ORIGIN` is the fallback when that is empty, migration `20261114_023103`) and `PORTAL_LISTENING_SECRET` (equal to the Portal's
`LISTENING_SIGNING_SECRET`, at least 32 characters, a different value per environment). Unset, the pages say "Listening is not set up on
this server yet".

**Next.**

1. Set the two variables and the Portal's secret; apply the Portal's migrations; make a first real recording and confirm the raw `PUT`.
   Apply this site's two new migrations (`pnpm verify:migrations` has not been run on them: it needs a local Postgres).
2. Add the Footer link to `/listens` in Site settings → Footer, and check the story and topic pages still build ahead (`pnpm build`) with a question placed.
3. Phase F: reports and outcome links, and the campaign and report bands of the hub. Phase E (below) is built; its gaps are listed there.

## Deferred

- **Sourcework-to-CMS publish channel** (owner decision, 2026-10-30). Designed and built, then removed: the
  `packages/content-blocks` package (a strict block schema and parser, with editor notes that could never publish)
  and the publish/status/transcript-delivery messages in `portal-contracts`. Nothing used them. The last commit that
  contains them is `1936171`: `git show 1936171:packages/content-blocks/src/parse.ts`. Do not rebuild without a new
  instruction. The open design question was whether a piece's blocks become Lexical rich text with an `audioExcerpt`
  block (one editing experience, some structure lost) or are kept as received with their own renderer (lossless,
  edited differently); editor notes must be stored apart from public content either way.

## Grove migration: what is and is not planned for

Read `ARCHITECTURE.md` → *Migrating from Grove*.

**Decisions (owner, 2026-11-02)**

1. **The block set comes from the data, not from documentation.** Payload needs a block for everything Grove/Brightspot
   does, and stories must be able to use them as in Grove. The data is Grove's own JSON.
2. **There is no bulk export** (NPR support, 2026-10-21). The source is the public `?_renderer=json` view of each page,
   fetched one page at a time: a rendered view model, not a database export. The owner's migration plan
   ("Grove to Payload Migration Plan", 2026-10-30, a draft) governs scope: WUWF-originated reporting and locally managed
   pages are migrated in full; NPR-syndicated and other wire stories are **not** (URL exceptions only; new NPR content
   comes through CDS); drafts and revisions are out of scope. Large crawls are coordinated with NPR; public reachability
   is not authorization.
3. **URLs: keep Grove's exact paths.** See *URL scheme* below.

### What the first sample showed (33 pages, 2026-11-02; raw responses are kept outside the repository)

- Seven page templates: `ArticlePage`, `AuthorPage`, `ContentPage` (main = containers and rich-text modules), `SectionPage`,
  `EventPage`, `RadioShowPage`, `RadioShowEpisodePage`.
- An article's `articleBody` is an ordered list of rich-text chunks (HTML strings mixed with inline enhancements: links,
  headings) and `Enhancement` objects wrapping: `Figure` (image, caption, credit, alignment), `QuoteEnhancement`
  (with a `pullQuote` flag), `IframeModule` (url, width, height: NPR player, station schedule and playlist widgets),
  `TweetUrl`, `PymInteractive` (raw HTML holding an iframe: NPR video, Vimeo), `VideoEnhancement` with a YouTube player.
  Audio is page-level (`audio`: mp3 sources, duration), not in the body. HTML seen: `p ul li b i u br sup img iframe`
  and the classes `cms-textAlign-center`, `fullattribution`, `rte2-style-ul`.
- **Not seen in 33 pages: galleries, tables, story-body promos.** Absence in a small sample is not absence in the
  archive; the template census decides. The provisional Gallery and Promo blocks have no evidence yet.
- Origin is read from `sourceOrganizationName` and the `canonicalLink` host (NPR and wire stories canonicalize to
  `npr.org` or the partner's site), **not** from the path: `/music-arts/…` was NPR, `/florida-news/…` was a statewide
  partner, `/commentary/…` and `/local-news/…` were WUWF.
- Metadata to carry: `contentId` (the Grove id), ISO published and modified dates, author and contributors, tags,
  primary and secondary sections, corrections (`updatesCorrections`), and the NPR id that appears inside NPR canonical URLs.
- WUWF's own audio and images are hosted on NPR-controlled hosts (`cpa.ds.npr.org/wuwf/…`,
  `npr.brightspotcdn.com/legacy/sites/wuwf/…`). Copying them, and what happens to them after Grove shuts down, is a
  rights and retention question for NPR.

### URL scheme (decided)

Grove serves exactly one URL per story: `/{section}/{YYYY-MM-DD}/{slug}` for local stories (`/{YYYY-MM-DD}/{slug}` for
wire stories); the same date and slug under another section, or none, is a 404; a trailing slash also serves 200. So:

- Every record has one unique, indexed **`path`**. Migrated records copy it verbatim and never recompute it. New stories
  generate it once, at first publish, as `/{section}/{YYYY-MM-DD}/{slug}`, and it does not change when the section is
  edited. Pages keep their shapes: `/people/…`, `/show/…`, `/community-calendar/event/…`, standalone paths.
- One catch-all route resolves a path to a story, author, show, event or page. It replaced `/posts/[slug]`, which was a
  placeholder (done; today it resolves stories and pages). A trailing slash redirects (308) to the path without one; the canonical is the path itself.
- Redirects exist only for a path an editor deliberately changes (automatic) and for justified syndicated exceptions.
  Changing the URL structure for tidiness would need redirects across the archive and gain nothing for search.
- For syndicated pages, the JSON's `canonicalLink` is the exact publisher URL, so exact redirects can be derived rather
  than guessed. Whether to redirect, serve or let 404 is decided by the URL census and, later, Search Console.

### URL census (2026-11-02): what the sitemaps list

All 276 monthly sitemaps (2004-01 to 2026-11) fetched once, no story pages: **200,897 unique URLs**. Shapes: wire-style
`/DATE/slug` 185,332; `/section/DATE/slug` 11,041; community-calendar events 1,474; people 1,148; tags 905; show
episodes `/show/X/DATE/slug` 501; standalone pages about 450. The first section-prefixed URLs appear in 2013 and the
volume ramps in October 2013 (a platform change); everything 2004-2012 is wire-style and small (626 URLs in all of
2010), so **sitemap completeness before 2013 is unverified** (the plan already flags it).

Section prefixes (counts): `florida-news` 4,807, `local-news` 4,662, `music-arts` 614, `news` 385, `commentary` 106,
`uwf-news` 77, `local-arts` 65, `unearthing-florida` 59, `local-politics` 51, then a long tail. **A prefix does not
give origin**: in the sample `florida-news` was a statewide partner and `music-arts` was NPR. So the WUWF-originated
count is "some thousands", not 11,000, and only a classification pass (`sourceOrganizationName` plus `canonicalLink`
host) can say. Whether any bare `/DATE/slug` story is WUWF-originated is unknown (none of 11 sampled was).

The raw sitemaps and sample responses were kept in the session's scratch space, not the repository, and are gone with
the sandbox. To regenerate: read `https://www.wuwf.org/sitemap.xml` (an index of `sitemap-YYYYMM.xml` files), fetch each
with a neutral User-Agent (no contact information of any kind) and at least 3 s between requests (robots.txt allows all), and tally by
path shape. Re-fetch the sample below the same way with `?_renderer=json`.

### URL inventory and disposition (2026-11-04): what the census left out

All 276 monthly sitemaps were read again (neutral client, 3 s apart, robots.txt allows all): **200,964 URLs**. Data in `census/url-inventory/`
(counts `summary.json`; every non-wire URL `ledger-non-wire.csv.gz`; `standalone-dispositions.csv`; the probe `probe-manifest.tsv`; `inventory.py`
rebuilds it from the sitemaps). Every row's disposition is **undecided or proposed, never decided**. Shapes: wire `/DATE/slug` 185,389; local-section
stories 5,087; stories in **other sections** 5,959; events 1,477; people 1,147; tags 905; show episodes 501; standalone pages 411; show pages 42;
live blogs 3; odd shapes 42 (including `/podcast/...`).

**Gap probe (794 pages, all HTTP 200 but one URL with a space).** Origin by the census rule (canonical host, then source organization):
- `news` (385 URLs, 2016 to 2021): **67 of 100 WUWF** (about 258 stories). `florida-news` (4,810): 17 WUWF, 4 ambiguous, 79 partner (about 820 WUWF, range
  470 to 1,170, wide because it rests on 17 hits). `music-arts` (616): 7 WUWF (about 43). Odd sections (`civics-101`, `through-the-lens`, `america-250`,
  `eco`, `blog`, `live-event`, `election-2024`, `arts`, `science`; about 140 URLs): 40 of 45 WUWF. **So roughly 1,100 to 1,500 WUWF stories sit outside
  the sections the census sampled.** The earlier line "florida-news was a statewide partner" is true of most of it, not all.
- **The converter handles them.** 345 pages from those sections: 131 converted (126 clean, 5 review for NPR Pym scripts), 214 skipped (210 external, 4
  ambiguous), **0 disagreements between the converter and the census classifier**, 0 problems, deterministic. New: 18 stories carry JW Player and
  `wuwf.tv` video (click-to-load, no approval needed).
- **Update (2026-11-04, same day): the other sections were fetched whole, so these are counts, not estimates** (`probe-manifest.tsv`, every page 200,
  no blocks). `news` 252 WUWF of 385; `music-arts` 57 WUWF + 2 ambiguous of 616 (the estimate said 43); the nine small sections 116 WUWF of 132
  (`arts` 30, `science` 20, `civics-101` 14, `blog` 13, `eco` 11, `through-the-lens` 9, `america-250` 7, `election-2024` 6, `live-event` 6). **That is 425
  more WUWF stories than the local-section census covered, before `florida-news`**, which is being fetched in random order (138 of 4,810 so far: 27
  WUWF, 6 ambiguous, 105 partner; about 20% WUWF, so roughly 900 to 1,000 more). Converter on the 319 WUWF-host pages of the whole sections
  (`convert-full-strata-summary.json`): 315 converted (301 clean, 14 review), 0 exceptions, 0 problems, deterministic; 4 skipped as ambiguous.
  New findings in them: 5 stories (`science` "Skies of the Gulf Coast" and one `news` piece) have a YouTube address **split by Grove's own data**
  (the embed holds `https://youtu.be/FV4G`, the next paragraph begins `-xis2hM`): the converter refuses the short id and flags it
  (`embed.unsupported-link`); a person can join them, it is not guessed. 14 stories are bylined "News Service of Florida" and 15 "Staff report".
- **Final (2026-11-04): `florida-news` fetched whole** (all 5,598 pages of the extended fetch returned 200; no blocks). Of 4,810 pages: **1,008 WUWF, 189
  ambiguous, 3,613 partner or NPR**. Converter on the 1,197 WUWF-host pages: **1,008 converted (741 clean, 267 review), 189 ambiguous skipped, 0 exceptions, 0
  problems**, deterministic. A newer quote template, `/core/quote/BlockQuote.hbs` (5 stories), is now a plain quote (the quotation and its attribution
  arrive as one string; not split). WUWF stories by year are 2021 to 2026, none earlier.
  **Totals outside the local sections, all counted:** `news` 252, `music-arts` 57, nine small sections 116, `florida-news` 1,008 = **1,433 WUWF stories**, plus
  36 podcast episodes; with the local sections that is about 6,500 stories to migrate. Raw pages for every WUWF-host page fetched (2,072) went to the owner as
  `census-raw-005` to `-007`.
- **Wire-service copy that Grove calls WUWF's: decided (owner, 2026-11-04) — it migrates as WUWF's, "same rights as before".** Grove sets the source
  organization to WUWF on stories that carry a wire byline, so the origin check passes them. The converter's count over every page fetched is **300 stories:
  263 in `florida-news` (233 News Service of Florida, 30 AP) and 37 in `news`**, 26% of `florida-news`'s WUWF stories. They convert and import like any story;
  `origin.wire-byline` is a note (not a hold), so they can be found. Still true: 78 of the 515 sampled `florida-news` WUWF pages have **no source
  organization** (the classifier reads that as WUWF), and 67% of the section's WUWF pages have no byline.
- **Watch:** 4 converted stories are bylined "News Service of Florida" (a wire service) and 2 `florida-news` stories have **no source organization**,
  which the classifier reads as WUWF. Owner to say whether those are WUWF's to archive.
- **Podcast pages: converter built (2026-11-04).** `/media/episode/audio/PodcastEpisodePage.hbs` and `/media/show/audio/PodcastPage.hbs` (the 36 + 2
  `/podcast/...` pages fetched are all WUWF's) convert like radio episodes and shows, at their exact `/podcast/<slug>` addresses (the show path hook accepts
  them; `/podcast` is not reserved, only `/podcasts`). On the real pages: 30 episodes clean, 6 `review` (the `ecoheroes` episodes are hollow in Grove too:
  a title and a description, no audio, body or picture; new codes `episode.no-audio` and `episode.hollow-page`), both shows convert. **Grove's podcast feed
  address (`/podcast/<slug>/rss.xml`) has nowhere to go yet** and is reported as `show.feed-link-not-kept`: podcast apps subscribe to it, so the feed
  needs a decision before cutover.
- **`SectionPage` (16) and `Page.hbs` (6) need no converter.** Read 22 real pages: `main` is containers holding promo lists and, on `/ap`, two
  iframes; there is no editorial text and no body. They are curated listings. `SectionPage` addresses (`/news`, `/local-news`, `/music-arts`,
  `/florida-news`, `/eco`, ...) are served by the generated section lists (a real page at an address wins over a list, so create no page for them);
  `america-250`, `civics-101`, `eco`, `election-2024`, `through-the-lens`, `wake-up` and `your-florida` are hub candidates if the owner wants a
  curated front (Unearthing Florida's hub exists). `Page.hbs`: `d`, `eb`, `testpage` look like tests, `ecoheroes` should redirect to
  `/podcast/ecoheroes`, `ap` and `wuwf-coronavirus-live-blog` need a read. Dispositions are in `standalone-dispositions.csv`.
- **Grove serves redirects that no sitemap lists, and they are not derivable.** Old `/post/<slug>` addresses answer 301 to the story's current address
  (3 of 3 tried), but the old slug is not the new one (`/post/delta-forecast-become-category-4-hurricane-it-approaches-gulf` goes to
  `/2020-10-06/delta-forecast-to-become-category-4-hurricane-as-it-approaches-gulf`: the old slug dropped words). The table exists only inside
  Grove, which has no export. **Our own stories link to them:** in the 131 newly converted stories, 5 of the 30 own-site links are `/post/...`, 3 go
  to bare wire stories and 9 to `/radiolive`; so a migrated story can carry a link that is a 301 on Grove and would be a 404 here. The full count
  needs the converted corpus. **Proposed:** at conversion time, resolve each distinct `/post/` link in a migrated story with one request (3 s apart,
  redirect not followed) and rewrite it to the target when the target is migrated; and use Search Console to find out whether outside sites link to
  `/post/` addresses at all (that is the only way to size the unlisted redirects).
- **Bug found and fixed in passing: episodes lost their text.** Radio and podcast episodes keep their text in `body`; the converter read `articleBody` for
  every page, so an episode's body came out empty with no report. The real `/2021-10-01` episode shows it; the tally confirms `body` on the 15 probe
  episodes. The existing episode test passed because it never looked at the content (it now does, and was mutation-checked: restoring the old key fails 3
  tests). **The 15 census episodes, and any episode already on staging, were converted by the old code: re-run the converter and re-import or repair
  them** (`repair-bodies.ts` skips a story whose words differ, so the bodies need a separate step). The raw pages are on the owner's computer.
- **411 standalone pages**, proposed (by name, not yet read): about 125 UWF event webcasts and 51 UWF Board of Trustees pages (UWF content: owner
  decision), 42 test pages (drop), 32 station-information pages (keep as standard pages), 20 schedule and weather pages (replaced), 16 section
  landing pages, 119 to read.

**Decisions (owner, 2026-11-04, after the SEO reasoning below).**
- **Wire stories: gone, not archived, not redirected.** Every sampled bare wire page carries a `rel=canonical` to the original publisher (0 of 70 WUWF), so
  search engines already treat the original as canonical; our copy earns nothing and a redirect would only pass equity to NPR. All wire URLs (bare
  `/DATE/slug`, and the partner and NPR stories under `news`, `music-arts`, `florida-news` and the local sections) answer **410 Gone** with a plain "no longer on
  wuwf.org" page (status 410, never a 200 landing page, which would be a soft 404). No redirect-out table is needed (the fetch recorded only the canonical
  host, not the link). **Exception 1:** a link inside a *migrated* story to a wire story we will not keep is rewritten at conversion time to the original
  publisher's address, or left as plain text (converter work, not built). **Exception 2:** the ambiguous WUWF-hosted copies (our canonical, another
  organization named; about 170 in `florida-news`) are decided separately. **Verify once:** Search Console "Page indexing" should list these as "alternate page
  with proper canonical".
- **Shows: one pattern.** `/show/<slug>` (older template) and `/podcast/<slug>` (from December 2021) are the same concept. Import with Grove's exact paths first,
  then consolidate shows and their episodes (about 580 URLs) to `/shows/<slug>` with permanent redirects in one deliberate step (the path-change redirect
  machinery exists). This reopens "migrated shows keep Grove's exact `/show/<slug>` address". NPR-distributed show pages (about 30 of 42) are not archived: 410.
- **UWF webcast and Board of Trustees pages (176): 410, with one archive page for the ones that still play.** 173 of 176 are shells under 30 words and 80 have no
  video at all; 65 embed `livestream.com` (a third-party service whose embeds may no longer play; unchecked). The pages with a working Vimeo or YouTube video
  (the CSV marks them `archive-page`) go on one archive page if UWF links to them (Search Console links report), otherwise 410. WUWF still streams UWF meetings
  (`bot-december-2025`, `bot91825`), so a small **webcasts collection** (event type, date, stream) is a justified *new feature*, separate from the migration.
- **Podcast feeds: serve a feed at the same address (owner, 2026-11-04).** Grove serves `/podcast/<slug>/rss.xml` per show and podcast apps and directories
  subscribe to it. The site must answer at the same address with the same `<guid>` for each episode (apps identify an episode by its guid; the audio
  address may change). Needs: read each old feed once to copy its guids, channel fields and categories; a feed route for a show; the audio in our storage.
  NPR-distributed shows' feeds are NPR's and are not served here (check first whether Grove serves any under the station's address).
- **Wire stories going forward: the CMS will import wire stories and let editors choose which to publish (owner, 2026-11-04).** This is new work, separate from the
  migration. Consequence for the 410 rule: a wire story chosen for publication is a *record*, and a record is looked up before any fallback, so the fallback
  "a bare `/YYYY-MM-DD/slug` that is not a record answers 410" cannot catch a published wire story. If the ingest gives published wire stories the same bare
  shape (the slug rule is the headline in kebab case), recent NPR addresses keep resolving; any other shape works too. Decide the shape before the ingest is built.
- **Link map built and applied (2026-11-04; owner-approved requests), now over the whole corpus.** `scripts/grove/resolve-links.ts` converted all **2,967 stories**
  (the 1,513 census stories plus the 1,454 fetched today), found 540 distinct own-site links, and asked Grove about the 401 that point at a wire story, an old
  `/post/<slug>` address or a story not in the migrated set (about 500 requests in all, 3 s apart, no errors). Answers: **189 partner or NPR stories** (link
  repointed to the publisher's address), **64 old `/post/` addresses that Grove 301s to a WUWF story** (repointed to its current address), 138 WUWF stories at their
  own address (left), **4 gone** (link removed, words kept), and **6 ambiguous** WUWF-hosted copies of partner stories (left; listed under `needsDecision`). Map:
  `census/url-inventory/link-map.json` (257 entries, 289 affected links, no page content). `convertStory` takes it as `linkMap`; `convert-corpus.ts` and `import.ts`
  take `--link-map <file>`: **run the importer with it.** The 1,500 local-section pages are covered (owner's zips, checksums verified).
- **Census checks on the owner's zips (2026-11-04).** The 1,566 census pages convert exactly as before (1,513 converted, 1,509 clean, 4 review, 0 exceptions, 0
  problems). **Wire bylines in the local sections: only 4 stories (all News Service of Florida)**, so the roughly 300 are in `news` and `florida-news`. **All 15 episodes had
  0 words under the old converter and now carry 13 to 92 words each**; 6 of them (`/show/14-59`, whose show page is a 404) have no audio (`episode.no-audio`). The body
  repair (`repair-bodies.ts`) now also fills a body that holds no words when the Grove page has some, and still leaves any story an editor touched
  (`filledEmpty`; unit and integration tests, both fail without the rule). **To do on the owner's side: dry run, then `--only` one episode, then all, against staging.**
  One existing repair test had been failing since the repair began counting picture alt text as words; it now tests what it was written for.
- **Fidelity check built, and it found a real converter bug (2026-11-04).** `check-fidelity.ts` compares each Grove page with its converted story, reading the page without the converter's
  code (paragraph by paragraph, pictures, audio and video, path, Grove id, title, date). Over the 2,936 real stories we have: **2,915 pass, 21 warn, 0 fail** (the warnings are Grove's own
  corrupted embed JSON and malformed addresses, which the converter already reports). With the old episode bug put back, it fails all 15 census episodes ("the page has 53 words; the story has none").
  **The bug it found:** an inline link's text came out with a literal `&amp;` ("Boys &amp; Girls Club of the Emerald Coast", 23 links) because the converter escaped text that Grove had already
  HTML-encoded. Grove's link text is HTML (of 5,437 inline links: 23 hold `&amp;`, 120 other entities such as `&nbsp;`, 522 real tags such as `<b>Donate Here</b>`); it is now read once and written
  back balanced (an unclosed `<b>` cannot leak). **75 of 2,936 stories change** (51 only in how text runs are split, formatting identical word for word; 15 lose a stray `&amp;` or `&nbsp;`; 9
  show `>>>` instead of `&gt;&gt;&gt;` or lose a typed `<h2 label=…>` that was visible as text), and none loses a word. **Grove's corrupted embeds (the `brightspot-cms-external-content`
  JSON in link text, 10 stories) are deliberately left exactly as they were**: reading them as HTML would have swallowed the video address inside, and the rule is never to drop what cannot be
  mapped; they still need the owner's decision (each could become an embed). Tests: 20 new (mutation-checked: restoring the old escaping fails 3).
- **Page metadata fixed (2026-11-04).** `generateMeta` was the Payload starter's placeholder: **every migrated story's browser title was "Payload Website Template"** (the importer
  sets no SEO title) and every share image the starter's. Now (`src/lib/seo/meta.ts`, pure, tested; `utilities/generateMeta.ts`): title = SEO title, else the story's
  title (the layout adds "| WUWF"); description = SEO description, else the dek, trimmed at a sentence or word to 160 characters (848 of 2,936 stories had longer);
  share image = SEO image, else the lead photo (a photo, a gallery's first, a video's poster), else the station logo; `og:type` article with published and modified times
  (Grove's modified date for a migrated story, never import time), authors and section; a large Twitter card when there is a picture; **`NewsArticle` structured data** on every story;
  shows get a canonical and a share image; the starter's "Payload Website Template" titles on `/search` and `/posts` are gone. Production build passes; checked on the served pages of a seeded story with a lead photo, byline and dek and one with nothing but a title: browser title, description, `og:` and `article:` tags, Twitter card, canonical and the `NewsArticle` data are right in both, and no placeholder appears anywhere. A story with no description gets the station's tagline from the default Open Graph, not nothing.
- **A migrated record's modified date is never the import time (review point, 2026-11-04).** `updatedAt` starts as the moment of the import, so `legacy.modifiedAt ?? updatedAt` would present an
  archived story as just updated (Open Graph `modifiedTime`, `NewsArticle.dateModified`) whenever Grove gave no modified date. One shared rule now (`modifiedAtOf` in `lib/seo/meta.ts`): a migrated
  record (any of the Grove id, path or modified date set) is dated by **Grove's modified date and nothing else**; with none, the metadata omits `modifiedTime` and the structured data uses the
  publish date. **The posts and pages sitemaps had the same mistake** (`lastmod: updatedAt`, which would have told search engines all ~6,500 migrated stories changed on import day): they now use
  `sitemapEntry` (the modified date, else the publish date, else no `lastmod`; never an invented one). In the real data all 2,936 stories have a Grove modified date, so this guards the case rather than
  fixing a seen one. Still true: an edit an editor makes to a migrated story in the new CMS does not move its modified date (it stays Grove's); that is a known limit, not a decision. Measured gaps that remain (2,936 stories): 63% of images
  have no alt text (3,442 of 5,455), 35% of stories no topics, 29% no byline (the "WUWF Staff" rule applies), 5% a short or missing description. **Proposed, not built:** a reviewed,
  suggest-only LLM pass for alt text, short descriptions and topic suggestions from the existing tags (see the owner's question 2026-11-04); needs the owner's approval and an API key.
- **Wire story address shape (recommended, awaiting the owner):** keep Grove's `/{YYYY-MM-DD}/{slug}` (no section, Central date, headline slug), with the origin in the
  `source` field, `rel=canonical` to the original publisher, left out of our sitemap and labelled "From NPR". Gives restore-by-address for chosen old stories and
  continuity for the cutover week; needs a collision rule (same headline, same day).
- **Show pages and feeds, read (2026-11-04; 44 pages and 2 feed files, owner-approved).** 43 of the 44 show pages answer 200 (`/show/14-59` is a dead sitemap entry:
  404). **`nprShow` is false on every one of them, including Morning Edition and Fresh Air**, so the converter's "NPR-distributed show is not archived" skip never fires
  for a show page: all 42 would import as WUWF productions (the record an underwriting agreement attaches to, listed in `/podcasts`). A syndicated program is not
  that. The pages are thin: a weekly schedule line (`mediaSchedule`, all 42 have one: "Weekdays 5:00 a.m. - 9:00 a.m.") and 0 to 13 words, except Acoustic Interlude
  (110) and the two podcasts. **Keep a page for every program (owner, 2026-11-04 reading of "keep pages for NPR podcasts")**: the local airtime is the value and a
  local search ("Morning Edition WUWF") lands there; link out to NPR's own page for the program; no NPR episodes. The 42 programs together are the station's weekly
  schedule, so they also seed the schedule feature. `census/url-inventory/show-pages.csv` lists them with a guessed kind (syndicated / station-made / unsure) for the
  owner to correct. **Built (owner approved the schema change, 2026-11-04): a `kind` on productions.** `original` (default) or `syndicated`, plus an optional `programUrl` (http or https; the
  program's own page, shown as "More about <program>"). A syndicated program has a page with its airtime and description; it has **no episodes** (a story cannot be filed
  under it: `posts.production` is limited to originals), **no funder** (a save with an underwriting agreement is refused by `hooks/syndicatedRules.ts`, whoever saves),
  and is **not in `/podcasts` or "More WUWF originals"**. Migration `20261104_182013_syndicated_programs` (adds the column with default `original`, so existing rows stay
  original; up, down and up tested on a row; `verify:migrations` passes). The converter marks the owner's list of 35 programs (`src/lib/grove/syndicated.ts`: the 29 I had
  guessed plus the six "from other providers": `big-bands-and-jazz`, `musical-gumbo`, `jazz-happening-now`, `florida-frontiers`, `capital-report`, `the-thistle-shamrock`);
  any other show is original, so a new show defaults to original. The importer saves a syndicated program with `kind` and `listed: false` and **corrects one already in**
  (staging may hold some from the sample). `programUrl` is not filled by the import (Grove has no such address): editors add NPR's page in the admin. 6 new integration
  tests (mutation-checked: removing the directory filter, the agreement rule or the episode limit fails exactly one each) and 2 converter tests. Production build passes; checked in a browser at 1440 and 390 px on a seeded Morning Edition (syndicated) and Acoustic Interlude (original): no overflow, the syndicated page shows only title, summary, airtime and the 44 px link out, and `/podcasts` lists only the original.
  **Feeds: only two exist** — `/podcast/the-ecominutes/rss.xml` (9 items) and `/podcast/acoustic-interlude-sessions/rss.xml` (19 items). No `/show/` page names a feed,
  and `ecoheroes` and `conversation-on` have no show page or feed (404). Format to reproduce: RSS 2.0 with `itunes:` tags (image 1400x1400, category, explicit,
  type `episodic`, author on one), `<guid isPermaLink="false">` equal to the episode's **Grove contentId, which every migrated story already keeps as
  `legacy.groveId`**, so guids cost nothing to keep; enclosures are NPR-hosted (`cpa.ds.npr.org`) today and will be our storage after the copy (apps identify an
  episode by guid, so the change is safe); EcoMinutes enclosures are WAV files (about 214 MB for one episode), which is heavy for subscribers and for storage egress:
  consider MP3 for new episodes (a decision, not made).
- **Still open:** NPR show pages (see below); Search Console access; what the 410 fallback does for addresses CDS has since removed.

### The 33-page sample (fetched 2026-11-02, `?_renderer=json`, all 200)

Two stories each from 2004 and 2010 (wire), two 2016 wire, `/local-news`, `/local-arts`, `/commentary`, `/people`, four
standalone pages (2016), two 2021 wire, `/florida-news`, `/local-news`, a community event, three `/show/…/DATE/…`
episodes, a section page, then 2026: two wire, `/florida-news`, `/local-news`, `/music-arts`, a show page, two
standalone pages, one event. Paths:

```
/2004-06-02/powell-iraq-wont-have-veto-power-over-u-s-troops
/2004-06-15/janus-adams-commentary-the-men-in-my-family
/2010-03-10/a-grim-eclipse-deb-amos-on-iraqs-sunni-exiles
/2010-03-15/u-s-mexico-vow-action-on-slain-americans
/2016-05-20/do-democrats-want-what-bernie-wants-or-just-what-bernie-has
/2016-05-25/sports-commentary-russia-clinches-gold-medal-for-cheating
/local-news/2016-05-02/what-is-a-hospitalist
/local-news/2016-05-19/florida-wildlife-conservation-urges-floridians-to-become-bear-aware
/local-arts/2016-05-01/pensacola-childrens-chorus-founders-to-be-honored-after-retirement
/commentary/2016-05-10/moving-downsizing-chickens
/people/ana-tintocalis
/wuwf-tv-grid
/uwf-bot-june-2016
/german-mba-graduation-2016
/creativity-and-innovation
/2021-10-16/high-schoolers-are-training-to-drive-18-wheelers-amid-a-shortage-of-truck-drivers
/2021-10-01/new-rule-shields-daca-from-being-challenged-in-court
/florida-news/2021-10-05/desantis-pushes-back-against-feds-on-threats-to-educators
/local-news/2021-10-04/uwf-symposium-probes-communication-in-the-21st-century
/community-calendar/event/runge-strings-orchestra-concert
/show/acoustic-interlude/2021-10-07/october-10-2021
/show/14-59/2021-10-05/october-8th-2021
/show/make-believe/2021-10-04/the-first-one
/wake-up
/2026-06-02/trump-signs-ai-safety-order-seeking-voluntary-review-of-new-models
/2026-06-17/scientists-warn-godzilla-el-nino-could-intensify-climate-impacts-worldwide
/florida-news/2026-06-08/florida-passes-emergency-rules-to-prevent-these-parasitic-flies-from-entering-state
/local-news/2026-06-12/photo-exhibit-honors-the-service-of-female-veterans
/music-arts/2026-05-28/cure-for-paranoia-tiny-desk-concert
/show/five-corners
/spring-2026
/q1232
/community-calendar/event/emerald-coast-quilt-show-2027-how-does-your-garden-grow-31-05-2026-09-41-44
```

### Grove migration: next steps

1. **URL census** from the 276 monthly sitemaps (no story pages): shapes and counts per year.
2. **Search Console and backlink data** for the syndicated-URL decision. **Pinned**: the owner has no access right now.
3. **Template census**: **approved by the owner**, **scoped to local news stories only** (the owner's instruction), to run
   in the same session as step 4 or after it (the fetch runs in the background while code is written). The session
   proposes its plan first and waits for the owner's OK. The universe, from the sitemap census: `/local-news/` 4,663
   URLs (2013: 105, 2014: 581, 2015: 515, 2016: 454, 2017: 302, 2018: 333, 2019: 388, 2020: 489, 2021: 328, 2022: 270,
   2023: 188, 2024: 203, 2025: 310, 2026: 196), plus the other WUWF-looking sections, about 425 more (`commentary` 106,
   `uwf-news` 77, `local-arts` 65, `unearthing-florida` 59, `local-politics` 51, `local-elections` 26, `local-music` 24,
   `local-economy` 8, `local-news-featured` 7, `local-music-scene` 2). Origin is still decided by
   `sourceOrganizationName` and the `canonicalLink` host, not the section. That is about 5,100 pages, so the session
   should propose either a stratified sample (for example about 1,500 by year and section, weighted toward 2013-2016) or
   the whole set (about 4.3 hours at one request every 3 s) and let the owner choose. **Not in this census** (so their
   templates are known only from the 33-page sample): standalone pages, show episodes and show pages, events, people,
   tags, and wire-style stories, including the check for any WUWF-originated story hiding under a wire-style URL; the
   owner can add them later. Seeded and deterministic; a manifest it can resume from (the sandbox restarts and kills
   background jobs); backoff on errors and a stop after repeated failures; robots.txt honoured; **no contact
   information of any kind in request headers** (a neutral User-Agent such as `WUWF-migration-research`); raw responses
   outside the repository. Output: a frequency table of every `_template`, enhancement type and field shape with example
   records, plus how many new types each extra 100 pages found (is the sample big enough?). Commit the tally and a small
   metadata manifest, not the raw JSON. Where the real archive will live durably is a decision for before the actual
   migration fetch. Coordination with NPR on volume is the owner's to arrange (the plan's Phase 0); ask before anything
   beyond this census.
   **Decisions and state (owner, 2026-11-02, after the plan was cross-checked against the final Migration Plan):**
   the census is the **stratified sample only** (about 1,500 pages, seeded, year x section, weighted to 2013-2016; the
   order is a prefix of the whole set, so extending later wastes nothing); the owner approved re-reading the monthly
   sitemaps (2013 on, plus two seeded months a year for 2004-2012 only to find legacy-probe candidates), about 10
   `?_renderer=styleguide` pages (the Migration Plan §3 says to compare the two renderers), a **legacy probe** of about
   135 pages outside local news (wire-style 2004-2012 and 2013 on, standalone pages, show episodes, show pages, events,
   people), and checkpoint commits of `census/manifest.jsonl` and `census/tally.json`. **Raw JSON is kept**, not
   discarded (the plan wants an immutable source archive): outside the repository, for WUWF-originated and ambiguous
   pages only, and delivered to the owner as zips (`pnpm census archive`; the Drive connector cannot take files from
   disk, so it was ruled out). The owner does **not** want NPR contacted about a template list for now. Tooling:
   `src/lib/census/` (pure, 87 tests, mutation-checked), `scripts/census/cli.ts`, `census/README.md`.
   **Result (2026-11-02): the main sample is complete and the owner stopped it at 1,500 pages** (of the 1,819 planned;
   the other 319, and the rest of the 5,086-story local set, were declined as adding little). 1,500 `?_renderer=json`
   pages and 10 `?_renderer=styleguide` pages, all HTTP 200, no retries, nothing blocked. Data: `census/manifest.jsonl`,
   `census/tally.json`, `census/plan.json`; the raw JSON is **not** in the repository (the owner holds
   `census-raw-001..003.zip`, 1,498 files: WUWF-originated pages only, gzipped, named by sha256 as in the manifest).
   - One `_template` only: `/core/article/ArticlePage.hbs` (every page). Each page is about 50 KB, most of it page
     chrome (navigation, tracking, share buttons), so the tally tags every typed object with its top-level region;
     read the `articleBody` region for story content.
   - **25 typed objects occur in `articleBody`** (23 real, plus 2 MIME strings, `audio/mpeg` and `audio/x-wav`, that the walker mislabels). Pages out of 1,500:
     Link 1,500; Image 1,500; Figure 1,454; HTML5AudioPlayer 1,341; InlineEnhancement 641; Enhancement 542;
     Carousel + GallerySlide 94 (**galleries exist**); IframeModule + ModuleType 32; AudioEnhancement 31; YouTubeUrl 29;
     TweetUrl 23; QuoteEnhancement 20; PymInteractive 15; RichTextHeading 13; VideoEnhancement 7 (+ HTML5VideoPlayer 4);
     YouTubeVideoPlayer 2; VimeoVideoPlayer, FacebookUrl and ExternalContent 1 each. Body HTML tags beyond p/br/b/i/sup:
     `a`, `iframe` 44, `ul`/`li`, `blockquote` 23, **`script` 25**, `u`, `img`, `font`, `ol`, one `table`, and a custom
     `brightspot-cms-external-content` element 6. Classes: `cms-textAlign-center` 50, `twitter-tweet` 23,
     `fullattribution` 9, `fb-post`, `pi_assets-image`. **No table block and no story-body promo type appeared** (the one `<table>` is plain HTML inside a rich-text chunk).
   - **Discovery has flattened**: new body types per 100 pages were 17, 4, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0; none in
     the last 495 pages. The three types seen once (ExternalContent, FacebookUrl, VimeoVideoPlayer) put the chance that
     the next page has an unseen type near 0.2%, so perhaps 7 of the ~3,600 unsampled stories carry one.
   - **Origin**: 1,488 WUWF-originated (canonical host `www.wuwf.org`), 12 not (WFSU 3, WUSF 3, FPREN 3, NPR 3), 0
     ambiguous. Local sections do contain a few partner and NPR stories, so origin must be read per page.
   - **Path dates**: 1,338 pages agree with both Central time and UTC, 157 only with **America/Chicago**, none only with
     UTC, 5 with neither (re-dated stories, 0.3%). Central time is right for new story paths. Primary section agrees
     with the path section on 1,407 pages, contradicts it on none, and is unreadable on 93.
   - Host and region detail, shapes (field combinations) and examples are in `tally.json`; `urlHosts` is the asset-host
     inventory the Migration Plan asks for.
   **Legacy probe (135 pages outside local news, all HTTP 200; owner-approved, 2026-11-02):**
   - **No WUWF-originated story hides under a bare `/DATE/slug` URL: 0 of 70** (40 from 2004-2012, 30 from 2013 on): 67
     are NPR, Fresh Air, WBEZ, WSHU or KFF Health News by organization and canonical host. **3 are ambiguous**: canonical
     on `www.wuwf.org` but another organization named, i.e. WUWF-hosted syndicated copy (`/2005-10-19/active-liberty-...`,
     `/2015-07-25/at-sandra-blands-...`, `/2017-11-03/house-republicans-...`). The Migration Plan's warning is real; the
     classifier calls them ambiguous and keeps their raw JSON for review. 70 is a small sample, not proof for 185,000 URLs.
   - **Six more templates** beyond `ArticlePage`: `/core/page/ContentPage.hbs` (24 of 25 standalone pages),
     `/core/gallery/GalleryPage.hbs` (1 standalone: `/gallery-one-abc`), `/media/episode/audio/RadioShowEpisodePage.hbs`
     (15 of 15 show episodes), `/media/show/audio/RadioShowPage.hbs` (5 of 5), `/event/EventPage.hbs` (10 of 10),
     `/core/author/AuthorPage.hbs` (10 of 10). Every probe page has a `contentId`. These templates were sampled only
     lightly (5 to 25 pages each): their field shapes are in `tally.json` (group `probe`) but **their inventory is not
     complete**; a census of them is a separate approval.
   - Body types in the probe's stories were all already seen in the 1,500; its body HTML adds `<em>` and `<hr>`.
   - Raw JSON for these is `census-raw-004.zip` (68 files: 65 WUWF-originated + 3 ambiguous).
4. ~~The `path` field and catch-all resolver~~ **Done (2026-11-02).** `path` (text, unique, indexed) on `posts` and
   `pages`; the rule is in `src/lib/paths.ts` (pure), the hooks in `src/hooks/pathHooks.ts`, the lookup in
   `src/utilities/resolvePath.ts`. Made once at first publish (stories: section + date in **America/Chicago** + slug;
   pages: `/slug`; the home page has none) and then fixed. A migrated record is saved with Grove's path as given.
   Only a publisher may set or change one; changing a live one writes a permanent redirect, repoints redirects that
   pointed at the old address (no chains) and removes one sitting on the new (no loop). Unique across both collections
   (checked in a hook: Postgres cannot do it across two tables, so two simultaneous saves of different kinds could
   race, which a staff-only editor and a single-writer importer make unlikely). `legacy.legacyPath` is write-once for
   staff and is no longer used for routing; `legacy.groveId` (Grove's `contentId`, unique) and `legacy.modifiedAt` were
   added beside it (second migration) so a re-run matches on the id and the source's modified date survives. A never-published draft previews at `/_draft/{collection}/{id}`, which
   works only with the preview cookie. Sections are a collection (`Local News`, ...): primary section only; secondary
   sections wait for the census. The time zone is consistent with the first 5 real pages (4 agree in either zone; one evening
   story is dated in Central time, not UTC); the census tally (`dates.pathDateMatches`) is the real test.
5. ~~Blocks derived from the census~~ **done** (see above). **Next: the converter with a fidelity report** (the plan's gate: no silent loss; an unknown
   `_template` is an explicit exception, never dropped; unmapped content kept as preserved HTML and flagged).
6. **Embed the stories** (added 2026-11-13): after the import, the body repair and the shows move, run `scripts/embeddings/backfill.ts` (dry run, then a small run, then all; `IMPORT.md` step 5). It powers "Related stories" and semantic search and needs the owner's go-ahead and an OpenAI key (see *Vector search and similar stories*). The importer sets `disableEmbedding`, so the import itself makes no provider calls.

**The block set is now derived from the census (done 2026-11-02, owner-approved).** What changed from the provisional set,
and why (counts are pages of the 1,500 sampled):
- **Media** gained per-use `caption`, `credit`, `source`, `altText` and `alignment` (`Figure`: 1,454 pages, 1,407 as the lead
  and 448 in the body). The file's own alt, credit and source live on the library record; a use overrides them.
- **Gallery** gained a carousel layout (the default), a description and a slide title (`Carousel`: 94 pages, 84 as the lead).
  The carousel is plain scroll-snap with no script: focusable, labelled, keyboard and screen-reader friendly.
- **Embed** gained optional `width` and `height` (`IframeModule`, 32 pages). **Posts on X and Facebook are link-only on
  purpose** (owner decision): a canonical address rendered as a static card with the post's text, never a live embed,
  because the live embeds load the platform's tracking script.
- **Audio** is new (`AudioEnhancement`, 31 pages), a block that points at the audio library.
- **Promo was removed** from stories (nothing in 1,500 pages). **Code and Banner were left as they are** (starter leftovers,
  not in Grove's data; removal was not confirmed).
- **Featured media and featured audio are story fields, not body blocks.** Grove's `lead` (1,491 pages: 1,407 photos, 84
  galleries, no video in the sample) becomes `featuredMedia`, a blocks field limited to one of Media, Gallery or Embed (the
  same definitions as the body). Grove's top-level `audio` (1,272 pages; `sources` with a type on 145, so some stories have
  more than one format) becomes `featuredAudio`. **No featured-video example exists** and the owner says it was rarely used,
  so a featured video is an Embed (a URL); revisit a `videos` collection only if that changes.
- **Unknown until the raw JSON is at hand:** Grove's `enhancementAlignment` values (the tally records only that it is a string
  on 388 pages) and which `Figure` fields are library defaults versus per-use. The converter maps known values and reports
  the rest; the block's alignment options are full, center, left, right.
The sanitizer, the embed allowlist and the administrators-only guard on preserved HTML are unchanged. If the data or the plan
is unclear, stop and ask the owner; do not build on a guess.

### The converter (built 2026-11-02): `src/lib/grove`

Pure code: a Grove page's JSON in, a story and a report out. It fetches nothing and writes nothing.

- `convertStory(page, { embedHosts })` returns `converted` (a `ConvertedStory` and a `StoryReport`) or `skipped` (`external`,
  `ambiguous`, `not-an-article`). Only WUWF-originated stories convert; origin is read per page with the census classifier.
- The story keeps Grove's exact `path`, its `slug` (the last path segment), `contentId`, both dates, the description (as
  `meta.description`, not a dek), the section and topics (as natural keys the importer resolves), and the byline (people
  keyed by their `/people/<slug>`). Block ids are deterministic, so a re-run changes nothing.
- The body is Grove's flat run of text chunks, inline link objects and block objects, rejoined so a paragraph a link
  interrupted is one paragraph. A real parser (`parse5`, added as a direct dependency) reads the HTML; empty paragraphs
  (Grove is full of them) are dropped silently, everything else is accounted for. Links to our own pages become relative.
- Every file the story uses is a `$asset` token with its URL in `assets`; `resolveAssets(value, idByUrl)` swaps tokens for
  library ids and **throws, naming the files, if any has none**, so a story cannot be saved pointing at nothing.
- The report says, per story, what was `preserved` (kept some other way, needs a person), `noted` (changed, nothing lost)
  or an `exception` (stop). `summarize()` rolls many reports up and lists the hosts that need approving.

Run it: `pnpm exec tsx scripts/grove/convert-corpus.ts --raw <unzipped census folders> --manifest census/manifest.jsonl
[--hosts a,b] [--out census/convert-summary.json]`. The saved summary is `census/convert-summary.json` (no page content).
`scripts/grove/rehearse.ts` saves a varied handful of real stories into the **local** database with generated placeholder
files, to look at them in a browser (it refuses any non-local database). It is a rehearsal, not the importer.

**Result on the 1,566 census pages:** 2,520 distinct images and 1,307 distinct audio files across 4,616 uses (so reuse is
real: the library dedupes about a third of uses); hosts are `npr.brightspotcdn.com` (3,285), `cpa.ds.npr.org` (1,317) and a
handful of others (`media.npr.org`, an S3 bucket, `www.90works.org`, ...). Mapped: 20,594 paragraphs, 1,853 links, 1,402 lead
photos, 732 body photos, 86 lead galleries, 94 embeds (47 YouTube, 26 X, 19 Facebook, 2 Vimeo), 40 audio blocks, 27 quotes.

**What needs the owner (the 21 stories to review, and the notes):**
1. ~~**Hosts to approve in Site settings**~~ Decided (2026-11-03): a built-in list loads without a click, every other public host embeds behind a click, so no per-host approval is needed. Three stories now carry a click-to-load note (`uw-media.pnj.com`, `storify.com`, `npr.brightspotcdn.com`).
2. ~~**Video files** (4 stories)~~ Done: there is now a video block and library, and those four convert to it.
3. **Two broken addresses** in the text (a link with a space in it); the words are kept, the link is not.
4. ~~**One script widget** (the 2026 voter guide's Electup map)~~ Done: it converts to a `widget` block (container `electup-embed`, `data-embed`, event `electup_load`, module script `static.electup.com/v2/app.js`) that runs in a sandboxed frame and loads without a click (Electup is on the built-in host list). The event script sits inside the container in Grove's data and runs before the module loads, exactly as it did in Grove; whether Electup's real script works inside a sandboxed frame is the one thing not yet tried.
5. **One table** is preserved HTML; **one junk image** (a browser-extension URL) was skipped and flagged.
6. **93 stories have no primary section and 116 have no byline**; the importer needs a rule (for example, derive the section
   from the path's first segment, and credit "WUWF Staff"). 61 bylines have a name but no `/people/` address.
7. `updatesCorrections` is empty on every sampled story; a story that has one is an exception (there is no corrections field).
8. 87 stories list a secondary section (almost always "Apple News", a distribution flag); noted, not migrated.

### Decided: which hosts an embed may load from (owner, 2026-11-03: option (c))

A **built-in list** (`DEFAULT_EMBED_HOSTS` in `src/lib/embeds.ts`: DocumentCloud, Datawrapper, Flourish, ArcGIS, the NPR player, Brightcove, Rumble, plus YouTube, Vimeo, Spotify, Apple Podcasts and SoundCloud) and the hosts an administrator adds in Site settings load **without a click**. **Any other public https host still embeds**, but behind a click-to-load card that names the host and says it may see the visit and set cookies; nothing is requested from it before the click. Addresses on private networks, internal names, `wuwf.org` and anything not https are refused on save. Posts on X and Facebook stay link-only cards. Every embed frame is sandboxed.

**Script widgets** (an election guide, a chart, a map that works by running a script) are a separate `widget` block, not free HTML: one https script on a public host, a container id, `data-*` settings and an optional event. The script runs in a frame we build, in a sandbox with **no `allow-same-origin`** (so no access to this site's cookies, storage or page). The host follows the embed rule: built-in or approved hosts (Electup is built in) load without a click, others after one. Only a publisher can add one or change its script or settings (the story save is checked, because Payload does not apply a block's field access inside rich text). **Trade-off the owner accepted:** an automatically loading widget tells its host that the reader visited, which is the one place this site contacts a third party without a click.

### The build program (owner, 2026-11-03: build everything except sponsorship and listening)

Deferred by the owner at the time: boards 5-6 (listening) and 16-20 (sponsorship; since built, see *Sponsorship pages*). Everything else is to be built, in this order (the order
follows what replacing Grove needs first, then the new products):

1. **Pages**: a template system for the `pages` collection and Grove's standard pages. **Done.**
2. **Shows and episodes** (boards 9, 10; Grove's `RadioShowPage` and `RadioShowEpisodePage`, about 500 episodes), the podcast directory. **Done.**
3. **Events** (Grove's `EventPage`, 1,474 community-calendar events) and the calendar list, **with public submissions and editorial approval. Done** (*Community calendar*).
4. **Author profile pages** (Grove's `AuthorPage`, 1,148) and the hubs for **Unearthing Florida** (11) and **The Voyager** (13). **Done** (*Phase 4*).
5. **Short video** (boards 7, 8). 6. **RadioLive** (12). 7. **Barefoot Mary and member feeds** (21-25: needs sign-in, entitlements and
private feeds, so it is designed with the owner before it is built). 8. **Cutover infrastructure**: redirects, sitemap (stories,
lists, live blogs, pages), search results, the gallery page, retiring the starter `/posts`. 9. Fill the homepage and hub slots left
out so far, as the features behind them land.

Grove's non-story pages in the census (65): standard content pages 24, radio-show episodes 15, events 10, author pages 10, radio
show pages 5, a gallery page 1: these are the shapes the program covers.

### Phase 4: author profiles and the two hubs (built 2026-11-03)

**Author profiles** (`/people/<slug>`, Grove's exact address). No board designs them, so, with the owner's go-ahead, the existing person
list (`/people/<slug>`, the same page as sections and topics) gained a profile header: portrait or initials, name, title, short bio, links,
then "About <name>" (the full biography, the same blocks as a story) above the stories. `contributors` gained `biography` (rich text,
publisher-only blocks guarded), `links` (http/https only) and a write-once `legacy` identity. The converter is `src/lib/grove/author.ts`
(`scripts/grove/convert-authors.ts` runs it over raw pages); the importer matches an existing byline-created contributor on the slug and
fills what it lacks, never a second record. Grove's story list on an author page is not carried: the site builds it from bylines (noted
in the report). **Checked on 4 real pages** fetched with the owner's go-ahead (robots.txt allowed, 4 s apart, neutral User-Agent, raw JSON
kept outside the repository): all clean. `authorSocialLinks` was empty on all four, so its field shape is a guess (an item with `href` and
a label); anything else is flagged `author.link-not-mapped`, never dropped. Grove's long biographies with inline links convert correctly.

**Unearthing Florida hub** (`/unearthing-florida`, board 11). The production is the existing `productions` record; episodes are its stories.
New: a `sites` collection (name, place, era, a map position in percent, because the map is schematic), and `site` and `period` on stories
(`period` is one of the board's seven; the era filter groups them: Native, Spanish colonial, British, American). The hub's settings are the
**Unearthing Florida hub** global (production, dateline, about, featured episode, then-and-now pairs). Everything else is derived and
tested (`src/lib/unearthing`): the featured episode (picked, else newest), timeline counts, collections (the episodes' **series**, so
"The Spanish missions" is a series), site pins, with honest counts ("No episodes yet", never the board's `[N]`). The map and era filter are
the one client component. The funding line comes from the production's underwriting agreements, as on a show page.
*Left out on purpose:* the place-tip form and the weekly email (no service behind either; nothing is faked), transcripts (not migrated).
The hub is at `/unearthing-florida` ahead of Grove's section list of the same name; its episodes and `/page/<n>` still go through the
catch-all route. **To go live:** create the production and sites, set `site`/`period`/series on episodes, then fill the global.

**The Voyager hub** (`/voyager`, board 13). A story belongs to The Voyager through its **publishing identity**. The **The Voyager hub**
global holds the identity, tagline, an optional featured story, up to six sections, an optional podcast, the staff list (a contributor
and the term's role) and the "Join the newsroom" call (link validated like the giving page's). The page: the featured story and a Latest
rail, each chosen section's two newest stories, a multimedia band (newest video stories and the podcast), staff, the join box.
*Left out:* the board's "One story, its own masthead, three places" panel, which explains the arrangement to WUWF staff on the design
canvas and is not reader content. The masthead prints the date in America/Chicago (AP month style), so the page refreshes every 10 minutes.
**To go live:** create the Voyager publishing identity and set it on its stories, then fill the global.

Both hubs return 404 until their global names a production or identity. Story saves refresh both. Browser-checked at 1440 and 390 px: no
horizontal overflow; the map and filter work with a keyboard-reachable button per pin. The site header and footer still wrap the Voyager
hub (the board shows only a thin WUWF bar); a themed layout per publishing identity is a later decision.

### Phase 7: Barefoot Mary and member feeds (boards 21-25; 7a built 2026-11-06)

**Owner decisions (2026-11-06, do not reopen).** Barefoot Mary's old app (Stripe tiers "descender" $8 and "patron" $25) was never live
and has no subscribers; that approach is **abandoned** for a normal WUWF sustaining membership that includes the podcast entitlement.
**There are no show levels** (owner, 2026-11-06, restated): the system is regular WUWF sustaining membership at a qualifying level. The
boards' "$25 Descender" level and its show perks are **not real** and are not built (the show support page's "thank-yous" field was removed). The
membership database sync waits: **entitlements are granted by hand** first. Phase 7 starts with 7a.

**Read before building (boards 21-25 of the canvas; the Barefoot Mary Design System artifact).** The show keeps its identity (Chenier
display, League Gothic labels, Lora body; amber on black) at `/shows/barefoot-mary`. Every episode, Field Note and archive item is **Free**
or **Members**. A WUWF sustaining membership at the qualifying level opens members' listening on every WUWF original (the boards say $8 a
month; the level is a station setting, see 7c). The boards' $25 "Descender" level is not real (above). The gift is made on WUWF's donation form with an attribution code. Board 25 is a signed-in account page: one private feed per
person per show, with a reset; NPR+ is activated from the same page.

**The split.** 7a: the show's look and public pages, members' content held back (built). 7b: audience sign-in (Supabase Auth in the site's
own project, passwordless) and the audience profile; members are **not** Payload users (Payload users are staff). 7c: entitlements, granted
by hand in the admin, and the claim. 7d: private feeds. 7e: the membership database sync.

**Recommended for 7c and 7d (given to the owner 2026-11-06; to confirm when 7c starts).** *Claiming:* Member Services records the
membership in the admin; the site emails a **single-use claim link** to the address on that membership; opening it while signed in (with
any email) links that account. Never link on an email match alone (CLAUDE.md). *Feeds:* podcast apps cannot sign in (they fetch on a
schedule with no cookies; Spotify takes no private feeds), so the account is the source of truth and a per-person, per-show secret feed
address is only the credential the app carries: issued from the account, revoked by a reset, and checked against the entitlement on every
fetch; enclosures are short-lived signed addresses, checked again. On wuwf.org a signed-in member just plays in the page.

**Built in 7a.**
- **Members-only work** (`lib/members/access.ts`, migration `20261106_220832_members_only`; existing rows become free). A story and an
  audio file have a `membersOnly` flag. Public reads of a members-only story get its title, teaser and picture but **not its body or
  featured audio** (field read access, **fail closed**: readable only when the flag is explicitly false; `forceSelect` makes every query
  read the flag; mutation-checked). A members-only audio file is not readable by the public and **its file is refused at its own address**
  (the file route applies the collection's read access). A members-only story may only carry members-only audio (`hooks/membersAudioGuard`).
  Members' episodes are left out of the public podcast feed. Every audio and archive file is served `Cache-Control: private` (a shared cache
  must never keep one). Staff with `content.write` see everything. The story page shows a "For WUWF members" panel in place of the body.
  **Hosted storage:** the bucket must stay **private** (files are served through Payload's route, which checks access); a public bucket
  would serve members' files directly. Check the site's Supabase bucket setting before marking anything members-only on staging.
- **Per-show themes in code** (`lib/shows/themes.ts`, contrast-tested pairs, 4.5:1): a show's `theme` select picks one; nothing about
  colour or CSS is stored in the CMS. Themed components read `--color-show-*` and `--font-show-*` (`components/Show/themed/`).
  League Gothic and Lora are self-hosted (OFL). **Chenier is not**: its web licence is unconfirmed, so display text uses Lora (owner).
- **Themed pages** (migration `20261106_221525_show_themes_archive`, up, down and up tested): the show home (board 21: hero, latest
  episode, episodes with Free/Members, Field Notes, Archive, membership band, about, funder panel in the station's neutral look), the
  episode or Field Note page (board 23, with the members' panel), `<show>/field-notes`, `<show>/archive`, and `<show>/support` (board 24:
  the station's levels from the Support page settings, the show's own questions, a link to WUWF's donation form with the
  show's attribution code; validated like the giving page's links). A Field Note is a story of the show that is not an episode, with a
  type (essay, primary source, analysis, interview, deep dive). `archive-items` is a new upload collection (PDF, image, audio, text; drafts):
  the catalogue is public, a members-only item's file has no address for the public and is refused at its own.
- Tests: `tests/int/members-only.int.spec.ts` (8), `tests/int/themed-show.int.spec.ts` (6), unit tests for the rules, themes and sub-paths.
  Checked in a browser at 1440 and 390 px with scratch demo content (not committed): no duplicate ids, and the members-only body never
  appears in the HTML. Field Notes take the story's normal address (`/<section>/<date>/<slug>`), not one under the show: only
  episodes move under `/shows/<slug>`. (A header-logo overflow at 390 px reported in this session was an artifact of a stale server whose stylesheets a rebuild had replaced; on a correctly served build the logo is 85 px wide with or without its image. Stop a server before rebuilding: `lsof -i` did not see it here, `pkill -f next-server` did.)

**Seasons and episode numbers (built 2026-11-06, after 7a).** `seasons` is a collection (a show, a number used once per show, a title such
as "Tunnel Vision", a one-line summary, an optional picture; drafts). An episode picks one of **its own show's** seasons, an episode
number (0 allowed, used once per season among full episodes) and a type (episode, trailer, bonus; trailers and bonus episodes may repeat a
number). Pure rules in `lib/shows/seasons.ts` ("Season One", "Ep. 2", grouping, which season is airing); the save rules in
`hooks/seasonRules.ts`. The themed show home groups episodes by season (newest season first, trailer then episode order then bonus;
episodes with no season last) and says "Now airing · Season One · Tunnel Vision" for the season holding the newest episode, using its
summary and picture; the episode page's breadcrumb reads "Episodes / Season One / Ep. 2"; the plain show page shows "Ep. 2" too. The
podcast feed carries `itunes:season`, `itunes:episode` and `itunes:episodeType`. Migration `20261106_223920_seasons` (up, down and up
tested; its `down()` drops the stories' season keys with `IF EXISTS`, since dropping the table already took them). Tests:
`tests/int/seasons.int.spec.ts` (4), `lib/shows/seasons.test.ts`, a feed test. The themed home lists up to 300 episodes. Not done: the
board's large watermark season numeral (decoration), and filling seasons or numbers from Grove (not checked whether its episode data carries them).

**Podcast feed settings per show (agreed with the owner 2026-11-06; to do before any show's feed is submitted to Apple or Spotify, and
before the two Grove feeds move).** One small "Podcast feed" group on the show: Apple category (required for a listing; today there is none),
explicit (today always false), and feed type, episodic (newest first: Acoustic Interlude Sessions, EcoMinutes) or serial (heard in order,
by season: Barefoot Mary). Today every feed says `episodic` (`lib/shows/feed.ts`). **Nothing is live:** Barefoot Mary has no feed in Apple
Podcasts or Spotify from its old app or any host (owner, 2026-11-06), so no `itunes:new-feed-url` hand-over is needed for it; the two Grove
feeds keep their addresses (`/podcast/<slug>/rss.xml`). Seasons are optional: shows with dated episodes (Acoustic Interlude's weekly
airings) leave them empty and keep today's date order. If an unthemed show ever uses seasons, move the season grouping into the plain
show page too (today only the themed page groups; the plain page shows "Ep. 2" labels in date order).

**7b, audience sign-in (built 2026-11-06).** Passwordless email sign-in with Supabase Auth on the site's own project; Resend is
WUWF's mail service (owner). **Design:** Supabase sends the sign-in email itself through Resend's SMTP, so the site holds **no new
secret** (no Resend key, no service-role key): it uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
already set on Vercel (Preview: staging; Production: production). Code: `lib/audience/` (rules, the `AudienceAuth` interface, the
Supabase implementation, the request flow, the session refresh), `app/(frontend)/account/` (`/account`, `/account/sign-in`,
`/account/confirm`), `collections/AudienceProfiles.ts` (one per Supabase user id; **no email address**; readable by membership staff
only; never created by hand; migration `20261106_232627_audience_profiles`, up, down and up tested). The sign-in form works without a
script, has a hidden field for bots, limits a client to 6 requests an hour and 20 a day (counted under a keyed hash of its address in the
calendar's `submission-rate-limits` ledger, never the address or the email), and answers the same whether or not an address has an
account. The emailed link returns to `/account/confirm` (built from the deployment's own address, never the Host header), which takes only
the sign-in link types, goes on only to a path on this site (remembered in a one-hour cookie), and records the sign-in. The proxy renews
sessions on `/account` pages only (Supabase rotates refresh tokens; a page cannot save cookies), so the rest of the site stays cacheable.
`/account` is reserved (Grove has no such address). The sign-in page carries the **UWF IT-04 notice** (`components/Account/PolicyNotice.tsx`,
the Portal's wording and its local copy of the policy, `public/policies/`). Tests: `tests/int/audience-sign-in.int.spec.ts` (8, with a fake
in place of Supabase), `lib/audience/rules.test.ts`. **Not tested against Supabase itself:** no real sign-in has been made; that needs the
settings below.

**7c, members' listening (built 2026-11-06).** *Owner's model (do not reopen):* a regular WUWF sustaining membership at the
station's qualifying level carries members' listening (members-only episodes, Field Notes and archive files on every WUWF original);
**no show has a level of its own**. *Decisions:* claim emails are sent by the site through Resend (owner, option a); access continues
**14 days** past the end date (card retries); only `membership.manage` (the Membership role, administrators) can grant (Claude's judgment,
owner delegated).
- **Records** (`collections/Memberships.ts`, admin "Membership → Members' listening"; migration `20261106_234554_memberships`, up, down and
  up tested): name, the address on the membership, end date, source (`manual` now, `sync` for 7e), note, the connected account, and the
  claim (sent, works until, connected; only the **hash** of the link's token, never readable). Not the ledger: no gift, no payment.
- **The station's level** is one setting, *Support page → Members' listening comes with* (e.g. "a sustaining membership of $8 a month or
  more"), quoted by the members' panel, the show support pages and `/account`.
- **Claim:** ticking *Send the claim email when I save* emails a single-use link (14 days) through Resend's HTTP API (`lib/email/mailer.ts`;
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, **not yet set on Vercel**: until they are, sending says "email is not set up" and saves nothing).
  `/account/claim?token=…` (no-referrer) shows which account the membership will connect to; the **button** connects it (a mail scanner
  opening the link claims nothing). The account the link is opened in is connected, whatever address it signed in with; never an email
  match. A new link cannot be sent for a connected membership until staff clear the account.
- **Access** (`lib/members/entitlement.ts`, `lib/members/claim.ts` → `hasMembersListening`): the one check every members' read goes through.
- **Unlocking** (7c-2): public story pages stay cached; the members' panel links to `/account/listen/<id>` (private, never cached; checks
  the membership each request; `lib/members/listen.ts`), and members' audio and archive files go through `/account/files/<library>/<id>`,
  which checks again and redirects to a **10-minute signed address in the private bucket** (`lib/members/files.ts`; streamed from disk in
  development). Tests: `memberships.int.spec.ts` (9), `members-unlock.int.spec.ts` (7, mutation-checked), unit tests.
- **Not done:** audio *blocks inside a body* that point at a members-only file still use the staff-only file address (only the featured
  audio is rewritten); a members' Field Note's own address shows the panel with a "Sign in to read" link, as an episode does; staff have
  no list of "claims not yet used" beyond sorting by the claim fields; the claim email's wording is for Member Services to confirm.
- **To try it on staging:** set the Supabase settings below and `RESEND_API_KEY` / `RESEND_FROM_EMAIL` (Preview) on Vercel, fill *Members'
  listening comes with*, mark an episode and its audio members-only, add a membership with your own address and send the claim.

**7d, private member feeds (built 2026-11-07).** A member with members' listening gets, per show that has members-only episodes,
a private feed `/feeds/<show>/<token>.xml`, shown on `/account` (board 25: copy button; Apple Podcasts, Overcast, Pocket Casts buttons;
reset). **Spotify is not offered**: it takes no private feeds (the board showed it). NPR+ activation is not built. The token is
`<profile>-<version>-<signature>`, signed (HMAC, key derived from the site secret) over profile, show and version, so **nothing secret is
stored** and the address can always be shown again; *reset* raises the version (`member-feeds` rows exist only after a reset; migration
`20261107_002936_member_feeds`, up, down and up tested) and every earlier address answers **410**. The feed carries every published episode
(season and episode tags included); a members-only episode's enclosure is `/feeds/<show>/<token>/audio/<id>`, which checks the token, the
membership, and that the audio is the featured audio of a published members-only episode **of that show**, on every play, then gives a
10-minute signed storage address. A **lapsed** member's feed keeps working with the free episodes only and says why; its members-only audio
answers 403. Feeds are `private, no-store` and `noindex`. `/feeds` is reserved (Grove had none). Code: `lib/members/feeds.ts` (pure),
`lib/members/feed-service.ts`, `lib/members/deliver.ts` (shared with 7c's file route). Tests: `member-feeds.int.spec.ts` (7, the reset guard
mutation-checked), `feeds.test.ts`. **Checked over HTTP on a production build** against a database built only from the committed migrations:
feed 200 RSS, private and noindex, members' enclosure through the member route, its audio 200, a tampered address 410, the same file at its
public address 403. *Known limits:* a lapsed-then-renewed member's app picks the members' episodes up again at its next fetch; feed
fetches are not counted (`feed_activated` in `ANALYTICS.md` is not wired); the per-show feed settings (Apple category, explicit, serial)
above still apply to these feeds too.

**Supabase settings the owner sets (dashboard; nothing in the repository can).** On `wuwf-site-staging` now, the same on `wuwf-site-production` at go-live:
1. *Authentication → Emails → SMTP settings:* custom SMTP on; host `smtp.resend.com`, port `465`, username `resend`, password **a Resend
   API key** (create one with sending access only, for the verified wuwf.org sending domain; the Portal's `RESEND_FROM_EMAIL` shows which
   domain is verified); sender address on that domain (suggested `no-reply@`), sender name `WUWF Public Media`.
2. *Authentication → Emails → Templates,* both **Magic link** and **Confirm signup** (a first-time address gets the second): the link
   must be `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. Suggested subject "Your WUWF sign-in link"; body: "Use this link
   to sign in to wuwf.org. It works once and expires in an hour. If you did not ask for it, ignore this email." (owner to confirm the words).
3. *Authentication → URL configuration:* Site URL = the staging site's address; Redirect URLs: `https://wuwf-site-*-wuwf.vercel.app/account/confirm`
   (previews; Vercel's addresses for this project) and the stable staging address + `/account/confirm`. **If the return address is not on this
   list, Supabase swaps in the Site URL and the emailed link breaks.** Production at go-live: `https://www.wuwf.org/account/confirm` (or the final host).
4. *Authentication → Rate limits:* emails per hour (Supabase's cap for the whole project; with custom SMTP it can be raised) to what member
   sign-ins need; the one-link-per-address-per-minute default can stay.
5. Leave *Allow new users to sign up* on (the first link makes the account).

**Found on the way:** (1) the community calendar's public submission form collects names and emails but does **not** carry the IT-04 notice
(CLAUDE.md says every such page must). `PolicyNotice` can be added to it in one line. (2) **Fixed:** that form's error messages and red field borders used `var(--on-air-red)`, which does not exist (the token is `--color-on-air-red`), so errors showed in black; both forms now use `text-on-air-red` / `border-on-air-red` (4.58:1 on white).

**Left out of 7a on purpose (and why).**
- The board's navy "A WUWF original" strip **replacing** the station header: the site header lives in the root layout, so a show cannot
  drop it without splitting the layout (every route moves into a route group). The show's own section band sits under the station header.
  Owner's call whether the split is worth it.
- Share Your Story (listening is deferred). NPR+ activation
  (depends on NPR's system: find out how it works first). "Sign in", "Get your feed", "Playing from your members' feed" (7b-7d). Transcripts
  and "related archive items" on the episode page. Podcast-app buttons and the show's own podcast feed link.
- The amount picker on the support page (the gift is chosen on WUWF's form). Nothing on the support page promises a feed until 7d exists.

**Owner to confirm:** the members' panel wording ("This episode is for WUWF sustaining members…"); the Chenier licence (or keep Lora); the
header-strip layout split; whether a members-only story should exist on staging before 7b (today nobody outside the staff can read it).

### Admin sidebar and look (2026-11-19)

Owner asked for a clearer admin hierarchy, a two-level sidebar, one Network screen and the brand's tokens and logo. Rules are in `CLAUDE.md` -> *The admin: sidebar and look*.

- **Sidebar:** one tree (`src/lib/admin-nav.ts`) replaces the groups listed under *Admin organization* below: Stories, Pages, Shows & series, Events (Community calendar; RadioLive), Organize, Media library, Sponsorship, Members & accounts, System, Site settings. A custom `Nav` draws two levels; `plugins/adminNav.ts` sets each entity's group and sorts the config so the dashboard matches. "Users" is "Staff accounts", Posts are "Stories", Network stories are the "Network queue". Settings moved to their domain (Sponsorship settings under Sponsorship). Not built: the in-tree split of Pages by page set (sponsor, giving) as filtered links; nothing needs it until phase 4.
- **Sidebar follow-up (owner feedback, same day):** headings start closed and open only for the page being shown (or a saved choice), and a sub-heading is level with its sibling links with only its children indented (it had been indented itself, with its children level with it). Rule and tests: `startsOpen` in `lib/admin-nav.ts`.
- **Network queue** is the one Network screen (the list view of `network-items`), rebuilt: counts, source dropdown, thumbnails, paging, bulk actions, a confirm before Dismiss, one "Publishing is not available yet" banner. **Checked in a browser against seeded rows** (keep, bulk dismiss, a mixed bulk keep, paging, the source filter, phone width, dark mode). **Not checked:** a thumbnail that loads (the sandbox cannot reach NPR's image hosts, so only the blank fallback was seen), and whether NPR allows hotlinking (still open, above).
- **Look:** Payload's variables come from the tokens (`lib/admin-theme`, `pnpm generate:admin-theme`), primary buttons are the station blue, the WUWF wordmark is on the sign-in screen and in the navigation, and the tab title and favicon are the station's. Light and dark mode both follow the tokens.
- **Pre-existing, not touched:** `PlayerProvider.test.ts` fails lint (`react/no-children-prop`), and `revalidateSiteSettings.test.ts` reports an unhandled rejection from plugin-seo during `buildConfig` (`Cannot destructure property 'slug' of 'global'`); both reproduce on a clean tree.

### Admin organization and merged collections (2026-11-03)

- **Sidebar groups:** Content (Posts, Pages), Media library (Media, Audio, Video), Editorial, Community calendar, Commercial,
  Pages & hubs (Home page, Support page, both hubs), Site settings (Header, Footer, Site settings), System (Users, Redirects,
  Forms, Form submissions, Search results). A test fails if a collection or global is left ungrouped. The page globals have live
  preview (mounted only inside the admin's preview frame, so cached pages stay static).
- **Live blogs are stories.** `live-posts` is gone: a live blog is a post with `format: live` and a `live` group (coverage, ended
  at, pinned), its introduction is the story's content, its description the SEO description, its start the published date. Its
  address stays `/live-updates/<slug>` (the one reserved first segment a record may use) and needs no section. Editors post
  updates from an "Updates" list on the blog; the Live updates sidebar link is hidden (`group: false`). Two migrations
  (`live_blog_story_fields`, `remove_live_blogs_collection`); both **refuse to run if any live blog or update exists**.
- **Events and submissions are one collection.** The form saves a draft event with `review.status = pending`; `submitter`,
  `review.*` and `submittedImage` are readable by staff only (field access; tested against the public API and the public pages);
  publishing (publishers only) approves. The abuse rate limit moved to a hidden `submission-rate-limits` ledger (a keyed hash and a
  time, cleared after two days) so an address hash is never kept in event version history. Two migrations (`event_review_fields`,
  `remove_event_submissions`); the second **refuses to run while any submission is pending or needs information**.
- **Still separate on purpose:** Media / Audio / Video (different processing and type limits; grouped as one library). Payload's
  folders feature (beta) could give one browsable library across them; not enabled.

### Community calendar (built 2026-11-03)

**What the live calendar and form do (read 2026-11-03, with the owner's go-ahead for those two pages; robots.txt allowed it).**
`wuwf.org/community-calendar`: 22 pages of about 10 cards, one card **per occurrence** (a nightly run is listed every night), grouped
under day headings; filters for 10 categories with counts, a from/to date and a keyword. The form
(`/community-calendar-event-submission`, posts to Grove's `/form/submit`): title; venue (name required); **one-time** (date, start,
optional end) or **recurring**: daily (first and last date, times), weekly (first and last date, **every N weeks**, one row per day with
its own times) or monthly (first/second/third/fourth/last weekday, every N months); up to 3 of 12 categories; description; a picture
(300 to 2000 px); price, a "free" box, pricing notes, ticket link; presenting organization with a for-profit / not-for-profit /
n-a designation; artist; and who is sending it (name, email required, "listener / venue / artist / promoter"). Its guidelines
(non-profit and government only, five days ahead, no direct solicitation) are on the page and are reproduced on ours verbatim.

**The Grove data.** Only a display string (`time`) survives on the page, in three shapes seen so far: one time
(`07:00 PM - 09:00 PM on Tue, 31 Dec 2024`), daily (`..., every day through Nov 08, 2026.`) and weekly
(`Every 40 weeks through Jun 28, 2025.` then `Saturday: 09:00 AM - 02:00 PM`). **A recurring run's start date is not in the text**:
the date it was submitted (the end of the address) stands in and the page then shows Grove's own wording. A monthly shape has **not been
seen** (only 10 events are in the census). **Anything not matching exactly is kept as Grove's words, flagged `needsAttention`, and has no
dates; it is never dropped and never guessed.** Grove's own recurrence is faulty: that Palafox Market listing ("every 40 weeks", ended
June 2025) still appears on its November 2026 calendar, probably why "Outdoors" shows 168 events; ours does not repeat it.

**Decisions made here (the owner may change any).**
- *Approval needs `content.publish`* (it goes live). Editors edit, ask for information (`needs-info`) or reject. No new permission was added to the shared contract.
- *The calendar reads two ways.* No dates picked: each event **once**, at its next date, with how it repeats and how many more dates ("what is coming up"). Dates picked: every occurrence, day by day. (Grove showed seven cards for one play.)
- *Past events keep their pages* and fall off the list when they end (an occurrence with no end time is taken as three hours). Past dates can be browsed with the date filter.
- *Public submissions are plain text only* (markup is refused), so nothing a stranger types is ever rendered as HTML; a Grove description is converted by the story converter and a block in one is an exception (held).
- *No CAPTCHA and no third-party script.* Honeypot + an HMAC-signed timing token (4 s to 6 h) + 3 per hour / 10 per day per address. The address is stored only as a keyed hash on the pending submission and **cleared after 48 hours** by the next submission; the submitter's name and email stay on the submission and are **never copied to the event**.
- *Pictures from the public are private.* They go to `event-submission-images` (staff only), are checked by their bytes (JPEG/PNG/WebP/GIF), size (4 MB, the platform's limit) and pixels, and are named by the server. **Approving does not attach the picture**: staff add it to the media library with alt text and credit, then attach it to the event.
- *Nothing is emailed.* No confirmation to the submitter, no alert to staff (sending live communications needs authorization). Staff find new ones in the admin: Community calendar → Event submissions, filter by status.
- *Categories* are a collection seeded by the migration with Grove's twelve and their ids.

**Not built / open.**
- **The UWF IT-04 notice**: the page carries a plain statement of what the form does with the data, not the official wording. **Needs the university's text** before production.
- **No board designs** the calendar, the event page or the form; they reuse the site's story-list and form patterns. Owner to review, or add boards.
- **Staff notification** of a new submission (email or a count in the admin); an **"add to calendar" (.ics)** download; events in the **sitemap**; the homepage events strip (the first-pass page had one); "report a problem with this listing".
- **The other 1,464 events** have not been seen: run `scripts/grove/convert-events.ts --raw <dirs> --show` over them as soon as they are fetched and read the `event.date-not-read` count. A monthly shape is the likeliest to appear.
- *Dev helper:* `scripts/dev/seed-events.ts` seeds upcoming events into the LOCAL database (the Grove ones are all past). It refuses a non-local database.
- The importer saves events (`import.ts`); an import already running uses the old code. Events whose pictures are not downloaded are held like stories.

### Live updates (built 2026-11-03; the data and the decisions behind it)

Grove has `/live-updates/<slug>`: one post that aggregates timestamped updates for a fast-moving event. The owner approved a
census of these pages on 2026-11-03 (same rules as the template census; `scripts/live-updates/probe.ts`; raw pages stay
outside the repository). **There is no listing page** (`/live-updates` is a 404); `probe.ts discover` reads the monthly sitemaps
for `/live-updates/` addresses, the scan of all 276 monthly sitemaps found **only three** (see below).

**How many (found 2026-11-03).** Reading all 276 monthly sitemaps found **three** live-update addresses in the whole archive:
`/live-updates/tropical-storm-isaias-updates` (sitemap 2026-10), `/live-updates/2024-election-live-blog` (2024-11) and
`/live-updates/the-d-c-effect` (2025-03). So the content type is small to migrate (three posts); the design question is the
tool WUWF will use for *future* events, not the archive. The other two pages have not been fetched yet; the approved census
covers them (about 10 seconds at the 3 s spacing).

**The data (one page examined: `/live-updates/tropical-storm-isaias-updates`, 628 KB of JSON).** Its own template,
`/liveblog/LiveBlogPage.hbs`: `blogLead` (a Figure), `blogBody` (the intro, in the same body structure as a story),
`posts` (all 143 updates) and `currentPosts` (the first 10), `pinnedPosts` (empty), **`liveEvent` (a boolean: live or ended)**,
`coverageStartTime`/`coverageEndTime` in its schema.org `LiveBlogPosting` data, `postsEndpoint` (an API the page uses to load
more), `ownerName`, an Atom feed link and Disqus comments (`meta`). Each update is `/liveblog/LiveBlogPost.hbs`: `postId`,
`anchor` (the permalink fragment, unique), `headline`, `body` (strings, inline links and the same Figure, YouTube, Pym and
ExternalContent objects as stories), `authors` (1 of 143 had one), `postedDate` and `postedDateTimestamp`, and `updateDate`
(30 of 143 differ from the posted time, so they were edited). Cadence: 143 updates over 14 days, up to 43 in a day, median
3 minutes between consecutive updates, 103 within 30 minutes of the one before. Bodies are 1,060 characters at the median and
5,764 at most.

**The existing story-body converter handles every body unchanged** (`bodyNodes` is now exported): 144 bodies (intro and 143
updates), 143 clean, 1 needs review (a `rumble.com` embed, another host to approve), 0 problems.

**Proposed design (the boards have none; owner has seen it and answered nothing yet):**
- Two collections: a **live post** (title, intro, lead media, status live/ended with an ended-at time, optional pinned updates,
  the exact Grove path, drafts and versions, SEO, legacy ids) and a **live update** (its own record joined to the post:
  headline, body in the story blocks, posted time defaulting to now, an edited time set when changed after publishing, a
  stable anchor unique within the post, optional bylines, legacy `postId`). Updates are separate records because editors
  post in bursts (a locked document would block them), every update would otherwise save a full version of the whole post, and
  a two-week event would be one enormous document.
- The reader page: updates newest first, each with a permalink and anchor, the posted time in Central time and an "updated"
  label; a clear Live or Ended state; `LiveBlogPosting` data for search engines; copy-link and share without third-party
  scripts. While live, the page asks for new updates every 30 to 60 seconds only while the tab is visible, announces them
  politely, never moves the reader's scroll; publishing an update refreshes the cached page at once.
- Editors: a quick "post an update" action with the post and time preset, usable on a phone.
- The homepage's emergency-coverage state (an existing rule) is what a live post would fill.
- Migration: update by update through the existing body converter, keeping each anchor, time and byline. Disqus comments are
  not migrated (a third-party tracker).
- **Decided (owner said go to the recommendations, 2026-11-03), and built that way:** editors post updates (a fast path), publishers open
  and end a blog; bylines are optional; comments are left out; polling our own endpoint is fine.
- **To confirm on Grove:** the 2024 election blog lists 10 updates and so does its own API, with no sign of a next page, so it is treated as
  complete. If the live page shows a "load more" button, tell the developer and the fetch will be redone with paging.

**Fixed 2026-11-03: unrendered template calls.** Grove's data holds `{{html('...')}}` in place of text in about 120 places (section
and topic titles, link text, and whole body chunks, where the call can open in one chunk and close after a photo). The converter
now unwraps them everywhere text is read; a scan of all 1,498 converted stories finds none left.

### The libraries (decided 2026-11-02)

Grove keeps a reusable library of audio, video and photos with metadata; `media` and the new `audio` collection are that
library here, and the upload field's "choose existing or create new" is how editors reuse an item. **The asset files are copied
into our own storage** (the NPR terms cover WUWF's audio and images, per the owner). Rules for the import: one record per
source file, matched on `legacy.sourceUrl` (unique, write-once for staff); the file's alt, credit and source go on the library
record; a story's caption, alignment and any differing credit or alt go on the use, and a conflict is listed in the fidelity
report. Credits that are not WUWF's are flagged for review, never copied silently. The asset fetch is a **separate approval**:
the asset hosts are NPR-controlled (`cpa.ds.npr.org`, `npr.brightspotcdn.com`), the volume is large, and the politeness rules
set for wuwf.org pages (neutral User-Agent, 3 s spacing) were approved only for those pages. Dry run first: a manifest counting
distinct files against uses.

### Pages and templates (decided 2026-11-02, design agreed with the owner; not built)

Staff edit pages whose **structure a developer has set**; they do not build pages from scratch. The boards show about 15 to 18
recurring section patterns and about a dozen templates. Plan: a new collection where the data shape differs (shows and
episodes with a per-show theme, events and performances, artists, videos, contributors); otherwise the `pages` collection with
a `template` select, each template a folder (its fields, its component) in one registry. Fixed structure uses **groups and named
tabs, not a blocks field** (Payload has no option to stop editors adding or removing blocks rows); `admin.condition` shows a
template's fields; `filterOptions` limits the blocks a template allows; shared section components are reused across templates;
per-page or per-show themes come from token sets checked with the contrast helpers. Never store HTML or CSS in the CMS. A look
the sections cannot make means a developer adds a section or template (a pull request), which then serves every page. The
design canvas has **no designs for** authors, events detail, standard pages, the gallery page, section and topic pages, search,
or RadioLive artist and performance pages: each needs a design or reuses the closest template. Board 25 (member feeds) is a
signed-in account page, not CMS content.

## Network content: queue, sources and sections (design agreed 2026-11-18; first slice built, publishing blocked)

**Status.** Designed with the owner, with a mockup (claude.ai artifact "Network Content Queue": queue, sources, section page), and the owner
approved building it (2026-11-18). **Built:** the collections, the poll, the queue view and the posts' original-address fields (list under *Built*, below).
**Blocked:** anything that needs a real CDS response (the site's own key, and the CDS host in the sandbox's allowed list): the story-body converter,
and therefore publishing a network story, which is why the queue's Publish button says "not available yet". Text below marked "from the CDS docs" was
read from the CDS documentation; the rest is the design. It extends the CDS sync row in `ARCHITECTURE.md` (Milestone 3) and the 2026-11-04 decision
above ("the CMS will import wire stories and let editors choose which to publish").

**Today in Grove (as the owner described it).** WUSF stories fill the Florida News section, NPR stories the NPR News section and FPREN stories Weather,
all automatically. Everything else is chosen by hand: Florida News Exchange stories are entered manually, and other NPR stations' stories are found
through a "network" tab in Grove's admin that filters by an ID. What that ID is has not been checked.

**What CDS provides (from the CDS docs at `npr.github.io/content-distribution-service`, read 2026-11-18).**
- Any authorized client can read all CDS data, including other stations' documents. A key is tied to one client; stations request one from NPR Member
  Partnership. The Portal's `NPR_CDS_TOKEN` is the Portal's client: **the site needs its own key**.
- `GET /v1/documents` filters by `ownerHrefs` (an Organization V4 service, e.g. `https://organization.api.npr.org/v4/services/s583`), `collectionIds`
  (NPR's own topics, programs and blogs; integers), `profileIds`, `ids`, and date ranges on `publishDateTime` and `editorialLastModifiedDateTime`
  (`from...to`). Default sort is newest first. `limit` is at most 300, `limit + offset` at most 2000, and there are **no cursors**, so results can shift
  between requests. Responses carry a `resources` array.
- **Notifications (webhooks) are for NPR's internal users, not member stations.** A station polls. A deletion is not announced: a document that has gone
  is found by asking for it by `ids`.
- **Restricted content:** a document or asset with `isRestrictedToAuthorizedOrgServiceIds: true` must not be republished, indexed, or linked to publicly
  by non-CDS users. A restricted asset inside an unrestricted story is hidden and the rest of the story is fine.
- **Attribution:** there is no attribution field. Credit comes from a document's `branding` links to Organization V4 records (`brand.displayName`).
- A station writes only documents whose ID carries its prefix (`PUT /v1/documents/<id>`), which is the outbound half of the existing CDS sync row.
- **Not documented there, so unverified:** whether the same story from two stations shares one document, what the terms allow for storing or caching
  documents (the docs defer to NPR's Terms of Use, which this session could not open), and any rate limits.

**Proposed design.**
1. **Two layers, not drafts.** A `network_items` collection holds every story the poll finds (headline, teaser, link, image address, credit, dates, CDS id,
   status `new` / `held` / `dismissed` / `published`, a link to the post it produced). It has no versions or drafts and is disposable.
   A `posts` record is created **only when a story is published** (automatically for sources set that way, by an editor for the rest), with `source` set to
   `npr` or `wire` and the existing rules: read-only except headline, teaser and description, re-pulled, never archived separately. Imported but unpicked
   stories are **not** draft posts: a draft means unfinished WUWF work, and candidates would bury the Stories list, add versions on every re-pull and
   make purging risky (posts carry redirects and embeddings). The candidate row stays thin, with no body. **The body is fetched from CDS at the moment of
   publishing** (`GET /v1/documents/<id>` with `transclude=layout`, plus its assets) and converted to the post's blocks, and later polls re-pull a published
   post from its source. That needs a converter from CDS document layout to Payload blocks, like Grove's (`src/lib/grove`); the CDS `story` profile and
   layout have not been read yet.
2. **Sources are records.** A `network_sources` collection: name, how its stories are found (CDS owner service ID or CDS collection ID),
   suggested section, and mode (publishes on its own, or waits in the queue). Adding a station is a record, not a deploy. WUSF, NPR and FPREN would be
   "publishes on its own"; other stations wait. **If WUSF and FPREN publish to CDS (unconfirmed) there is no feed adapter at all**; the Florida News Exchange
   is the one source that is not CDS, and it is not a source record at all (item 6).
3. **Polling.** A job per source asks CDS for documents changed since its last run (`editorialLastModifiedDateTime`), pages through them, and upserts by CDS
   id. **Documents flagged restricted are filtered out at ingest**: not stored, not shown in the queue, not linked; the poll log only counts them.
   A restricted asset inside an unrestricted story is dropped and the story kept. If a story already held (published or not) turns up restricted on a
   later poll, it is unpublished and an editor is told. A published story whose document has gone is
   flagged for an editor, not silently removed.
4. **Credit** comes from the document's branding links, looked up once per organization and cached.
5. **How a story appears: a full story page on wuwf.org, credited to the station that wrote it.** No link-out cards. Owner (2026-11-18): NPR's terms allow
   republishing other stations' work, WUWF does it daily, and that is the default; only documents flagged restricted are excluded (the CDS docs agree: with
   the flag missing or false, "the content may be syndicated or republished"). The page follows the "Wire story address shape" recommendation above
   (bare `/{YYYY-MM-DD}/{slug}`, `source` set, `rel=canonical` to the original publisher, left out of our sitemap, labelled with its source), of which **`rel=canonical` to the original publisher is
   decided (owner, 2026-11-18)**; the address shape itself is still awaiting the owner. Section pages list these stories like any other, labelled "From <station>".
6. **Florida News Exchange.** It runs on PRX's closed system and no public feed was found (Current report, undated). Ask WLRN or PRX for a station
   credential. Until then there is **no separate entry screen**: an editor makes an ordinary post in Stories with `source` set to "Wire or partner". A story typed
   in has already been chosen, so it never enters the queue. What posts lack today is somewhere to say where the original lives and who gets the credit:
   an original address (for `rel=canonical` and a source link) and a credit line, shown when `source` is not WUWF (the same two fields a published CDS
   story needs). If WLRN
   or PRX provide access, the exchange becomes an ordinary source record. Do not scrape it.
7. **Retention (proposed numbers; they would be Site settings, clamped like the embeddings thresholds):** untouched `new` items deleted after about 30 days;
   `held` items flagged stale, not deleted; `dismissed` items keep only their key so they stay dismissed; published items stay while published, and
   whether published network stories expire (then 410, as wire URLs do) is the owner's call. Deleting a merged group is all or nothing.
8. **Admin is Payload.** Both collections and a custom queue view in the same admin, built like `StoryEmbeddingsPanel` and gated by `requirePermission`.
   No separate admin application. A first version can be the stock list with filters and a "Publish" row action.
9. **Relevance ranking is deferred.** Surfacing network stories that match local news by meaning needs a vector per candidate and sends their text to a
   provider. The rule in `CLAUDE.md` stands (never embed NPR or wire stories), and restricted documents may not be indexed at all. Build the queue first,
   with ranking behind an interface; a first ranker that sends nothing out (recency, section, place names) is possible.

**Open questions (the owner, NPR, or a check in Grove).**
- Is the ID in Grove's network tab an Organization V4 service ID (likely, from `ownerHrefs`), a collection ID, or something else?
- Do WUSF and FPREN publish to CDS? If not, what do they offer?
- Republishing is settled by the owner (item 5). NPR's Terms of Use on storing and caching documents have not been read (`www.npr.org` was outside the
  sandbox's allowed hosts); the owner's practice suggests no blocker, but it is unchecked.
- **Decided (owner, 2026-11-18):** a network story's images and audio are **referenced where NPR hosts them, not copied**: it matches "re-pulled, never
  archived separately" (a pulled story or a newly restricted asset disappears with it), and audio is large. Images use the file's `hrefTemplate` (width,
  quality, format) through Next's image proxy, with the plain `href` as the fallback; audio plays from the enclosure address, choosing one that is not
  `tracked`, `sponsored` or `premium`, and only while `isAvailable` and before `streamExpirationDateTime` (all in `lib/network/cds.ts`). Still to check
  with NPR: whether those hosts allow hotlinking and keep their addresses stable (the CDS docs are silent). If not, copy images and keep audio referenced.
  `rel=canonical` to the original publisher is decided too.
- How many documents a day the sources deliver. With full pages, every auto-published story is a real post with a body, so volume affects storage and
  the Stories list.
- Whether the same story from two stations can be recognised (shared document id, canonical URL, or only by headline), so "merge duplicates" may be
  only "possible duplicate".
- A CDS key for the site from NPR Member Partnership, and which scheduler runs the poll (the Portal has Vercel cron jobs; the site's has not been checked).
- Florida News Exchange access through WLRN or PRX.

**Built (2026-11-18; migration `20261118_221136_network_content`, tests up/down/up on a scratch database; unit and integration tests mutation-checked):**
- `src/lib/network` (pure): CDS response parser with restricted filtering of stories and assets and the audio rules (`cds.ts`), RFC 6570 image
  templates (`uri-template.ts`), the poll's queries, cursor and re-check classification (`poll.ts`), the orchestrator with CDS and the database injected
  (`sync.ts`), status rules (`status.ts`), tombstones, retention numbers, the CDS client (`cds-client.ts`, needs `NPR_CDS_TOKEN`; unset means "not
  set up", never an error), and the original-address and credit helpers.
- Collections `network-sources` (publisher-only to change; a source is found by owner service ID or by collection ID, and is `queue` or `auto`) and
  `network-items` (thin, disposable, no body, created only by the poll; an editor may keep, release and dismiss, never mark published or gone), group **Network**.
- Posts: `original.url` (https only), `original.credit` and `original.cdsId` (unique) for a story that is not WUWF's. **`rel=canonical` points at the
  original publisher** for those stories; **the sitemap lists only WUWF's own** published stories.
- The poll: `lib/network/run.ts`, called by `GET|POST /api/network/poll` with `Authorization: Bearer $CRON_SECRET` (401 with no secret set). Per
  source: new stories since the cursor (`publishDateTime`), then a re-check of stories held (`ids`): refreshed, flagged "removed at the source"
  (published) or deleted (waiting), or, if they turned restricted, blanked to a tombstone and their post sent back to draft. Waiting stories first
  found over 30 days ago are deleted (constant for now, `lib/network/retention.ts`; Site settings is the plan). A failed source records the error and keeps its cursor.
- The queue: first a custom admin view `/admin/network-queue`; since 2026-11-19 the **list view of `network-items`** (see *Admin sidebar and look*): tabs with counts, a source dropdown, paging, bulk keep / dismiss, dismiss confirms.

**Not built, and why:**
- **The CDS story body converter, and so publishing** (by an editor, or on its own for `auto` sources). It needs a real CDS document's `layout` and the
  profiles around it (`story`, `renderable`, `html-block`, `text`, `image-gallery`...), which the docs describe only in part; the repo's rule is to derive a
  converter from real data, not from memory. **Needs the site's CDS key (NPR Member Partnership) and `content.api.npr.org` allowed in the environment's network settings** (it answers 403 from this sandbox).
  Until then an `auto` source only queues, and says so in the poll summary (`awaitingAutoPublish`).
- Scheduling the poll is **set** (owner, 2026-11-18): `apps/site/vercel.json` calls `/api/network/poll` every 15 minutes. It is **inert until the project has
  real credentials**: no `CRON_SECRET`, every call is a 401; no `NPR_CDS_TOKEN`, an authorised call answers `{"status":"not_configured"}` before it opens the
  database or the network (`tests/int/network-poll-route.int.spec.ts`). Vercel sends the `CRON_SECRET` header itself once the variable is set on the project. The
  Portal already runs a 5-minute cron on the same team, so the frequency is allowed there; if a deploy is refused for the cron, the plan is the cause.
- Section-page "From <station>" labels and the Track for external audio: they need a published network story to hang on.
- Read-only enforcement for `source ≠ wuwf` (only headline, teaser and description editable) that `ARCHITECTURE.md` lists as not built: only meaningful once network posts exist.
- Retention numbers as Site settings; a per-source "stale kept stories" flag; matching a station's `branding` link to a display name (Organization V4 lookup).

## Launch: initializing production (decided 2026-11-18)

**Decision (owner, 2026-11-18).** The site is not deployed to production until the MVP is ready, and its production database is **empty on purpose** until then.
A site migration is finished when it is applied to staging (`wuwf-site-staging`, `avgeycgvaufwdfzdsogi`; the preview build does it) and verified there with
queries. It is **not** applied to `wuwf-site-production` one at a time: production gets every migration at once, in order, with one `payload migrate` at launch.
(This is an exception to the root `CLAUDE.md` rule for the Portal's two live projects.) What makes that safe is that **a pushed migration is never renamed or
rewritten** (see *Lessons*): the launch run replays the same files staging already ran.

**State on 2026-11-18** (checked with the Supabase and Vercel connectors): `wuwf-site-production` (`gyidqxhkkhajfazbcrug`) has the `payload_app` role, the
`wuwf-site-files` bucket and pgvector, and **no tables** (no `payload_migrations`). Staging has all 55 migrations recorded. The Vercel Production environment has only
`OPENAI_API_KEY`, `PORTAL_LISTENING_SECRET` and the two public Supabase values.

**At launch, in order:**
1. Set the production values on the Vercel Production environment: `DATABASE_URL` (pooled, transaction mode), `DATABASE_MIGRATION_URL` (session mode), `PAYLOAD_SECRET`,
   `CRON_SECRET`, `PREVIEW_SECRET`, `PORTAL_IDENTITY_SECRET`, the `S3_*` storage values for `wuwf-site-files`, `NPR_CDS_TOKEN`, and the rest the Preview environment has.
   The `payload_app` password is in the owner's private files, not the repository.
2. Run `payload migrate` once against `wuwf-site-production`: from a machine with Postgres access (`DATABASE_URL=<session url> pnpm payload migrate < /dev/null`), or
   a one-off build with `MIGRATE_ON_BUILD=1` set for that build only and removed after. A sandbox session has HTTPS only and cannot do this.
3. Verify like staging: the tables exist and are owned by `payload_app`, `payload_migrations` has one row per file in `src/migrations`, pgvector answers, and
   `anon` and `authenticated` have no access to the new tables.
4. **Create the home page.** The migrations rename the owner's page where there is one, and production has none: the home page is the page with "Use as the home page" ticked (Pages → New, in the
   home set, then tick the box in the sidebar and publish; or `pnpm seed:home` from a machine that may write there, which today refuses anything but staging, so copy staging's page by hand or lift the guard for the launch). Without
   it `/` is a 404. Check `/` renders before pointing the domain.
5. Then deploy production. The first build reads the database, which is why the migrations come first (`scripts/vercel-build.sh`).
6. **Create the break-glass administrator at `/admin` before anyone opens the Website tool in the Portal.** Payload offers its "create first user" screen only while `users` is empty, and a Portal
   sign-in creates an account, so the first Portal sign-in closes that door for good. Give it **a station-controlled role address, not anyone's own or Portal email** (a Portal sign-in with an email an
   unlinked account already holds is refused, by design), and keep its password in the station's password manager. It is not linked to the Portal on purpose: a Portal sign-in replaces an account's roles
   from the Portal's grant, which would defeat the one account meant to work when the Portal does not. It cannot write listening queries (they need a named Portal person); nobody should use it day to day.
   Then, in the Portal, grant each editor the Website tool with their roles (admin access screen, Website tool), and have them use Open Tool: their own account is created on that first visit.

## Known gaps in what exists

- **Story embeddings are built but not run** (see *Vector search and similar stories*): until the backfill runs there is no "Related stories" section and search is keyword-only. The similarity floors are uncalibrated starting values.

- `posts-sitemap.xml` and `pages-sitemap.xml` read at most 1,000 records each; the archive is larger. Paginate (a sitemap
  index) before the migration.
- A redirect rendered inside a cached page is sent with the `Location` header **twice** (Next 16.3.3). Chromium, Node's
  `fetch` and curl follow it; the spec makes `Location` a single value. Fixing it means doing redirects in `proxy.ts`,
  which runs in front of the cache and would invoke a function for every page view on Vercel: the owner's call.
- Malformed percent-encoding (`/a/%E0%A4%A`) is answered 500 by Next in production (400 in development) before any
  of our code runs. Garbage URLs also each try to become an ISR cache entry (a disk write when self-hosting).
- The header's "News" link points at no page yet (a 404 on prefetch).
- **Uploads are stored on local disk** (`public/media`, `public/audio`), which does not persist on Vercel. A storage adapter
  (S3-compatible, with `clientUploads: true` and bucket CORS) is needed before the first real upload there; it comes with the
  site's own Supabase project. Payload's upload limits are raised for audio (150 MiB a file) in `payload.config.ts`.
- The story page plays audio with the browser's own controls; the persistent player is Milestone 2.
- Audio files are public by design. Anything private needs its own collection with its own access.
- `EmbedBlock` sets both `allow` and `allowFullScreen` on its frame, so browsers log "Allow attribute will take precedence".
  Harmless; drop `allowFullScreen` when next touching it.
- The article page is built to board 3 except: the "This story started with your answers" strip, the audio player
  button and the inline listening ask (listening and the player are later work), the sponsor message unit
  (Milestone 3), and the pull quote and inline audio excerpt (they have no editor block yet).
- The acknowledgment's "Our editorial independence policy" link shows only once an administrator sets the page in
  **Site settings**; until then it is absent rather than a link to nowhere.
- A story previewed as an unsaved draft does not show its acknowledgment (it resolves from the saved story).
- **"Listen live"** is in the header since board 26 was built (2026-11-07), shown only while Listen live has a channel.
- The header is entirely the Header global's (board 27, 2026-11-07): editors add links and menus as pages exist. Link only to
  pages that exist; WUWF Listens waits for the listening work.
- **Vercel's data cache outlives a deployment** (2026-11-07). The header's starting menus were in staging's database, but the preview
  kept serving the header cached while it was empty: a migration cannot revalidate a cache tag, and Vercel's tag-invalidation API
  covers its CDN cache, not this one. `getCachedGlobal` now keys each global by slug, depth and deployment
  (`utilities/getGlobals.ts`), so a new deployment reads fresh; saving a global still revalidates at once. Also: `claude/main` is
  the production branch and production builds are skipped, so merges do not deploy; previews of branches are what staging shows.
- **A migration pushed to a branch is applied to staging by its preview build** (`MIGRATE_ON_BUILD=1`), so it is not "unreleased"
  once pushed (2026-11-07). Deleting and regenerating one broke the next preview build ("type enum_search_kind already exists"): staging
  still had the first version. `20261107_043501` now replaces `20261107_042509` where it is recorded (drops only its header tables,
  deletes its record, keeps the shared search and footer objects so search rows keep their links). After a push, **never rewrite a
  migration: add a new one**. Test a migration change against staging's state, not only a fresh database.
  **Merging main is the same trap (2026-11-18, network content):** main's newer migrations made the pushed migration's schema snapshot stale, and it was
  regenerated under a new timestamp. Staging already had the first one, so the copy failed with "type ... already exists" and every later preview build of
  the branch went red until the original name was restored. If a merge makes a pushed migration's snapshot stale, **keep its name** (compare its `up()`
  with the pushed one: it was identical) and regenerate only the `.json`; if the SQL itself must change, add a second migration.
- **A test or a script that hangs at "Pulling schema from database..." is the same prompt** (2026-11-07): the test database still
  had tables from an earlier version of an unmerged schema change, and dropping them needs a confirmation nobody can give.
  Recreate the throwaway test database (`drop database wuwf_site_test; create database wuwf_site_test;`). A local script run
  through `getPayload` outside the tests also marks the dev database as pushed (a `dev` row in `payload_migrations`), after which
  `payload migrate` stops at a prompt: rebuild that database from the migrations.
- Dev-mode Payload pushes schema changes and can stop at an interactive prompt (a script then hangs silently with
  its database session idle). Rebuild a dev database with `pnpm payload migrate` on an empty one instead.

## Lessons (these cost real time)

- **The starter's access control is "any signed-in user".** Posts, Pages, Categories, Media and the redirects and forms
  plugins all shipped that way, so a sponsorship-only account could edit and publish stories and an editor could
  publish. Found in review, fixed with permission-based access and a publish guard, tested by role in
  `tests/int/editorial-access.int.spec.ts`. When adding or importing a collection, check its access first.
- **The Local API ignores access control unless told otherwise.** The Archive block listed unpublished stories to the
  public for that reason. Every public `payload.find` now states `overrideAccess`, and a test enforces it.
- **A cached global with no invalidation never changes.** Site settings (approved embed hosts, the independence-policy
  link) were cached forever; saving them now refreshes the tag and the rendered pages.
- **Never use one shared pnpm lockfile.** It made pnpm resolve the Portal's optional peers from the site
  (esbuild, sass, tsx, `@playwright/test`), changing how Portal tests were transpiled; 6 failed with empty error
  messages while every resolved version stayed identical. `sharedWorkspaceLockfile: false`. After any change to
  `pnpm-workspace.yaml`, run the **Portal's** full test suite.
- **Payload's slug field fails programmatic creates.** It generates the slug in `beforeChange`, after the
  `required` check; the admin UI hides this by pre-filling in the browser. `ensureSlug` (beforeValidate) fixes
  it. Use it on any collection with `slugField`.
- **`next/cache` throws outside a Next request** ("static generation store missing"). Use `src/lib/revalidate.ts`
  in hooks, never `next/cache` directly.
- **Next's dev server rewrites `AGENTS.md`/`CLAUDE.md` in the app.** `apps/site/CLAUDE.md` starts with
  `@AGENTS.md` for that reason; commit the generated block.
- **Template versions:** use the release tag's template, not `main`. `create-payload-app` could not be used (the
  git host's tarball URL is blocked); the template was cloned with git and `workspace:*` versions replaced with
  `3.92.1` by hand.
- **Starter lint:** `FlatCompat` crashes with eslint-config-next 16; the config uses its native flat exports.
- **Don't dump package sourcemaps** when reading dependency code; grep the `.js`, not the `.map`.
- **A public read of a story cannot populate agreements** (they are staff-only), so a page that resolves its
  own acknowledgment shows none, silently. Caught in a browser, not by a type or a unit test; the page now uses
  `getAcknowledgments` and a test pins the boundary.
- **Payload does not enforce a block's field-level access inside a rich-text field.** A block field marked
  administrators-only was writable by an editor until a test caught it. Enforce such rules in a collection hook.
- **The production build had been broken for two days and nothing said so.** The client-side Form block imports
  `RichText`, and `RichText` renders the Promo and Embed blocks, which read Payload; that put Payload and `next/cache`
  in the browser bundle. `pnpm dev` and every test were green, because story pages lived in their own route and never
  touched the Form. Merging stories and pages into one catch-all route exposed it in dev too. A client component must
  use `components/RichText/Plain`, never `RichText`. Run `pnpm build` before calling any change done.
- **`connection()` cannot be used in a route that has `revalidate`** (it throws `DYNAMIC_SERVER_USAGE`, a 500 in
  production with the message hidden). Do not try to make a miss uncached that way.
- **`pgrep -f` and `pkill -f` kill your own shell when the pattern is anywhere in the same command line**, even with
  the `[n]` trick, because the whole command is one `bash -c` string. Put the kill in its own command or a script file.
- **A migration can be missing while every test passes**, because dev and test databases push schema on their own
  and production does not. Two commits (header/footer globals, Site settings) shipped without one. Run
  `pnpm verify:migrations` after any schema change: it builds a scratch database from the committed migrations
  and fails if the config would still change the schema.
- **Test caching on a production build.** `pnpm dev` re-renders every request, so it cannot show whether a page
  refreshes. `pnpm smoke:agreement` does it properly.
- **A script run outside Next does not load `.env.local`, and Payload reads its secret when the config module is
  evaluated**, so load the environment, then `await import()` the config (see `scripts/seed-demo.ts`).
- **`next/image` only serves what `images.localPatterns` allows** (the starter allows `/api/media/file/**`). A new
  static image needs a pattern, or every page that renders it returns 500. Typecheck cannot catch it; a browser does.
- **`pkill -f` can kill your own shell** if the pattern is in the command line.
- **Payload 3.92.1 documentation is not reachable from the sandbox (payloadcms.com is outside the network policy), but it is in
  the repository:** `git clone --depth 1 --branch v3.92.1 https://github.com/payloadcms/payload`, then read `docs/`. Read the
  tag that matches the installed version. Things it settles: Payload does not reject an unknown block type, it drops it
  (so an importer must build only allowed types; the generated `Post` type enforces it); a draft skips validation, so
  `maxRows` and `required` only bite when a story is published (test them published); the Local API skips access control
  unless `overrideAccess: false`; a field's `access.update: () => false` discards a write silently; `payload.auth` and draft
  preview need a Payload session, which the Portal sign-in provides through its own signed cookie; there is no Supabase
  storage adapter (use the S3 adapter) and Vercel caps a server upload at 4.5 MB (`clientUploads: true`); `autoRun` must
  never be used on Vercel (Vercel Cron calls `/api/payload-jobs/run`, secured by `CRON_SECRET`); `slugField()` is experimental.
- **A rename prompt hangs `migrate:create` and dev push.** When a column is dropped and another is added in one change,
  Payload (Drizzle) asks "created or renamed?" and needs a real terminal. Answer it under a pseudo-terminal:
  `(sleep 14; printf '\r'; sleep 6; printf '\r') | script -qefc "pnpm payload migrate:create name" /dev/null`, then read the
  SQL. The same prompt stops the test run (it waits forever in "Pulling schema"): rebuild the database from the committed
  migrations (`DATABASE_URL=...wuwf_site_test pnpm payload migrate` on a fresh database), which also tests them.
- **Read the generated migration, then test it on rows.** The generated rollback failed (it dropped a foreign key that the
  `DROP TABLE ... CASCADE` before it had already removed), and a guessed internal name was wrong: Payload stores a version
  row's block path as `version.featuredMedia`, not `version_featuredMedia`. Both were found only by running up, down and up
  on a scratch database with old-shape rows and then reading the result back through Payload.
- **Run upload tests in the Node environment** (`// @vitest-environment node` at the top of the file): in the default
  jsdom environment Payload cannot detect the type of a Buffer and refuses it. Payload checks what a file really is, so test
  audio must be a genuine file (a tiny silent WAV).
- **Stop a server by its process id, and check it is gone.** `lsof` is not installed here, so `lsof -ti:3000 | xargs kill` did
  nothing; the old server kept port 3000 while a rebuild deleted its stylesheets, and the new one never started. The page
  looked unstyled. List with `ps -eo pid,args | grep -E "[n]ext-server"` and kill those pids.
- **The local Postgres stops when the sandbox idles.** `bash scripts/dev/pg-up.sh` brings it back (and makes it, in a fresh sandbox).
- **Real data finds what synthetic data cannot.** Grove galleries mix portrait and landscape pictures, so the carousel needed a
  uniform frame (`relative aspect-[3/2]`, image `absolute inset-0 object-contain`); a pasted video link arrived wrapped in a
  corrupted `<brightspot-cms-external-content>` element; an empty lead figure is "no picture", not an error. The census zips
  are the test material: unzip each into its own new folder outside the repository and run the corpus script over them.
- **Scripts that touch the dev database push schema in dev mode, and then `payload migrate` hangs on a question.** Payload marks
  a dev-pushed database; the next `payload migrate` asks "continue?" and, with no terminal, waits forever. Run such scripts with
  `NODE_ENV=production` (no push), keep `< /dev/null` on every Payload CLI call, and when it has happened rebuild the dev
  database from the migrations (drop, create, `payload migrate`).
- **Never put a kill pattern in a command whose own text contains the pattern.** `ps | grep migrate | xargs kill` killed the
  shell that contained the word "migrate" (exit 144) for the third time. Use `ps -eo pid,args | grep "[n]ext-server"` in a
  command by itself, then kill the pids.
- **Rolling back more than the last migration is untested.** `payload migrate:down` rolls back a whole *batch* (every migration
  that ran together); the older `paths_and_sections` rollback fails on a constraint already removed. The two newest
  migrations' rollbacks were fixed and tested (`DROP CONSTRAINT IF EXISTS` after a `DROP TABLE ... CASCADE`).
- A passing test proves little until you have broken the code and watched it fail. The underwriting tests were
  mutation-checked.
- **A background fetch runs only while a tool call is active, and a container restart kills it.** Make every long job resumable (a status file per item), start it with `nohup`, keep a
  watcher alive for it (a watcher is capped at 2 hours), and check `pgrep` after any restart; the disk survives, the process does not. The local Postgres also stops when the sandbox
  idles (`bash scripts/dev/pg-up.sh`; a missing database shows up as `ECONNREFUSED` from `pnpm build` and as every integration test failing in setup, not as a failure of the test you changed).
- **Another session's uploads are not visible.** Files shared with a different session are on that session's machine; ask the owner to upload them into the one that needs them
  (`/root/.claude/uploads/...`), and verify them against the owner's checksum file.
- **Grove's `nprShow` flag is false on every show page,** Morning Edition included; whether a program is syndicated is the owner's knowledge (`src/lib/grove/syndicated.ts`).
- **A published story with no body and no audio is refused on save** (a body is required unless audio or a picture carries it): a test that needs an empty body saves a draft.
- **Payload enforces a relationship's `filterOptions` on save,** not only in the admin picker (an episode cannot be filed under a syndicated program; tested).
- **A converter that reports "clean" has not shown the text arrived.** See the episode note: assert on content, not on a status count.

- **A "clean" report on an empty result is not clean.** Episodes read `articleBody`, which they do not have, and converted "clean" with no text for
  weeks because the converter's test and the corpus summary counted statuses and never looked at content. When a page type is added, assert that its
  text arrives, and check a real page's key names against the tally (`census/tally.json`, group `probe`), not a fixture written from memory.

- **Restricted blocks need a hook on every collection that takes story-style content.** The story body editor (`fields/bodyEditor.ts`) includes
  the script widget (publisher-only) and preserved HTML (administrator-only), and Payload does not enforce a block's own access inside rich
  text. `hooks/restrictedBlocksGuard.ts` does, and **every collection using `bodyEditor` must list its fields in it** (stories, live blog
  introductions, live updates, page bodies, show descriptions). `restrictedBlocksGuard.test.ts` fails when one is missing and
  `tests/int/restricted-blocks.int.spec.ts` walks them all. (A review of PR 325 found four were missing: an editor could have put a widget in
  a live update and gone live at once.)
- **A live page's refresh fingerprint must include the blog, not just its updates** (`lib/live/token.ts`, one function for the page and the
  endpoint): ending a blog, pinning and rewriting the introduction touch no update.
- **Adding a column with a default backfills every existing row with that default.** Adding `pages.template` made old layout pages
  `standard`; migration `20261103_040200` sets them back to `blocks`. When a migration adds a defaulted column, ask what the existing rows
  should be.
- **Keep only the newest Payload migration snapshot.** Each `.json` snapshot is a full copy of the schema (12-19k lines); `migrate:create`
  and `verify:migrations` read only the latest, and `verify:migrations` was shown to still catch a missing migration with the older ones
  gone. The seven intermediate snapshots made in this PR were dropped; do the same each time (delete all but the latest).

- **A `'use server'` file may export only async functions.** A sync helper (or a constant) exported beside an action passes every test and
  fails the production build. Keep helpers in their own module (`lib/events/secrets.ts`).
- **A `required` input inside a hidden section stops the browser sending the form** (it cannot show its message). Conditional fields get a visible
  asterisk but no `required` attribute; the server validates them. The one-time/recurring sections open and close with CSS (`group-has-[:checked]`),
  so the form needs no script.
- **Payload rejects a field name used twice in a group, even under different conditions.** Share one field and show it for several kinds.
- **The first user created in an empty `users` table gets every role** (break-glass administrator). A test that creates an "editor" first has an
  administrator. Build acting users with explicit roles and real ids (see `events.int.spec.ts`).
- **Upload tests need `// @vitest-environment node`**: under jsdom Payload cannot detect the file type of a `Buffer`.
- **A fake clock and a real database disagree.** `createdAt` is real time; a test that passes a 2090 "now" to code comparing against it (rate
  limits, clean-up) passes or fails for the wrong reason. Use real time and dates relative to today; mutation-check the guard.
- **Generated `down()` can fail:** it drops tables with CASCADE (taking the foreign keys) and then drops the foreign keys. Use `DROP CONSTRAINT IF
  EXISTS` for the `payload_locked_documents_rels` ones, and run up, down, up. (Four older migrations had it and were fixed 2026-11-03; the whole
  batch of 17 now rolls back to nothing and re-applies. A finished rollback also drops `payload_migrations`, so "relation does not exist" afterwards is success.)
- **Observed, not mine:** in one browser tab that navigates repeatedly, the header's background prefetch of `/` can stay open 10 to 25 s, so
  Playwright's `networkidle` never arrives (also on `/support` and `/podcasts`). A fresh tab settles in under a second. Wait for `load` in browser checks; worth a look
  if real visitors report slow first clicks.
- **`pkill -f '<words>'` kills the shell that typed it** when the command line contains those words. Stop a server by its pid or port.

## Staging demonstration content and the Voyager hub (2026-11-14)

- **`/voyager` was a 404 on staging** (checked on the preview): the hub answers 404 until it names a publishing identity, and nothing had ever set it (Unearthing Florida had a starting migration, The Voyager did not). Migration `20261114_040000_voyager_hub_start` creates "The Voyager" identity and points the hub at it when it names none (data only; `down` does nothing, like the Unearthing one). Applied to staging by the next preview build. Up, a second up and `verify:migrations` tested.
- **`pnpm seed:staging`** (`scripts/staging-demo/seed.ts`) fills staging so every feature has something to show: The Voyager (4 sections, 4 invented students, 7 stories, a video story, the hub's staff and join band), Unearthing Florida (6 map sites, places, periods and collections for its 5 real episodes only where empty, 3 more episodes, a Then & now pair), 4 short vertical clips (a generated 360x640 test video in `scripts/staging-demo/assets`), and RadioLive (3 artists, an upcoming and a recorded show). Everything is labelled "demonstration". Dry run by default, `--go` writes; it refuses any database that is not staging (`checkStagingDatabase`, production included); safe to run twice; it never overwrites what an editor chose; no revalidation, so hubs refresh within 10 to 60 minutes or on the next deploy. Rehearsed on a scratch database (all pages 200 with the content). **Not yet run against staging: it needs the staging `.env.local` (database and S3 variables) and the sandbox cannot reach hosted Postgres.**
- **Staging data applied 2026-11-14 (by SQL through the Supabase tool, not by the script; the sandbox cannot reach hosted Postgres or the file bucket).** On staging: the Voyager, Unearthing, RadioLive and Listens-ask rows above (no saved versions for them), **video and clip records with no file** (one 360x640 record, 4 published clips with captions: the layout shows, nothing plays; `pnpm seed:staging --go` uploads the real file onto that same record (found by its "no file attached" description, so the clips keep pointing at it; the stored name becomes `demo-vertical-1.mp4`) and adds the Voyager video story), and **Site settings > Portal address** (I first set it to a feature-branch alias; another session replaced it with the stable staging alias `https://portal-git-staging-wuwf.vercel.app`, see `apps/portal/CLAUDE.md`, "Vercel environments"; never put a feature branch's alias in a setting). On the **Portal preview project** (data rows only, no schema): the demonstration question `stagingdemo00001` now has its two questions; an open campaign `stagingcamp00001` linked to it (kitchen tables on, three prompts); the first consent text (the question's own default wording); and a public session `stagingevent0001`, **not listed**: the database lets only a coordinator list a public session, so a coordinator lists it in the Portal. All created by the fixture profile `10000000-...-0001`; close or delete them in the Portal when unwanted.
- **WUWF Listens asks** need a real open question from the Portal: `--listening-question <code>` places one story ask and one voice ask. Without it they are skipped. **A demonstration question is open in the Portal's preview project** (public code `stagingdemo00001`, listed on the hub, text answers on, closes in 90 days; added 2026-11-14 as one data row, nothing else): use `--listening-question stagingdemo00001`. Close or delete it in the Portal when it is no longer wanted. The `/listens` hub itself lists campaigns that are open in the **Portal** (preview project), which this site cannot create.

## Running things in a fresh sandbox

The sandbox is ephemeral; nothing below survives.

**Node.** The default is 22.22.0, one patch below the pinned 22.23.4, and `engine-strict` makes pnpm refuse it. Get
22.23.4 from the `node-linux-x64` npm package (`npm pack node-linux-x64@22.23.4`, unpack, put its `bin` first on
`PATH`), then check `node -v`. Do not loosen the pin.

**Postgres.** Postgres 16 is installed but not running, it will not run as root, and **it stops whenever the sandbox idles or its worker restarts** (the data directory survives, the process does not). There is no Docker daemon, so `pnpm db:up` (the repository's `docker-compose.yml`, the normal way) does not work here. One command does it all, from any state, and is safe to repeat:

```bash
bash scripts/dev/pg-up.sh
```

It installs pgvector if missing (the migrations run `CREATE EXTENSION vector`), makes the data directory `/var/tmp/wuwf-site-pg` once (the `postgres` user cannot read the session's scratchpad folder, so it must live elsewhere), clears the pid file, socket and lock file a killed server leaves behind (the next start refuses on any of them), starts Postgres on `127.0.0.1:5433` (trust auth, role `wuwf`), and makes three databases with the vector extension. Run it first in a session and again after any restart or `ECONNREFUSED`.

**Three databases, and which command goes against which** (Payload's docs: push mode is the default in development, "treat your local dev database as a sandbox", and "do not mix 'push' and migrations with your local development database"; Payload stops with a warning and a prompt that hangs a script if you do):

| Database | Used by | Schema comes from |
|---|---|---|
| `wuwf_site` | `pnpm dev`, `pnpm build`, scripts, seeding | Payload pushes the config to it in dev |
| `wuwf_site_test` | `pnpm test:int` (`vitest.setup.ts`) | built from the config, **not** the migrations: data a migration writes is not there |
| `wuwf_migrate` | `DATABASE_URL=postgresql://wuwf@127.0.0.1:5433/wuwf_migrate pnpm payload migrate` | the committed migrations, from empty |

Never run `payload migrate` against `wuwf_site` once the dev server has used it, and do not delete the `dev` row from `payload_migrations` to get past the prompt (that was a workaround, not the documented way). To test a data migration on rows, use `wuwf_migrate` (`DATABASE_URL=…/wuwf_migrate pnpm payload migrate:fresh --force-accept-warning < /dev/null` drops it and re-runs everything; without the flag it asks "Are you sure?" and aborts when there is no terminal). `pnpm verify:migrations` makes its own scratch database and needs none of this. Then `pnpm install` at the root and create `apps/site/.env.local` from `.env.example` (`DATABASE_URL=postgresql://wuwf@127.0.0.1:5433/wuwf_site`). Do not start `pnpm dev` while a migration runs.

## Needs the owner (cannot be done from the repository)

- **Pull request:** [wuwfdevs/portal#320](https://github.com/wuwfdevs/portal/pull/320) (the workspace conversion, the site
  and the Portal's contract halves) was **merged into `claude/main` on 2026-11-02**. Later work goes in new pull requests.
- **Vercel, Portal project:** set Root Directory to `apps/portal` (with "Include source files outside of the Root
  Directory" on, and Node 22.x). Until it is set, a build of this layout fails with `NEXT_NO_VERSION`; once it is set,
  builds of old-layout branches fail instead (previews only; the live deployment is never replaced by a failed build).
  The first preview build of this branch showed that the install step works with one lockfile per project.
- **Vercel, new project for the site:** Root Directory `apps/site`, Node pinned, own env vars.
- **Not yet confirmed:** that Vercel's install handles one lockfile per project in a pnpm workspace. Check the
  first preview build.
- **Supabase projects for the site: created 2026-11-02** in the WUWF organization, region `us-east-1`, separate from the
  Portal's two: `wuwf-site-staging` (ref `avgeycgvaufwdfzdsogi`) and `wuwf-site-production` (ref `gyidqxhkkhajfazbcrug`).
  **Set up 2026-11-03 (by Claude, via the Supabase and Vercel tools):** on both projects a login role `payload_app` (not a
  superuser; the tables it creates get no access for Supabase's public Data API roles) and a private storage bucket
  `wuwf-site-files` (150 MiB file limit). Supabase does not let the `postgres` role's password be changed from SQL, which is
  why the app has its own role. Its password is in the session's private files, not in the repository.
- **Vercel project `wuwf-site`** (id `prj_YaSfN6SHJtDLj8Pf6nAQERO8hqbL`, WUWF team): Root Directory `apps/site`, linked to
  `wuwfdevs/portal`, build command `bash scripts/vercel-build.sh` (applies committed migrations before building **only** when
  `MIGRATE_ON_BUILD=1`, which is set for Preview only), region `iad1`, Vercel sign-in required for previews.
  Preview env set: `DATABASE_URL` (staging, pooled, port 6543), `DATABASE_MIGRATION_URL` (staging, session mode, 5432),
  `MIGRATE_ON_BUILD`. The three secrets (`PAYLOAD_SECRET`, `CRON_SECRET`, `PREVIEW_SECRET`) were replaced with generated values on 2026-11-03 after a placeholder mistake; the S3 variables for staging are set (bucket `wuwf-site-files`). **Staff sign-in handoff (staging only):** one generated value is set as the site's `PORTAL_IDENTITY_SECRET` (Preview) and the
  Portal project's `WEBSITE_IDENTITY_SECRET` (Preview only), with the Portal's Preview `WEBSITE_ORIGIN` pointing at the staging
  site's branch address. The Portal's **Production** environment is deliberately unset (the live Portal's Website tool stays
  "not set up" until a production site exists). **Not set:** the site's Production environment, apart from the two public
  Supabase variables.
- **Production builds are switched off (2026-11-03, at the owner's request).** `claude/main` is the Vercel project's production branch, so every merge started a
  Production build that failed ("missing secret key": Production has no database or secrets), twice (PRs 325 and 326). Nothing went live; the project is
  `live: false`. Claude set the project's **Ignored Build Step** to `[ "$VERCEL_ENV" = "production" ]` (exit 0 skips): Production builds are skipped, preview
  builds (every other branch, against staging) still build. **The merge after this should show "Skipped"; if it shows a build, the setting did not stick**
  (Settings → Git → Ignored Build Step). **At go-live, clear it** in the dashboard together with giving Production its environment (database, secrets, S3).
- **Pooler host (confirmed by the owner from the dashboard, 2026-11-03):** `aws-0-us-east-1.pooler.supabase.com`; the app role connects as `payload_app.<ref>`. The first guess (`aws-1`) was wrong. Not yet proven by a build: no site build has completed on Vercel yet
  (the one attempt was cancelled; it was created as a *production* deployment by mistake, nothing went live).
- **Lesson:** `create_deployment` with a Git source on a project that has no production deployment yet can come back with
  target `production`, whatever branch is named. Use a push to a branch (Vercel builds it as a preview) instead.
- WUWF's own numbers marked `[N]` on the sponsorship boards, and unpriced products marked `[Rate]`. On the giving
  page the three `[N]` hero figures (weekly listeners, digital readers, newsletter subscribers) are left out until
  WUWF can source them; staff add them under Support page → Top of page.
- **Giving pages content, entered in the admin (Giving pages global):** the real address of WUWF's donation form (with the right fund and
  the attribution code), whether it takes the amount from the link, a Member Services email, and a review of the legal wording; see
  *Giving pages, boards 14 to 14d* for the full pre-launch list. Until the form address is set no Give button is shown. Who can edit:
  membership staff, publishers and administrators.
- Legal and university review (IT-04 notice, privacy, retention) before production. **The community-calendar form needs the university's IT-04 wording** (it has a plain factual statement for now), and the 48-hour address-hash retention reviewed.
- **Community calendar:** who should approve (it is publishers only today); whether staff want an email or a count when a submission arrives; the other 1,464 events' date text (see *Community calendar*).
- **Grove migration, for the converter:** the census raw JSON (`census-raw-001..004.zip`) uploaded to the session, so the
  converter is tested on real pages (without it, only hand-built fixtures); approval of the asset fetch from NPR-controlled
  hosts and its rate; confirmation that non-WUWF photo credits should be flagged for review.
- **Story embeddings (2026-11-13):** the go-ahead and key for sending WUWF story text to OpenAI; the AP and News Service of Florida licence answer; approval (and privacy-notice wording) for sending visitors' search words (`SEMANTIC_SEARCH=on`); whether to build a "do not recommend" flag. Details under *Vector search and similar stories*.
- **Network content (2026-11-18):** a **CDS key for the site** from NPR Member Partnership (`NPR_CDS_TOKEN`, a separate client from the Portal's) and
  `content.api.npr.org` in the environment's allowed hosts (it answers 403 from the sandbox), so the story converter can be built from real documents;
  `CRON_SECRET` and `NPR_CDS_TOKEN` set on the site's Vercel project (the cron in `vercel.json` does nothing until both are there); NPR's answer on hotlinking images and audio, and its Terms of Use on storing documents
  (`www.npr.org` is also outside the allowed hosts); whether WUSF and FPREN publish to CDS and the service IDs of the stations (from Grove's network
  tab); Florida News Exchange access through WLRN or PRX. Details under *Network content*.
- **Launch: the site's production database (decided 2026-11-18, not a blocker).** `wuwf-site-production` is empty on purpose until the MVP launches; see
  *Launch: initializing production*. Site migrations are applied to staging and verified there; production gets all of them at once at launch.
- **Grove migration:** Search Console performance by page (last 16 months) and the links report (**pinned**, no access
  right now); agreement with NPR on crawl volume and on copying WUWF's own audio and images from NPR-controlled hosts;
  the template census's volume and timing.

## Sources

- The owner's draft *WUWF Grove to Payload Migration Plan* (2026-10-30): scope, disposition policy, pilot gates.
- The project brief (revised) for this work, supplied by the owner.
- Design canvas "WUWF.org Home Redesign" (now **28 boards**) and the "WUWF Design System" (claude.ai artifacts named in the
  brief). Read: boards 1–6, 14, 15, 28 (the section system, 2026-11-19), the phone homepage, the tokens. **Not yet read:** the Grove
  migration memo, the RadioLive site canvas, and boards 7–13 and 16–25 (Milestone 2–3 material). How to read the canvas, and the board
  files `PAGE-BLOCKS.md` depends on, are in its *Sources* section.
- The Portal: `apps/portal/CLAUDE.md`, `docs/audience-listening-design.md`, `docs/underwriting-design.md`,
  `docs/ui-patterns.md`, `docs/logic-patterns.md`.
- `wuwfdevs/barefootmary` (content and identity for the first themed show, Milestone 2) — not read yet.
