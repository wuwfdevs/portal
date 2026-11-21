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
- The giving pages (`/support`, `/support/ways`, `/support/legacy`, `/support/thanks`, boards 14 to 14d) describe giving and hand the donor to WUWF's donation form; **this site never collects card, bank, payroll or other payment details, never records a gift, and never builds a gift form** (board 14a's payment steps are the donation form's job). **Every word, level, amount and address is the `Giving pages` global** (slug `support-page`); code holds behaviour. The link to the form carries the amount and frequency only when an editor has confirmed the form reads them, and the page's wording follows that switch. **Changed (owner, 2026-11-19; `PAGE-BLOCKS.md` phase 4):** the giving pages are records in `pages` (the giving set), built from sections. **Section words are on the page's blocks; every level, amount, donation-form address, contact detail and broker detail is the `Giving settings` global** (slug `giving-settings`, under Members & accounts); code holds behaviour. The old `Giving pages` global (slug `support-page`) is hidden and kept only until phase 7: nothing reads it for a visitor. The rules above about never collecting payment details and the form switch still hold.
- The sponsorship pages (`/sponsor`, boards 16 to 20b) are the business-facing price list, not the ledger. **They are records in `pages` (the sponsor set), built from sections** (moved 2026-11-19, phase 3 of `PAGE-BLOCKS.md`). **Section words are on the page's blocks; every price, rate, program, form choice, phone and address is the `Sponsorship settings` global** (slug `sponsorship-settings`, in the Sponsorship group); code holds only behaviour (the estimator's arithmetic, form validation, markup). A bracket on a board is a review note and never prints; nothing unconfirmed carries a price. A proposal request is emailed to the address in the settings (a staff-only field) and never stored. Credits follow the credit guidelines: no prices, claims or calls to buy. The old `Sponsorship` global is hidden and kept only until phase 7 drops it: nothing reads it for a visitor.
- Sponsorship is sold by the sponsor's objective. Digital is a small set of fixed, labeled, direct-sold
  placements, not an ad network: **no autoplay, no pop-ups, no third-party tracking.** **Sold at a flat rate for a period, never by the impression** (owner, 2026-11-20): no CPM, no viewability or share-of-voice product, no rotation, until the owner decides on first-party measurement (`PLACEMENTS.md`, open decision 2). **A top unit is allowed** (owner, 2026-11-20, relaxing the old "no leaderboard, never above the news"): one exclusive, labeled, still picture in a slim strip the width of the page's content (1600 by 200, eight wide for one tall: about 150 px tall, so it does not push the story down), directly under the header (zones `home.top`, `list.top`: a section's presenting sponsor, aimed at it), on a phone after the lead's headline and picture or the list's title; never a script, never motion, **never above or beside an emergency banner** (it is held back while one is on, `lib/placements/exclusions.ts`), and a second one for the same dates and page is refused. Every fixed place on the site is a
  **zone** in `src/lib/placements/registry.ts` (code); what runs in it is a **placement**, a record editors make (Sponsorship → Placements), designed in
  `PLACEMENTS.md`. A sponsor tile says "Sponsor message" (WUWF's own promotion says "From WUWF"), an empty zone draws nothing, **the site holds no package, price or sold-as reference**, and booking,
  billing and proof of delivery stay out of Payload (the Portal's job). **A paid tile that runs is always drawn: the home page's tiles are full-width rows of three between the news
  sections, with no side column (`PLACEMENTS.md`, "How the home page lays the tiles out"), and a short last row is completed by optional WUWF promotions, never by dropping a sponsor.**
- The home page's news band is an editor-ordered list of sections (Home page → News sections), each linking to its section page and ending in
  `/latest`, the list of every story. **Florida News (a partner's reporting) is featured on purpose** (owner, 2026-11-18): a section's run is every
  published story filed under it, whatever its source; the lead and the Briefing stay WUWF's own.
- **No polls or public tallies on open listening questions. No "sponsor-free" claims about WUWF originals.**
- Asking for member support on a page that carries a sponsor message is fine.
- The site is **not the ledger**. Gifts are made on WUWF's donation form; membership status comes from
  WUWF's membership database.
- The Portal is the identity provider for the CMS admin. A break-glass local Payload administrator exists;
  Payload's own login is for that account only.

## Pages and sections (built in phase 1; the design is `PAGE-BLOCKS.md`)

An editor-composed page is a record in `pages` with `template: sections` and an ordered `sections` blocks field. A developer adds a **block** (a section type), never a page. Moving a coded page into sections happens in later phases, one page per change; until a page has moved, its route and global are the rule.

- **Blocks are stored as JSON** (`blocksAsJSON: true`, database-wide: stories' featured media, form fields, page sections). Moving to it was migrations `20261119_031412_sections_pages` (the page columns, first) and `20261119_031427_blocks_to_json`; the second's `down` is hand-written and both were tested up, down, up on rows. **Payload's converter reads every document through the config as it is when it runs**, so it fails on a database whose tables lack a column a later migration adds: it skips its data pass when the tables are empty (a fresh install, production before launch), and on a database holding content it must be applied before any later migration that changes pages, stories or forms. A migration that changes how blocks are stored needs the same care and a tested `down`. Stored as JSON, a blocks field keeps an unknown block type (relational storage dropped it): a field with a fixed set of types uses `keepOnlyBlockTypes` (`hooks/dropUnknownBlocks.ts`).
- **A block is a directory** under `blocks/sections/<Name>/` (`config.ts`, `Component.tsx`, a test) and **one entry in `blocks/sections/registry.ts`**; its definition is built with `defineSection` and `sectionFields` (`hidden`, `anchor`, `tone`, `variant`, `heading`, then its own), and it has a picker group and a 3:2 thumbnail in `public/section-thumbnails/`. `registry.test.ts` fails when a block lacks any of these or a directory is not registered. A block that belongs to one page set names it in its entry (`sets`); the picker (`filterOptions`) offers the library plus the blocks that name the page's set, and a publish with any other block is refused.
- **A variant changes layout over the same fields and the same data source**; if the fields or the source differ it is a separate block. A hidden variant field keeps its data and is not validated, so a component reads only its own variant's fields.
- **A tone is a name** (`plain`, `grey`, `accent`, `dark`, `teal`, `lime`), never a colour. The page theme (`lib/page-themes`, tokens in code, `page-themes.css` generated by `pnpm generate:themes`) decides what each looks like, and `themes.test.ts` checks every tone: text 4.5:1, a button's fill 3:1 against its ground. No free colour, spacing or HTML field in a block.
- **A block never reads request data on the server** (`headers`, `cookies`, `connection`, `searchParams`): a page prerendered and then given such a block answers 500 on every request. Request data reaches a block through a client component (`useSearchParams` inside `Suspense`, a fetch for a token); a page that must be server-rendered per request stays a coded route that renders its page record with `RenderSections`.
- **A block reads shared data through `getCachedGlobal`**, never `payload.findGlobal` (the save's tag revalidation reaches pages only through the cache), and a block that shows time-dependent data loads it through `unstable_cache` with its own `revalidate`, which lowers the cache window of the pages holding it and no others. Every settings global keeps its tag-revalidating hook.
- **A block never trusts a stored relation or link.** A deleted picture or page leaves a bare id: test `typeof value === 'object'` and draw nothing for a missing one. A link is drawn only when `safeHref` accepts it. A block with nothing to show draws nothing.
- **The registry is loaded by the Payload CLI, so a block's component never imports Payload at the top of its file.** `registry.ts` imports every component and the config imports the registry. A component that statically imports the story renderer (`components/RichText`), the global helper (`utilities/getGlobals`), a data loader (`lib/section-data/load`, `lib/events/load`, `lib/underwriting/load`) or `@payload-config` breaks `generate:types` and the integration tests. Load them inside the async component with `await import(...)`, as Text, Support and the data blocks do; `blocks/sections/rules.test.ts` fails on a static import, and also on request data, a direct global read, raw HTML, an unsafe link and a free colour or HTML field.
- **A data block reads through `lib/section-data`**: pure `shape.ts` (a stored record to plain JSON, a bare id left out) and `specs.ts` (what a block asks for, reading only its own variant's fields), and `load.ts` (Local API with `overrideAccess: false`, cached with `unstable_cache` and its own `revalidate`; a failed read throws and is never cached). Time-dependent blocks take their clock from `sectionClock`, so the page holding them is cached for no longer than its window. The component splits into a pure `…View` (tested with fixtures) and an async wrapper (tested with the loader mocked).
- **Rich text inside a block goes through `restrictedBlocksGuard`.** The guard's walk visits every object in a field's value, and the pages collection guards `['body', 'sections']`; a section block that uses `bodyEditor` is covered by that, and `restrictedBlocksGuard.test.ts` fails if pages stops guarding `sections`. A block with rich text uses `bodyEditor`, never another editor.
- **A block's look comes from the tone, never from fixed classes.** Read `--tone-text`, `--tone-muted`, `--tone-accent`, `--tone-ghost`, `--tone-card`, `--tone-card-rule`, `--tone-tint`, `--tone-button`, `--tone-button-text` and `--tone-mark` (`[color:var(--tone-accent)]`), so one block is right on all six tones; a card is `rounded-lg border` with the card tokens (the boards' 8 px), and a block's **picture, video, gallery frame or embed is `rounded-4`** (direction C2). A band's heading is the Kit's `SectionHeading mark="tone"` (drawn by `SectionBand`; its text colour is the band's, not the station's ink). Write every Tailwind class out whole: a class built in a template string (`peer-checked/p${i}:…`) is never generated. A block with a heading passes it to `SectionBand heading={…}` (with `more={…}` for a link), so the section's `placement` (above or beside) works; do not draw the heading yourself. **Check a new block or layout against the design canvas, not against the plan's description**: `PAGE-BLOCKS.md` → *Sources* says how to read it, and rendering a board with Playwright is faster than reading its markup. The design pass of 2026-11-19 exists because this was skipped once.
- **Columns holds other sections; one level, from `blocks/sections/inline.ts`.** A section held by Columns arrives with `inline: true` and draws bare (`SectionBand` handles it): use `SectionBand` for every block, never your own `<section>`, or it will draw a band inside a column. A block that should not sit in a column (a hero, a form, a data block) stays out of `INLINE_SLUGS`; one that exists only for columns sets `inlineOnly` in its registry entry. **The old coded pages are the standard a moved page is held to**, not only the design boards: compare a moved page with screenshots of the page it replaces, and where a block cannot draw something the old page did, say so.
- **A migration that rewrites a blocks field through the Local API cannot remove a field.** Payload merges a block that keeps its `id` with the stored one, so a field the new arrangement omits survives (the hub's opening band kept four figure tiles from an earlier arrangement and drew them twice; three sections kept `placement: side`). To rewrite sections, write the `jsonb` column and the latest version row directly (`migrations/20261119_190000_sponsor_pages_clean.ts`), or give the blocks new ids. A mapper test (`to-sections.test.ts`) fails when a figure or a section title is drawn twice on a page.
- **A new block needs a sample.** `lib/sections-sample/build.ts` has one maker per block (a test fails until it exists), and `scripts/sections/seed-sample-page.ts` writes the internal sample page (every block, every tone) so the owner can review the library at three widths. The Picker's prices are typed text until a settings reference is decided (`priceOf` in `Picker/Component.tsx` is the seam).
- **A page's set decides who edits it** (`lib/page-sets/registry.ts`; `access/pages.ts`, `hooks/enforcePageSet.ts`): pages in no set need `content.write`, the sponsor set `content.publish`, the giving set `membership.manage` or `content.publish`. Put no other role check on a page.
- **A block that is offered to one page set reads that set's settings global, and shows nothing it does not hold.** The sponsor set's five blocks (Rate estimator, Packages, Carpool plan, Open programs, Inquiry form; `sets: ['sponsor']` in the registry) read `sponsorship-settings` through `lib/sponsorship/load.ts` (`loadSponsorshipSettings`, imported inside the async component), which drops the staff-only inquiry address. A price, a rate or an address is typed **once, in the settings**; a section's words are typed on the section. A Picker's or Cards' `price` stays typed text (the answer to the phase 2 question: a price a block shows from the settings is a block that exists to show it). The sponsor set's footer line (service line, phone, address, a link to the credit guidelines) is `components/Page/SetFooter.tsx` under the last section.
- **The inquiry form's timing token is fetched, not rendered.** The page that holds the form is cached, so `InquiryForm/Form.tsx` asks `GET /sponsor/inquiry-token` (a route handler, `no-store`) when it is shown. A visitor without script can read the form but not send it (the action answers a form with no token as "open for a long time" and keeps what was typed). `/sponsor/inquiry-token` is the one address under `/sponsor` that a route owns (`RESERVED_PATHS`, `lib/paths.ts`); the rest of `/sponsor` is for pages.
- **The six sponsor pages were written by a migration** (`20261119_050400_sponsor_pages`, through the Local API, from the old global's current words by `lib/sponsorship/to-sections.ts`, pure and tested: a test fails if a word of the old pages is lost, and lists the one that was dropped on purpose). The contract anchors are section anchors: `/sponsor#inquire`, `#places`, `/sponsor/on-air#rates`, `#carpool`, `#programs`, `#packages`. Do not rename them.
- **The giving set's five blocks read the Giving settings and show nothing it does not hold** (`sets: ['giving']`: Gift card, Giving levels, Ways to give, Thank-you, Giving contact), through `lib/giving/load.ts` (`loadGivingSettings`, imported inside the async component). A level, an amount, an address, the phone and the email are typed **once, in the settings**; the words are typed on the section. The giving footer line (the settings' service line) is `components/Page/SetFooter.tsx`. A giving block never draws a field for card, bank or payroll details, and the Gift card's test fails if one appears.
- **A block that needs the request's query gets it from the page context, never from the request.** `SectionContext.query` is set only by a coded route that renders its page record per request (`components/Page/SectionsRoute.tsx`; `/support/ways` for `?way=`, `/support/thanks` for the donor's name, amount and frequency). On the cached catch-all it is `undefined` and the block shows its plain state. The rules test still forbids `searchParams`, `headers` and `cookies` in `src/blocks/sections`.
- **A page that asks not to be indexed (`noindex`) is left out of its set's sub-navigation and shows no strip** (the thank-you page is where a gift ends, not a place to browse). `/support` is no longer a reserved first segment; `RESERVED_PATHS` keeps the two old Grove stories under it that redirect to the sponsorship pages.
- **Phase 5 (2026-11-19) moved the schedule, the podcast directory and WUWF Listens into pages, and the last words typed in code into the Shared text global** (`globals/SharedText.ts`, `lib/shared-text`): the calendar's guidelines, the membership appeal (`MembershipAppeal` takes its words as a prop and draws nothing without them) and the fellowship explanation. Add a new shared sentence there, not in a component.
- **The Listens blocks read the Portal's hub only from `SectionContext.listeningHub`**, which `/listens` (a coded shell, per request, with the reader's hashed address) loads and passes to `SectionsRoute`; on the cached catch-all it is `undefined` and the blocks draw nothing. A block that holds a client form (Ask WUWF, a kitchen table, the host form) loads it with `await import()` in its async wrapper and passes it to a pure view, because the registry is read by the Payload CLI and the forms reach `server-only` modules. A page set can switch its sub-navigation off (`PageSetSpec.subNav`; the listens set does).
- **A page that is also a coded shell must be in `CODED_SHELL_PATHS`** (`lib/page-sets/shells.ts`): the catch-all builds a static page for every page record, and a prerendered `/listens` was served instead of the shell, so on staging the hub drew none of the Portal's campaigns, questions, sessions or outcomes (it worked in dev, which does not prerender). `shells.test.ts` fails when a route that renders a record is missing. After adding a shell, run `pnpm build` and check the route table: it must be `ƒ`, not `○`.
- **Broadcast schedule** (library block) reads `lib/live/week.ts` (the Listen live streams and Cadence, through a one-minute clock); **List** has the **shows** source, **episodes from every listed show** and the **tiles** and **rows** layouts, all read through `loadDirectory`. `/podcasts` is a page of sections (a section may not be named `podcasts`).
- **Queries into a block field**: `equals`, `in`, `like`, `not_like`, `exists`, `and`, `or` work; `contains` fails on JSON; values are letters, digits, space and `_ @ . - + :` only; `not_equals` means "has some other block". Scripts that write draft pages send whole documents (a partial draft write can leave `title` and `slug` empty in the version).

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
- **The Network queue is the list view of `network-items`** (`components/admin/NetworkQueue`, set in the collection's `admin.components.views.list`), not a second screen beside a list of the same rows; the collection's plural label is "Network queue", and `/admin/network-queue` redirects to it (`redirects.ts`). Tabs with counts (Waiting, Kept for later, Removed at the source), a source dropdown, 25 a page, tick-and-act, and **Dismiss always asks first**, because it clears the story's words for good. `PUBLISH_AVAILABLE` (`lib/network/queue.ts`) is the one switch for the "Publishing is not available yet" banner; turn it on when the converter exists, do not draw a disabled button per row.
- Status changes on a `network-items` row are checked in `lib/network/status.ts`: an editor may keep, release and dismiss; `published` and `gone` come only from the system (`context.networkSystem`).

## The admin: sidebar and look

- **The sidebar is one tree, `src/lib/admin-nav.ts`**: ten headings in daily-use order (Stories, Pages, Shows & series, Events, Organize, Media library, Sponsorship, Members & accounts, System, Site settings), at most two levels (Events > Community calendar / RadioLive). `components/admin/Nav` draws it, replacing Payload's one-level sidebar, with Payload's own wrapper, hamburger, group toggle and logout; `plugins/adminNav.ts` (runs last) sets every entity's `admin.group` to its top-level heading **and sorts the config into the tree's order**, because Payload's dashboard groups and orders its cards by config position. **No collection or global names its own `admin.group`.** To add a screen, put its slug in the tree; to leave one out on purpose, add it to `NAV_OMITTED` with the reason and keep it `hidden` or `group: false` in its own config. `tests/int/admin-navigation.int.spec.ts` fails for an entity in neither place, a name that does not exist, a group out of order, and a heading made only of globals above one with a collection (Payload lists collections first). A heading with more than about six items is a reason to give it sub-groups; a sub-group of one item is not. **Headings start closed** (a sidebar of ten open lists is clutter): one is open only if the person opened it, or, with no choice saved, if the page they are on is inside it (`startsOpen`, `lib/admin-nav.ts`). **A sub-heading sits level with the links around it and only its children step in**, never the heading itself.
- **Settings sit with their domain** (Sponsorship settings under Sponsorship; Giving settings under Members & accounts); Site settings holds only the site's own (Header, Footer, Site settings, Listen live). The coded pages (Home, the three hubs) sit under Pages and leave the tree as they move into `pages` (phases 6 and 7). **Shared text** (slug `shared-text`) is in the Site settings group and is edited by publishers: the community calendar's guidelines, the membership appeal and the fellowship explanation.
- **The look is the design tokens.** `lib/admin-theme/theme.ts` builds Payload's CSS variables (the grey scale, the blue "success" scale, warning, error, radii, the body font) from `@wuwf/design-tokens`, and `pnpm generate:admin-theme` writes them to `app/(payload)/_admin-theme.scss`; `theme.test.ts` fails when that file is stale and holds contrast (text 7:1, muted text 4.5:1, a primary button's white text 4.5:1 and its fill 3:1 against the page, light and dark). Run it after a token change. `app/(payload)/custom.scss` holds only the few nudges Payload needs (primary buttons in the station blue, sidebar headings in the label style, the sub-group rule); **no colour is typed there**, and an admin screen of ours reads Payload's `--theme-*` variables, never a hex. Self-hosted Source Sans 3 comes from `src/app/fonts`.
- **The WUWF wordmark** is the sign-in logo and the navigation icon (`components/admin/Brand`, `public/wuwf-logo.png`); the tab reads "<page> - WUWF.org admin" with the station's favicon. Staff and readers share a heading only in the sidebar: "Users" is labelled "Staff accounts" and readers are "Reader accounts".

## Database

**Migrations and environments (owner decision, 2026-11-18).** The site's production database (`wuwf-site-production`) is empty on purpose until the MVP launches.
A site migration is done when it is applied to **staging** (`wuwf-site-staging`; a pushed branch's preview build applies it with `MIGRATE_ON_BUILD=1`) and **verified there with
real queries** through the Supabase connector (tables and owner, indexes, foreign keys, enums, no Data API access). Do not apply migrations to production one by one and do
not set `MIGRATE_ON_BUILD` for it: production gets all of them at once at launch (`ROADMAP.md` -> *Launch: initializing production*). That only works if **a pushed
migration keeps its name and its SQL**: never rename, regenerate or edit one that has been pushed (if a merge makes its schema snapshot stale, keep the name and regenerate only the `.json`; if the SQL must change, add a new migration).

**Blocks fields are one `jsonb` column each** (`blocksAsJSON`), so there are no `*_blocks_*` tables; read a block field through Payload, never by SQL.

PostgreSQL, **this app's own** Supabase project in hosted environments — never the Portal's two projects.
Locally: `pnpm db:up` (docker compose, port 5433) or any Postgres 16 at `DATABASE_URL`. **In the cloud sandbox there is no Docker: `bash scripts/dev/pg-up.sh` makes and restarts the Postgres (it stops whenever the sandbox idles), with three databases:** `wuwf_site` for the dev server (Payload pushes schema to it), `wuwf_site_test` for the integration tests (built from the config) and `wuwf_migrate` for `payload migrate`. **Never run `payload migrate` against the database the dev server uses** (Payload's docs: push and migrations are not meant to be mixed, and it stops with a prompt); see `ROADMAP.md` → *Running things in a fresh sandbox*. In development
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
- **One site banner, not an emergency notice** (owner, 2026-11-20; its own global since 2026-11-21). The **Site banner** global (slug `site-banner`, in the Site settings group, **publishers** edit it, not only administrators: on/off, **where**: the home page or every page, **style**: emergency or notice, label, headline, body, one link) holds the message; it was the Home page global's Banner tab. `lib/banner` is the pure rules (`bannerOf`, `bannerFor`) and `components/Banner` draws it. The home page's shell (`app/(frontend)/page.tsx`) draws a `home` banner above the page and the root layout draws an `all` banner between the header and the page, **so a banner is drawn once**; both read the global through `loadBanner` → `getCachedGlobal('site-banner')`, so saving it revalidates the tag and every page, and a failed read draws no banner rather than failing the page. One banner at a time. Migrations `20261120_173640_site_banner` (renamed the old `emergency_*` columns) and `20261121_055549_home_page_record_site_banner` (moved them into the new global); do not add a second notice mechanism, add a style or a place to this one.
- **A section's "more" link is in its header.** Home-page sections draw their heading through `components/SectionHeader` (which draws the title through the Kit's `SectionHeading`: an optional eyebrow, the title as a link when the section has a page with its swatch's mark under it, and `more` at the right of the same row; there is no rule under it; pass `swatch`), and block sections through `SectionBand`, whose `more` sits in the heading's row (after the content only when the section has no heading). A titled section of a coded page (the home page's news runs and short videos, a section page's video strip) is `components/TitledSection` (the landmark, `SectionHeader`, the content under it at one gap), and a row of short-video posters is `components/Video/ClipRail`; use them, do not copy their markup. Do not hand-build a section heading, and do not put a "More from…" or "All…" link under the content. The themed show pages keep their own masthead, and the "All stories" button that ends the news band is the band's, not a section's.
- **A section's page carries its short videos** (owner, 2026-11-20). On the first page of `/<section>`, between the lead story and the grid, `StoryListView` draws a `TitledSection` of `ClipRail` with "All videos" in its header, for the clips whose **story** is filed in that section (`lib/video/section`, `clipsForSection`). A clip has no section of its own (an editor would say it twice), so a clip with no story is on `/video` and the home page only. `loadClips` asks for the story's `section` through `populate`, because `Posts` `defaultPopulate` leaves it out. A section with no clips shows nothing. Saving a clip refreshes its story's list pages. Topic and person pages do not carry one yet; `StoryListView`'s `clips` prop is where it would go.
- **The home page is a page of blocks** (owner decision, 2026-11-20; switched 2026-11-21; `PAGE-BLOCKS.md` → Home). It is the page record whose **address name is `home`** (it has no path of its own; `resolveHome`), in the home set, served at `/` by the coded shell `app/(frontend)/page.tsx` (in `CODED_SHELL_PATHS`, so it is rendered per refresh and not prerendered by the catch-all). The home set's blocks (Front page lead, Fellowship feature, News run, Show spotlight, Feature panels, and List's Short videos) are its sections. **The old coded page and the Home page global are gone:** the global (slug `homepage`) is hidden and read by nothing, kept only until the next cleanup drops it (like `sponsorship` and `support-page`; it is in `NAV_OMITTED`); do not add a field to it or read it. The page's **foot is the set's, not a block** (`components/Page/HomeFoot`: the "All stories" button and the membership appeal, whose words are Shared text), so an editor cannot delete the way to the rest of the news. A short-video row can put one series first (List, "Series first"). The old page's "Latest stories" stand-in (shown when no news section had stories) was not carried over: a home page with no News run shows none, so an editor adds a List of the newest stories if they want one. `/home-blocks` redirects to `/`. A database with no home page gets one from `pnpm seed:home` (staging only; it never replaces an existing one without `--replace`); production gets its page at launch (`ROADMAP.md`, "Launch: initializing production"). **A set owns its sponsor places (`PageSetSpec.slots`), no block does**: never add a block that draws a placement, and never let an editor place, hide or duplicate one among the sections. **A set with `dedupe` hands its stories out in the page's order (`claimRequest`, `context.claims`)**: a block that lists stories takes part in it, and a block that draws the page's top unit itself sets `drawsTop`. A set that carries no sponsor message has `placements: false` (giving, Listens, sponsorship).
- **The header is sticky, and the home page's first screen fits under it** (owner, 2026-11-20). `Header` is `sticky top-0 z-40`; `--header-h` (`globals.css`: 4rem, 6.75rem when the header has its second row of section links) is how tall it is, and `html` has a matching `scroll-padding-top`, so a link to a place on a page does not land under it. The lead band (`components/Homepage/FrontPage.tsx`) is a `FirstScreen`: the top unit and the lead are as tall as the window leaves under the header (never above 62rem), so The Briefing starts just under the fold; a page's top banner is not counted, so with one on, the picture runs past the fold. The lead shows its **dek** under the headline (else its description). A news run's lead card that spans columns is a **row** (`leadCardClasses`: the picture left, headline and summary right), never a wide short picture, so the card beside it is not stretched.
- **Sub-navigation inside a section goes through `components/SectionNav`.** One `<nav>`, one line that scrolls sideways on a phone, 44px links, `aria-current="page"` on the current page, and only links to places that render (build the list in a pure helper, as `lib/radiolive/nav.ts` does). Do not hand-build a row of links; if a section's masthead is its own design (the Voyager), say so in the component.
- **There is one player, and every play button hands its audio to it.** The `<audio>` element lives in `PlayerProvider` in the root layout, so audio keeps playing as the reader navigates (use `next/link`, never a plain `<a href>` to a site page, which reloads and stops it). It plays the live stream or one on-demand `Track` (`lib/player/track.ts`), never both. Anywhere a page offers station audio (a card, a story, a show, the home page) it renders `components/ListenLive/PlayAudioButton` (or `blocks/AudioPlayer`, which wraps it) with a track from `trackFromAudio`; **never put an `<audio>` element on a page** (the one exception is the visitor's own recording in the listening flow). Any query that feeds `Card` must select `featuredAudio` (`CARD_FIELDS` does). Nothing autoplays.
- **Buttons, eyebrows, chips and heading highlights come from `components/Kit`** (direction C2; `ROADMAP.md` -> *Direction C2*): `Button` / `buttonClasses` (a pill; never a new `rounded-sm` button string), `Eyebrow`, `SectionChip`, `NumberBadge`, `SectionHeading` (serif 600; the `.mark` highlight reads `--mk`). `Card` has `variant="editorial"` (the home page's news runs: no border, a `rounded-4` picture with the story's section as a `SectionChip` caption; the query must populate `section`, as `CARD_FIELDS` does; every list of stories uses it too: section, topic, person and `/latest` pages through `StoryGrid variant`, the fellowship hub, the archive block and "More from" on a story page. A feeder must select `section` (a story loaded as another record's relation comes back with only `Posts` `defaultPopulate`, which has no `section`, so it draws no chip and keeps its topics line, which is acceptable; `lib/lists`, `lib/fellowship` and the story page's "More from" select it), and list pages' title is a `SectionHeading` with the section's swatch (`StoryListData.swatch`), the story page opens with the section as an `Eyebrow`, and `PlayAudioButton` is the Kit's `play` button (lime idle, ink playing; `toned` inside a section band). **A section's colour is its `swatch`** (`Sections`, field "Colour", palette in `lib/swatches.ts`), chosen from a fixed palette and never typed: add a colour to the palette, with its tokens, rather than a hex or a free colour field. A swatch is looks only; it never changes a section's address.
- **The hubs are in the C2 look** (slice 6): RadioLive and Unearthing Florida use the Kit for headings, eyebrows and buttons, `rounded-4` media and `rounded-lg` cards, and **no hex**: the hub palette is `warning-*` (use opacity, `bg-warning-border/35`, for a lighter mat; an svg takes `fill-*`/`stroke-*` classes). A heading on a hub's own ground reads its highlight by redefining `--tone-mark` on the heading (`[--tone-mark:var(--color-wuwf-lime)]` on RadioLive's dark ground, `…surface` on Unearthing's warm ground). Buttons are ink by default; the blue `action` button is only the donate ask and the Listening screens. The Voyager's badge (`VOYAGER_BADGE_LABEL`) is a teal `SectionChip` on cards and story pages; its masthead is its own.
- Logic separate from presentation: pure, tested modules for publishing, revenue, entitlement and
  listening logic; components stay thin.
- Colours, type and spacing come from `@wuwf/design-tokens`; no one-off hex values or pixel sizes.
- Accessible by default: real buttons and links, labelled controls, 16px minimum on any focusable text
  field on a phone, touch targets of at least 44px, text contrast of at least 4.5:1.
- The site must stay usable if analytics, sponsorship serving or personalization is down. The site banner
  (above) is how an emergency is shown, so it is a first-class state of the site.
- Distinguish what is implemented from what is a demonstration. Incomplete integrations are represented
  honestly, never faked.
- Do not deploy to production, apply migrations to the Portal's Supabase projects outside its ledger, send
  live communications, or create paid services without authorization.
