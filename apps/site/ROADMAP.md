# Roadmap and handoff

This file is how a new session picks up without the previous conversation. Rules live in `CLAUDE.md`; design in
`ARCHITECTURE.md`; the event spec in `ANALYTICS.md`. This file holds **state, order of work, and lessons**.
Keep it current: update it in the same commit as the work.

Branch: work after PR 320 (merged 2026-11-02) continues on `claude/eloquent-thompson-7gpsj2` in `wuwfdevs/portal` (earlier session branches were merged: PRs 322 to 324). The brief this follows (the "project brief") and the
design canvas are described under *Sources* below.

## Where things stand (Milestone 1)

| Area | State |
|---|---|
| Workspace conversion (Portal to `apps/portal`, pnpm) | **Done**, verified identical to baseline |
| Payload Website starter in `apps/site`, PostgreSQL | **Done**; boots, typechecks |
| Shared packages (design-tokens, listening-core, portal-contracts) | **Done**, tests in each |
| Visual foundation: tokens → CSS, self-hosted fonts, header/footer driven by their globals, no dark theme | **Done**; checked in a browser at 1440 and 390 px |
| Article page (board 3) with the acknowledgment panel | **Done**; checked in a browser, and the edit-the-agreement loop verified on a production build |
| Story blocks derived from the template census (2026-11-02): Media (per-use caption, credit, source, alt override, alignment), Gallery (carousel, grid, list; slide titles), Pull quote, Embed (adds width/height and link-only X and Facebook posts), Audio (new), Preserved HTML; Promo removed | **Done**; checked in a browser at 1440 and 390 px; tables and a native video player are **not** (one table in 1,500 pages stays preserved HTML) |
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
| Homepage, fellowship hub (boards 1, 2, 4) | Not started (the article, board 3, is done) |
| Audience listening: collections, flow, private storage, staff review | Not started |
| Analytics foundations | Spec only (`ANALYTICS.md`) |
| Supabase Auth, audience profile + RLS, passwordless sign-in, entitlements model | Not started |
| Starter lint errors (Header, Card, Theme provider) | **Fixed** (components replaced); 3 warnings remain in the starter's e2e tests |

Milestones 2–4 are unchanged from the project brief (shows platform and Barefoot Mary, member feeds, the
listening hub, short video, sponsorship section and measurement, membership sync, intelligent publishing). Nothing
in them has been started.

## Next, in order

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
7. **Listening:** collections (no public read), server actions with Local API writes, signed upload URLs to a
   private bucket, the Inline ask then the full flow, staff review in Payload.
8. **Analytics foundations** per `ANALYTICS.md`.
9. **Supabase Auth** with `@supabase/ssr`, audience profile + RLS, entitlements with manual grants.
10. Final pass: acceptance criteria (project brief §17), browser verification at phone width, update every doc.

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

### Live updates (a new content type; data examined, design proposed, nothing built)

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
- **Open questions for the owner:** who may publish updates during an emergency (publishers only, or editors as a fast path);
  whether updates carry optional bylines; leaving comments out; whether polling for new updates is acceptable.

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

## Known gaps in what exists

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
- **"Listen live"** is deliberately not in the header: it would be a button that does nothing until the persistent
  player exists (Milestone 2). Do not add it as a link to nowhere.
- The header links only to pages that exist. The boards' full navigation (Podcasts, Video, RadioLive, Unearthing
  Florida, WUWF Listens, The Voyager) arrives with those pages, as header-global entries.
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
- **The local Postgres stops when the sandbox idles.** `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/wuwf-site-pg
  -l /var/tmp/wuwf-site-pg/log.txt -w start"` brings it back (the roadmap's setup block creates it).
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

## Running things in a fresh sandbox

The sandbox is ephemeral; nothing below survives.

**Node.** The default is 22.22.0, one patch below the pinned 22.23.4, and `engine-strict` makes pnpm refuse it. Get
22.23.4 from the `node-linux-x64` npm package (`npm pack node-linux-x64@22.23.4`, unpack, put its `bin` first on
`PATH`), then check `node -v`. Do not loosen the pin.

**Postgres.** Postgres 16 is installed but not running, and it will not run as root:

```bash
D=/var/tmp/wuwf-site-pg; PGBIN=/usr/lib/postgresql/16/bin
mkdir -p $D && chown postgres:postgres $D
su postgres -c "$PGBIN/initdb -D $D -U wuwf --auth=trust -E UTF8"
printf "port = 5433\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '/var/tmp'\n" > $D/postgresql.auto.conf
chown postgres:postgres $D/postgresql.auto.conf
su postgres -c "$PGBIN/pg_ctl -D $D -l $D/log.txt -w start"
psql -h 127.0.0.1 -p 5433 -U wuwf -d postgres -c "create database wuwf_site;" -c "create database wuwf_site_test;"
```

Then `pnpm install` at the root and create `apps/site/.env.local` from `.env.example` (`DATABASE_URL=postgresql://wuwf@127.0.0.1:5433/wuwf_site`).

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
- **Pooler host (confirmed by the owner from the dashboard, 2026-11-03):** `aws-0-us-east-1.pooler.supabase.com`; the app role connects as `payload_app.<ref>`. The first guess (`aws-1`) was wrong. Not yet proven by a build: no site build has completed on Vercel yet
  (the one attempt was cancelled; it was created as a *production* deployment by mistake, nothing went live).
- **Lesson:** `create_deployment` with a Git source on a project that has no production deployment yet can come back with
  target `production`, whatever branch is named. Use a push to a branch (Vercel builds it as a preview) instead.
- WUWF's own numbers marked `[N]` on the sponsorship boards, and unpriced products marked `[Rate]`. On the giving
  page the three `[N]` hero figures (weekly listeners, digital readers, newsletter subscribers) are left out until
  WUWF can source them; staff add them under Support page → Top of page.
- **Giving page content, entered in the admin (Support page global):** the real address of WUWF's donation form for
  each level (with the right fund and the attribution code), the Sponsor WUWF and fellowship button addresses once
  those pages exist, the legal footer line, and a review of the level descriptions (tax-deductibility wording).
  Until a level has an address its button is simply not shown. Who can edit: membership staff, publishers and
  administrators.
- Legal and university review (IT-04 notice, privacy, retention) before production.
- **Grove migration, for the converter:** the census raw JSON (`census-raw-001..004.zip`) uploaded to the session, so the
  converter is tested on real pages (without it, only hand-built fixtures); approval of the asset fetch from NPR-controlled
  hosts and its rate; confirmation that non-WUWF photo credits should be flagged for review.
- **Grove migration:** Search Console performance by page (last 16 months) and the links report (**pinned**, no access
  right now); agreement with NPR on crawl volume and on copying WUWF's own audio and images from NPR-controlled hosts;
  the template census's volume and timing.

## Sources

- The owner's draft *WUWF Grove to Payload Migration Plan* (2026-10-30): scope, disposition policy, pilot gates.
- The project brief (revised) for this work, supplied by the owner.
- Design canvas "WUWF.org Home Redesign" (26 boards) and the "WUWF Design System" (claude.ai artifacts named in the
  brief). Read: boards 1–6, 14, 15, the phone homepage, the tokens. **Not yet read:** the Grove migration memo, the
  RadioLive site canvas, and boards 7–13 and 16–25 (Milestone 2–3 material).
- The Portal: `apps/portal/CLAUDE.md`, `docs/audience-listening-design.md`, `docs/underwriting-design.md`,
  `docs/ui-patterns.md`, `docs/logic-patterns.md`.
- `wuwfdevs/barefootmary` (content and identity for the first themed show, Milestone 2) — not read yet.
