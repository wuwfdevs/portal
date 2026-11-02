# Roadmap and handoff

This file is how a new session picks up without the previous conversation. Rules live in `CLAUDE.md`; design in
`ARCHITECTURE.md`; the event spec in `ANALYTICS.md`. This file holds **state, order of work, and lessons**.
Keep it current: update it in the same commit as the work.

Branch: `claude/new-session-x1z9so` in `wuwfdevs/portal`. The brief this follows (the "project brief") and the
design canvas are described under *Sources* below.

## Where things stand (Milestone 1)

| Area | State |
|---|---|
| Workspace conversion (Portal to `apps/portal`, pnpm) | **Done**, verified identical to baseline |
| Payload Website starter in `apps/site`, PostgreSQL | **Done**; boots, typechecks |
| Shared packages (design-tokens, listening-core, portal-contracts) | **Done**, tests in each |
| Visual foundation: tokens → CSS, self-hosted fonts, header/footer driven by their globals, no dark theme | **Done**; checked in a browser at 1440 and 390 px |
| Article page (board 3) with the acknowledgment panel | **Done**; checked in a browser, and the edit-the-agreement loop verified on a production build |
| Body blocks for parity with Brightspot's documented elements (gallery, pull quote, embed, promo, preserved HTML); hostile-HTML and embed-allowlist behaviour tested and checked in a browser | **Done**; dynamic galleries, tables, audio player, video playlist and anything Grove-specific are **not** |
| Grove-ready identity: `legacy.legacyPath`, `legacy.nprId`, `source` on posts; migrations verified | **Done**; the block set, importer and NPR read-only enforcement are **not** (see *Grove migration*) |
| Content model, staff roles, access control | **Done**, integration-tested |
| Underwriting resolution + Coastal Futures / Example Foundation demonstration | **Done**, 26 unit + integration tests |
| Initial production migration | **Done**; matches the dev push exactly |
| Docs (README, ARCHITECTURE, ANALYTICS, this file) | **Done** |
| Staff sign-in: Portal half (`website` registry row, access predicate, audit policy, `/website` token route, roles) | **Done**; migration applied to preview and production (2026-10-30). Tool is registered **disabled** |
| Staff sign-in: site half (verify, refuse reused `jti`, sync account, session cookie + strategy, revocation) | **Done**, 27 tests incl. replay, race, takeover, tampering |
| Sourcework-to-CMS publish channel | **Deferred and removed** (owner decision, 2026-10-30); see *Deferred* below |
| Giving page `/support` (board 14): levels, figures, calls to action edited in the admin (`Support page` global) | **Done**, checked in a browser at 1440 and 390 px; button addresses and the audience figures are for WUWF to supply (see below) |
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
5. **Before any more body work: the census and the `path` resolver** (see *Grove migration*).
   Nothing else in this list depends on it, so the pages below may proceed if the owner asks.
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
- One catch-all route resolves a path to a story, author, show, event or page. It replaces `/posts/[slug]`, which was a
  placeholder. A trailing slash redirects (308) to the path without one; the canonical is the path itself.
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
with a User-Agent that identifies the project and at least 3 s between requests (robots.txt allows all), and tally by
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
3. **Template census**: a larger stratified fetch, volume and timing agreed with the owner (and NPR) first.
4. The `path` field and catch-all resolver (approved).
5. Blocks derived from the census; converter with a fidelity report (the plan's gate: no silent loss; an unknown
   `_template` is an explicit exception, never dropped; unmapped content kept as preserved HTML and flagged).

**The five blocks that exist (Gallery, Pull quote, Embed, Promo, Preserved HTML) are provisional.** They were built from
search summaries of Brightspot's documentation, not from Grove's data, and were wrongly described as "parity". Keep,
rework or remove them once the census exists. The sanitizer, the embed allowlist and the administrators-only guard on
preserved HTML are sound and carry over. If the data or the plan is unclear, stop and ask the owner; do not build on a
guess.

## Known gaps in what exists

- Stories are served at `/posts/[slug]`, a placeholder. They move to their Grove-style `path` (see *URL scheme*).
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

- **Pull request:** [wuwfdevs/portal#320](https://github.com/wuwfdevs/portal/pull/320) (`claude/new-session-x1z9so` into
  `claude/main`, the only default-like branch) is open and awaiting the owner's merge.
- **Vercel, Portal project:** set Root Directory to `apps/portal` (with "Include source files outside of the Root
  Directory" on, and Node 22.x). Until it is set, a build of this layout fails with `NEXT_NO_VERSION`; once it is set,
  builds of old-layout branches fail instead (previews only; the live deployment is never replaced by a failed build).
  The first preview build of this branch showed that the install step works with one lockfile per project.
- **Vercel, new project for the site:** Root Directory `apps/site`, Node pinned, own env vars.
- **Not yet confirmed:** that Vercel's install handles one lockfile per project in a pnpm workspace. Check the
  first preview build.
- **A Supabase project for the site** (separate from the Portal's two) and its keys.
- WUWF's own numbers marked `[N]` on the sponsorship boards, and unpriced products marked `[Rate]`. On the giving
  page the three `[N]` hero figures (weekly listeners, digital readers, newsletter subscribers) are left out until
  WUWF can source them; staff add them under Support page → Top of page.
- **Giving page content, entered in the admin (Support page global):** the real address of WUWF's donation form for
  each level (with the right fund and the attribution code), the Sponsor WUWF and fellowship button addresses once
  those pages exist, the legal footer line, and a review of the level descriptions (tax-deductibility wording).
  Until a level has an address its button is simply not shown. Who can edit: membership staff, publishers and
  administrators.
- Legal and university review (IT-04 notice, privacy, retention) before production.
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
