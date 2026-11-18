@AGENTS.md

# CLAUDE.md — apps/site

Guidance for Claude Code (and future human developers) working on WUWF.org. Workspace rules are in the
root `CLAUDE.md`; the Portal's are in `apps/portal/CLAUDE.md` and **do not apply here** (its design-token,
UI-primitive, migration-ledger and Resources-release-note build rules scan `apps/portal` only).

## What this is

The public website of WUWF Public Media (the NPR member station at the University of West Florida,
Pensacola), replacing the Grove platform. It is **one Next.js app**: Payload CMS's content model, admin
and the public frontend live together, as Payload's Website starter ships them, so a schema change and the
screens that render it are always in one place. Do not split the admin out, and do not move the CMS into
the Portal.

It is built on Payload's official Website template, pinned to the **v3.92.1 release tag** (not `main`,
which runs ahead of the published packages). Next and Payload versions here are this app's own; never
change them to match the Portal, and never touch the Portal's dependencies from here.

## Decisions that are made (do not reopen)

The reviewed design canvas ("WUWF.org Home Redesign", 26 boards) and the WUWF Design System are the source
for layout, copy and tokens. Where the brief and the boards differ, the boards win on layout and copy.

- Shows live at `wuwf.org/shows/<slug>`; a marketing domain (e.g. barefootmary.com) redirects into it. A show is an **original production** (the record an underwriting agreement attaches to); an **episode is a story** (`format: audio`) that belongs to it. Migrated shows are imported at Grove's exact `/show/<slug>` or `/podcast/<slug>` address, then moved with their episodes to `/shows/<slug>` (and `/shows/<slug>/<date>/<episode>`) by `scripts/shows/consolidate.ts`, each old address leaving a permanent redirect (owner decision, 2026-11-04); podcast feeds stay at `/podcast/<slug>/rss.xml`. A new episode of a show at `/shows/...` gets its address under the show. A program WUWF airs but does not make (Morning Edition) is a production of kind `syndicated`: a page with its airtime and a link out, no episodes, no underwriting agreement, not in the podcast directory.
- **There is no podcast subscription product.** Supporting a show means becoming a WUWF sustaining member;
  member benefits arrive as private podcast feeds. The language is "donate to get", never "subscribe".
- **Audience listening is the Portal's system** (decided 2026-11-04, replacing "native to this site"):
  campaigns, sessions, conversations, queries, answers, consent, audio and review live there, behind its
  signed public API. This site owns every screen a listener sees and renders them natively over the
  Portal's contract; it never stores a submission, a consent record or an audio file. The contract is
  versioned in `@wuwf/portal-contracts`; the pure rules still come from `@wuwf/listening-core`.
  Built so far (ROADMAP item 7): the full question set at `/listens/<publicId>`, the full set placed in a story or after an episode by the `listeningAsk` block and at a topic's head by its question field (one question-set UI everywhere; the placement only frames it), the hub at
  `/listens`, Ask WUWF (a section of the hub) and the host-a-session request at `/listens/host`. Phase E adds the table card's page, the table's phone, the after-page, the contact card, a public event's page and the organizer's console under
  `/listens` (`apps/portal/docs/audience-listening-suite-design.md` §10; reports are phase F).
- The giving pages (`/support`, `/support/ways`, `/support/legacy`, `/support/thanks`, boards 14 to 14d) describe giving and hand the donor to WUWF's donation form; **this site never collects card, bank, payroll or other payment details, never records a gift, and never builds a gift form** (board 14a's payment steps are the donation form's job). **Every word, level, amount and address is the `Giving pages` global** (slug `support-page`); code holds behaviour. The link to the form carries the amount and frequency only when an editor has confirmed the form reads them, and the page's wording follows that switch.
- The sponsorship pages (`/sponsor`, boards 16 to 20b) are the business-facing price list, not the ledger. **Every word, price, figure and source line is the `Sponsorship` global** (Pages & hubs), each optional section with a show/hide switch; code holds only behaviour (the estimator's arithmetic, form validation, markup). A bracket on a board is a review note and never prints; nothing unconfirmed carries a price. A proposal request is emailed to the address in that global (a staff-only field) and never stored. Credits follow the credit guidelines: no prices, claims or calls to buy.
- Sponsorship is sold by the sponsor's objective. Digital is a small set of fixed, labeled, direct-sold
  placements, not an ad network: **no leaderboards, no autoplay, no pop-ups, no third-party tracking.**
- **No polls or public tallies on open listening questions. No "sponsor-free" claims about WUWF originals.**
- Asking for member support on a page that carries a sponsor message is fine.
- The site is **not the ledger**. Gifts are made on WUWF's donation form; membership status comes from
  WUWF's membership database.
- The Portal is the identity provider for the CMS admin. A break-glass local Payload administrator exists;
  Payload's own login is for that account only.

## Boundaries

Three domains share identifiers without tight coupling: **editorial content**, **audience identity and
participation**, and **commercial (sponsorship, membership)**. Do not let one reach into another's tables;
join through ids. Third-party integrations sit behind interfaces so they can be replaced.

Five identities stay distinct and are linked only by verified relationships: authentication (Supabase),
audience profile (this app, keyed to the Supabase user id), behavioral analytics (consent-governed),
membership/giving (the membership database), and staff (Payload). **Never link an account to a donor
record on an email match alone.**

Nobody must register to read, listen, subscribe to a newsletter, answer a listening question or give.

## Contracts with the Portal

Documented, versioned, signed server to server, typed in `packages/portal-contracts`; never a read of the
Portal's tables. Both halves live in this repository.

- **Identity** (Portal → site): a short-lived signed token (`mintIdentityToken` / `verifyIdentityToken`),
  verified here, mapped to Payload users and roles. The site must record each token's `jti` and refuse a
  second use.
- **No Sourcework-to-CMS publish channel** (owner decision, 2026-10-30). It was designed, then deferred, and its block
  schema and messages were removed. Do not rebuild it without a new instruction and a fresh design.
- **Transcription** (site → Portal): Milestone 2; a signed request. Message types exist, no endpoint.
- **Traffic**: on-air sponsorship uses Traffic's daypart names (Morning Drive, Afternoon Drive, Midday,
  Weekend, Total Program Rotation, Carpool).

Use a distinct signing secret per channel and direction. Secrets are at least 32 characters.

## Underwriting rules

Model: content → fellowship / series / production → underwriting agreement → sponsor. Editors **attach**
content to collections; the acknowledgment comes from the agreement record, so changing the wording
updates every page. Nobody pastes a sponsor line into a story.

- One line per agreement, deduplicated across collections; fellowship before series; two at most (a third
  goes to the hub page).
- Dates are enforced: work published during the term carries the line forever; work published after it
  ends does not.
- Kept visibly separate from reporting: sans type on a neutral panel labeled "Support for this reporting",
  linked to the editorial independence policy. Never in a sponsor's brand colors.
- Topics and shows' own attribution are navigation/identity, never underwritten.

The resolution logic is pure and tested independently of presentation.

## Listening rules

Staff review listening data **in the Portal**, not in Payload; this site stores none of it and has no
listening collections. The site's server (server actions and route handlers, never the browser) calls the
Portal's listening API with **signed requests that assert the subject** (the contract in
`@wuwf/portal-contracts`); the Portal decides what that subject may do. Audio goes straight from the
browser to **Portal storage** through a signed upload URL the Portal issues for that submission; the site
never proxies or keeps the file. The rules themselves (answers snapshot their question's wording and
position; one in-progress submission per participant per query, at most three in total; duration and size
caps at completion; open/close dates checked on every write) are enforced by the Portal; the site shows
them through `@wuwf/listening-core` and does not reimplement them. One listening component per page.
Every send names who receives it; nothing promises a reply. Participant identity on this site is the
site's own visitor/account; the Portal sees only the asserted subject. Embedding the Portal's public page
(approved Portal origin plus `microphone` delegation) is a fallback only, not the design. The code is `src/lib/listening` (pure rules,
the signed client, the visitor cookie), `src/components/Listening` and `src/app/(frontend)/listens`; the server reaches the Portal
only through `lib/listening/portal.ts`, configured by the Portal address in Site settings (`portalOrigin`; `PORTAL_ORIGIN` is only the fallback when it is empty, `lib/listening/config-server.ts`) and the `PORTAL_LISTENING_SECRET` variable. The secret stays an environment variable on purpose, and on a protected Vercel preview the Portal project's bypass secret goes in `PORTAL_PROTECTION_BYPASS` (Preview only; see the Portal's `CLAUDE.md`, "Vercel environments and deployment protection"), and the address field is readable and editable only with `settings.manage` because the Site settings document is public. A visitor is our own
random-id cookie (`wuwf_listening_visitor`, 30 days), the only thing the Portal learns about them; the client address goes to the
Portal only as a keyed, per-day hash.

## Privacy

Collect the minimum. Analytics are consent-aware; never put raw user text or audio in analytics or logs;
sponsors receive aggregates, never personal data. Public pages that collect information carry the UWF IT-04
policy notice. Service-role credentials stay server-side; privileged Local API operations enforce
authorization themselves rather than relying on RLS.

## Migrating from Grove

Content will move from NPR's Grove platform (owner's memo, 2026-10-16). Until its proof-of-concept gates pass this site
runs beside Grove, not instead of it. Rules for anything touching bodies or identity:

- **Never drop content you cannot map.** Preserve it (as a preserved-HTML block, rendered safely) and flag it. Never
  render imported HTML raw, and never import `<script>`.
- **Stable identity:** every migrated record keeps `legacy.legacyPath` and `legacy.groveId` (Grove's `contentId`), and
  `legacy.nprId` when it has one. Preserve
  the source's published and modified dates; never use import time.
- **NPR and wire stories (`source` ≠ `wuwf`) are not WUWF's to archive separately or alter** beyond headline, teaser
  and description. They are re-pulled from NPR, not migrated as our own.
- **The block set comes from the data.** The data is Grove's public `?_renderer=json` view of each page (NPR offers no bulk
  export); it is converted to Payload before migrating. The owner's migration plan governs scope (WUWF-originated
  content only; wire stories are URL exceptions); Payload needs a block for everything Grove/Brightspot does, and stories must be able to use them as in
  Grove. Derive the blocks from a tally of that data (`ROADMAP.md` → *Grove migration*), not from documentation or
  guesswork. The story blocks now follow the census (media, gallery, pull quote, embed, audio, video, preserved HTML), plus one the owner added that Grove never had, `linkLine` (a label and a link), built by the converter from two exact hand-typed patterns (a "RELATED:" line; the stock "Support Local Stories. Donate Here." line) and never from guesswork about other patterns; a story's
  featured media and featured audio are fields, not body blocks. Embeds stay a URL, never free HTML: a built-in and administrator-approved host list loads without a click, any other public https host
  loads only behind a click-to-load card, and private, internal and own-site addresses are refused. Posts on X and Facebook are link-only cards,
  never live embeds (their scripts track readers). A script widget (an election guide) is its own `widget` block (structured fields, never pasted HTML; sandboxed frame with no
  `allow-same-origin`; publisher-only to add or change). Its script host follows the embed rule: a built-in or approved host loads
  without a click (owner decision, 2026-11-03: old election guides must render inline), any other host waits for a click. Never
  import a `<script>` any other way. Asset files are copied
  into our own storage, one library record per source file (`legacy.sourceUrl`); the asset fetch needs the owner's approval.
- **The converter lives in `src/lib/grove`** (pure: no fetching, no database). One Grove page in, one story plus a report out;
  anything it cannot map becomes a flagged link, preserved HTML or an exception, never a silent drop, and a script is never
  imported. Keep it that way: no network, no Payload, no React in that folder. Test it on synthetic pages in the repo and on
  the real census pages through `scripts/grove/convert-corpus.ts` (the raw pages stay outside the repository).
- **If you do not know how to proceed, or need information, stop and ask the owner.** Do not build on a guess.
- **`dangerouslySetInnerHTML` is allowed in exactly one place**: `blocks/LegacyHtml/Component.tsx`, on the output of
  `lib/sanitize.ts`. Nowhere else.
- **URLs keep Grove's exact paths** (`/{section}/{YYYY-MM-DD}/{slug}`), stored once as a unique `path` and resolved by one
  catch-all route (`app/(frontend)/[...path]`); never recompute a migrated path. Only a publisher sets or changes a path;
  `legacy.legacyPath` is write-once provenance, not routing. Do not fetch from `wuwf.org` beyond what the owner has approved:
  honour robots.txt, space requests at least 3 s apart, send a neutral User-Agent with no contact information of any kind, keep raw responses out of the repository.

## Embeddings and similar stories

Stories are embedded for "Related stories" and semantic search (`src/lib/embeddings`, `src/db/storyEmbeddings.ts`; the record is `ROADMAP.md` -> *Vector search and similar stories*).

- **Only WUWF's own, published stories are embedded** (`source: wuwf`). Never an NPR or wire story: they are not ours to archive or to send on, and what NPR's terms allow for CDS content is an open question. A members-only story is embedded from its title, dek and description, never its body.
- **Nothing is sent without a key.** `OPENAI_API_KEY` turns indexing on; the Site settings switch **"Find stories by meaning in search"** (an administrator, in the admin, no deploy: Site settings needs `settings.manage`, which only the administrator role holds) is a second switch for sending a **visitor's search words** to the provider; it does nothing without the key. A key alone never enables it: it is a disclosure about visitors the owner decides. Never log a query's text or write it to the database or analytics (its vector is held in the server's memory for an hour, under a hash of the words, so a repeated search is not sent again).
- **The privacy wording lives in `lib/embeddings/notice.ts`, beside the behaviour it describes.** `PRIVACY_PAGE_PARAGRAPHS` is the text for the site's privacy page. There is no notice on the search page itself (owner decision, 2026-11-18). If search or indexing changes what is sent or kept, change the wording in the same commit.
- **The table is not a collection.** Vectors are read and written only through `lib/embeddings/store.ts`, never exposed over the API, and a story found by vector is always loaded through the Local API with `overrideAccess: false`, so a draft or an unpublished story cannot appear because it has a vector.
- **A save hook never fails a save and never removes a vector** (a draft saved over a published story reports `draft`). It writes on the save's own transaction (`req`), or the foreign key fails.
- **Anything that saves stories in bulk sets `context.disableEmbedding`** (the importer, the body repair, the shows move) and the backfill embeds afterwards, so a bulk run makes no inline provider calls. A migration is not finished until the backfill has run (`scripts/grove/IMPORT.md`, step 5).
- The model and its width are constants (`lib/embeddings/config.ts`); the column is `vector(1536)`. Changing either is a migration plus a re-embed.
- **The similarity numbers are settings.** Site settings -> "Related stories and search by meaning" holds how close a story must be to appear under another (`relatedMinSimilarity`), how close to appear as a search result by meaning (`searchMinSimilarity`) and the most related stories from one show (`relatedMaxPerSeries`). `lib/embeddings/tuning.ts` (`resolveTuning`) clamps each to its range and falls back to the starting values in `rank.ts`, which are defaults, not measurements. Saving the global revalidates every page, so a change shows at once. Code reads them through `resolveTuning` and passes them down; the pure ranking functions never read settings.
- **The Story embeddings panel (Site settings) is the backfill without a terminal.** `components/admin/StoryEmbeddingsPanel` shows coverage, embeds the waiting stories 20 at a time, and shows sample stories with the stories the current numbers would put under them (the same loading and picking as a story page: `neighbourCandidates`, `pickRelated`). Its endpoints (`globals/storyEmbeddingEndpoints.ts`, `lib/embeddings/admin.ts`) need `settings.manage` because they spend the provider key, and return counts only: never a key, a story's text or a vector. `scripts/embeddings/backfill.ts` is still how stale (edited) stories are found and how a first run is estimated; the panel embeds only stories with no vector.

## Network content (stories from NPR and other stations)

Built from the CDS docs and the owner's decisions of 2026-11-18; the record and the open questions are `ROADMAP.md` -> *Network content*.

- **A network story is not a draft post.** Polled stories are `network-items` (thin, disposable, no body, system-written); a `post` exists only once a story is published, with `source` `npr` or `wire` and `original.url` / `original.credit` / `original.cdsId`. Its `rel=canonical` is the original publisher's address (`lib/network/original.ts`), and the sitemaps list only `source: wuwf`.
- **A story NPR flags restricted (`isRestrictedToAuthorizedOrgServiceIds: true`) is never stored, shown or linked.** `lib/network/cds.ts` filters it out and only counts it; a restricted picture or audio file is dropped and the story kept. A held story that later turns restricted is blanked to a tombstone and its post goes back to draft. Do not add a path that keeps a restricted story's words.
- **The site has its own CDS key** (`NPR_CDS_TOKEN`; never the Portal's). Unset means "not set up", never an error. The key and CDS response bodies never reach a log, an error message or a browser (`lib/network/cds-client.ts` reports only the status).
- **Network images and audio are referenced where NPR hosts them, not copied.** Audio is chosen only if it is available, unexpired and not `tracked`, `sponsored` or `premium`.
- **CDS has no push for stations**: the poll asks what was published since a cursor, then re-checks what we hold by `ids` (a removed story is simply absent). Use only documented parameters (`lib/network/poll.ts`).
- **Do not write the story-body converter from memory.** Derive it from real CDS documents, as the Grove converter was (see "Migrating from Grove"). Until it exists nothing can publish a network story, and the queue says so.
- Status changes on a `network-items` row are checked in `lib/network/status.ts`: an editor may keep, release and dismiss; `published` and `gone` come only from the system (`context.networkSystem`).

## Database

PostgreSQL, **this app's own** Supabase project in hosted environments — never the Portal's two projects.
Locally: `pnpm db:up` (docker compose, port 5433) or any Postgres 16 at `DATABASE_URL`. In development
Payload pushes schema changes; **production runs only committed migrations** (`src/migrations`, created
with `pnpm payload migrate:create`). Never run a destructive database operation without being asked. **After any schema change, run `pnpm verify:migrations`**
(dev and test databases push schema on their own, so tests pass even when a migration was never written). The database needs the **pgvector** extension (story embeddings): `docker-compose.yml` uses the `pgvector/pgvector` image, and the migration runs `CREATE EXTENSION IF NOT EXISTS vector` (on Supabase it is installed in the `public` schema on both site projects).

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test:int` (Vitest) · `pnpm test:e2e`
(Playwright) · `pnpm generate:types` · `pnpm generate:importmap` · `pnpm db:up` / `pnpm db:down`.
After changing a collection, run `pnpm generate:types` and `pnpm generate:importmap` and commit the output.
Run typecheck, lint and tests before calling a change done.

## Engineering rules

- Strict TypeScript and generated CMS types. Loading, empty and error states on every data screen.
- Server-side validation of all public input. Access control on every collection and every route.
- **A client component never imports `components/RichText`.** It renders the story blocks (Promo, Embed...), which are
  server components that read Payload, and the production build fails. Use `components/RichText/Plain`. Run `pnpm build`
  before calling a change done: dev and the tests cannot see this.
- **Access is by permission, never by "is signed in".** Staff roles are defined in `@wuwf/portal-contracts`; use
  `requirePermission(...)` (and `publishedOrContentStaff` for reads), not `authenticated`. Saving drafts is
  `content.write`; making work live (publish, edit a live document, delete, redirects) is `content.publish`,
  enforced for publishing by `hooks/enforcePublishPermission`. Plugin collections (redirects, forms) get the same
  treatment through their `overrides`.
- **Every public read through the Local API states `overrideAccess`.** The Local API skips access control by default,
  so an unguarded `payload.find` in a page or block leaks drafts. `lib/public-reads.test.ts` fails when one forgets.
- **A cached read needs an invalidation.** Anything read through `getCachedGlobal` (tag `global_<slug>`) needs an
  `afterChange` hook that revalidates that tag, as Header, Footer, Support page and Site settings have.
- **Sub-navigation inside a section goes through `components/SectionNav`.** One `<nav>`, one line that scrolls sideways on a phone, 44px links, `aria-current="page"` on the current page, and only links to places that render (build the list in a pure helper, as `lib/radiolive/nav.ts` does). Do not hand-build a row of links; if a section's masthead is its own design (the Voyager), say so in the component.
- **There is one player, and every play button hands its audio to it.** The `<audio>` element lives in `PlayerProvider` in the root layout, so audio keeps playing as the reader navigates (use `next/link`, never a plain `<a href>` to a site page, which reloads and stops it). It plays the live stream or one on-demand `Track` (`lib/player/track.ts`), never both. Anywhere a page offers station audio (a card, a story, a show, the home page) it renders `components/ListenLive/PlayAudioButton` (or `blocks/AudioPlayer`, which wraps it) with a track from `trackFromAudio`; **never put an `<audio>` element on a page** (the one exception is the visitor's own recording in the listening flow). Any query that feeds `Card` must select `featuredAudio` (`CARD_FIELDS` does). Nothing autoplays.
- Logic separate from presentation: pure, tested modules for publishing, revenue, entitlement and
  listening logic; components stay thin.
- Colours, type and spacing come from `@wuwf/design-tokens`; no one-off hex values or pixel sizes.
- Accessible by default: real buttons and links, labelled controls, 16px minimum on any focusable text
  field on a phone, touch targets of at least 44px, text contrast of at least 4.5:1.
- The site must stay usable if analytics, sponsorship serving or personalization is down. Emergency
  coverage is a first-class state of the homepage.
- Distinguish what is implemented from what is a demonstration. Incomplete integrations are represented
  honestly, never faked.
- Do not deploy to production, apply migrations to the Portal's Supabase projects outside its ledger, send
  live communications, or create paid services without authorization.
