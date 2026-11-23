# Pages built from sections: the plan

**Status: proposed 2026-11-19. Nothing here is built. Phase 0 was run on a scratch database the same day: see "Phase 0 findings" in
`ROADMAP.md`; its checklist below is annotated and the Design section is corrected where it found a difference. The block catalogue
was then cut to follow board 28 ("Section system") of the design canvas, checked against the code; see *Sources*.** **Phase 1 (the foundation) was built the same day; see its checklist. Phase 2 (the library) was built the same day too, awaiting the owner's look at the sample page. Phase 3 (the sponsor pages) was built the same day, and is the decision point below. Phase 4 (the giving pages) was built on the owner's instruction to go ahead, before the phase 3 exit check in staging; see its checklist. Phase 5 (words still in code) was built the next day on the same footing; see its checklist for where it differs from this plan.** Rules live in
`CLAUDE.md`; state and history in `ROADMAP.md`. This file is the
design and the order of work for moving editor-composed pages into the `pages` collection as an ordered list of section blocks. It
follows a section-by-section audit of all 40 public routes (2026-11-18) and a check against Payload's 3.92.1 docs and adapter source.

## What changes, in one paragraph

Today a landing page is a coded route, a view component and a global holding its words; editors can change words and hide sections, but
cannot reorder, add or duplicate a section or make a new page. After this plan, every page an editor composes is a record in `pages`
with a `sections` blocks field; a developer adds a **block** (a section type), never a page. Bespoke design is kept, as blocks offered
only on the page they belong to and a page-level theme. Globals go back to being settings and shared data.

## Decisions this reverses (to be recorded in `CLAUDE.md` and `ROADMAP.md` in phase 1, not before)

| Earlier decision | Where | What replaces it |
|---|---|---|
| "Staff edit pages whose structure a developer has set... Fixed structure uses groups and named tabs, not a blocks field" (2026-11-02) | `ROADMAP.md` → *Pages and templates* | Editors order sections; a developer sets which blocks exist and where each is offered |
| "Every word, level, amount and address is the `Giving pages` global" | `CLAUDE.md` → *Decisions that are made* | Section words live on the page's blocks; levels, amounts, addresses stay in a giving settings global |
| "Every word, price, figure and source line is the `Sponsorship` global" | same | Section words on blocks; rates, packages, programs, form choices stay in a sponsorship settings global |
| Boards 11 to 13 (Unearthing, RadioLive, Voyager hubs) on **layout** | design canvas | Board 28 supersedes them on layout for the three hubs; their copy, content and the owner's sign-off still apply (phase 6) |
| `pages.template` = `standard` or `blocks` ("existing pages only"), admin text "A developer adds templates; staff fill them in" | `collections/Pages/index.ts` | A third template, `sections`; the starter's `blocks` template and its five blocks are retired |

The standing rule "copy and UI configuration live in Payload, not in code" is unchanged and is extended: the audit found words still in
code (phase 5).

## Where each kind of page lives afterwards

| Kind | Home | Examples |
|---|---|---|
| Composed page | `pages`, template `sections` | Sponsor (6), giving (4), WUWF Listens hub, schedule, podcasts, Voyager, Unearthing Florida, RadioLive hub, any new campaign page |
| Written page | `pages`, template `standard` (unchanged) | About, policies, everything the Grove converter imports |
| Record with a fixed template | its own collection (unchanged) | Stories, shows, episodes, artists, RadioLive shows, fellowships, clips, live blogs, section and topic lists |
| Application | coded route (unchanged) | Listening flows, account, search, community calendar, event submission |
| Settings and shared data | globals | Header, footer, site settings, listen live, giving settings, sponsorship settings |
| **Done (2026-11-21)** | Home | The home page is the page record in the home set with "Use as the home page" ticked, served at `/` by a coded shell; the `homepage` global is retired (hidden, read by nothing, dropped in the next cleanup). The banner is the Site banner global. See *Home*, below |

## Open decisions for the owner

1. **Who edits which pages.** `pages` needs `content.write` to save a draft and `content.publish` to go live. Today sponsor pages need
   `content.publish` and giving pages `membership.manage` or `content.publish`. Proposed: a page belongs to a **page set** (below), and
   the set names the permission that may edit it, so membership staff keep the giving pages and nothing else.
2. **Staging data when storage changes.** Production is empty; staging holds imported stories whose featured media is a blocks field.
   Proposed: convert in a migration (Payload ships a converter). The alternative is to rebuild staging from the import. *Phase 0: the
   converter moved a seeded set of posts, pages and a form with no differences, so conversion is workable; it has no `down`, and
   other branches' previews break against a converted staging (see Design → Storage).*
3. **Home stays a global** until phase 7. *Superseded 2026-11-20: built as blocks beside the coded page, switched on the owner's say (see "Home" below).*
4. **How far editors may go on the bespoke hubs.** Blocks can be reordered and removed by anyone who can edit the page; Payload has no
   lock on a blocks row. Proposed: accept it (drafts, preview and version history make a mistake cheap to undo).
5. **The tone list.** Board 28 has four tones (`plain`, `grey`, `accent`, `dark`). The built pages also use teal and lime bands. Either add
   `teal` and `lime` tones, or accept that the sponsor and giving bands change colour when they move. *Built on the recommendation (2026-11-19): `teal` and `lime` tones are in the station theme; the owner can still say otherwise.*
6. **The Unearthing explore map and timeline.** Kept as a set-only block only if the owner wants it; board 28 marks it "decision pending".
7. **`themeColors` on publishing identities.** It stores colours in the CMS as a JSON field, which a theme now replaces. Retire it when
   the themes ship, or keep it for shows (`lib/shows/themes.ts` does not read it).
8. **Three forms drawn on board 28 do not exist in code**: the Unearthing tip, the Voyager pitch and the Barefoot Mary story. Each would
   be a new feature (a recipient, a rate limit, no storage), not a move. Build them, or draw the closing band without a form on those hubs.

## Design

### Storage: blocks as JSON

Set `blocksAsJSON: true` on the Postgres adapter. A blocks field becomes one `jsonb` column instead of a table per block type (and per
list inside a block, all doubled for drafts). Phase 0 ran it on Payload 3.92.1 with Postgres: drafts, autosave, restore, scheduled publish,
live preview, population, `where` queries and field-level access all work with blocks stored as JSON (details and the commands in
`ROADMAP.md` → *Phase 0 findings*). The differences from what this section first said are below.

- The setting is database-wide: `posts.featuredMedia`, `pages.layout` and the form builder's `fields` switch with it.
- **The converter is a predefined migration:** `pnpm payload migrate:create <name> --file @payloadcms/db-postgres/blocks-as-json`, run
  with `NODE_ENV=production` and `< /dev/null` (no dev schema push, no prompt). It writes the migration and its snapshot and rewrites
  `payload.config.ts` to set `blocksAsJSON: true` (reformatting the whole file with Prettier: keep the flag, revert the reformat). The
  migration reads every document and every version, drops the block tables, adds `jsonb` columns and writes the rows back, in one
  transaction. **`blocksAsJSON: true` must already be in the config when `payload migrate` runs**, or the write-back fails (and rolls back).
  `scripts/vercel-build.sh` migrates before it builds, so committing the flag and the migration together is the right order.
- **The converter has no `down`.** The generated `down()` is empty: `migrate:down` marks the migration undone and leaves the JSON schema.
  A working reverse (read the JSON, create the tables with the same drizzle-kit diff run backwards, write the rows back) was built as a
  scratch script and round-tripped with no differences, so phase 1 writes it by hand into the migration's `down` (and tests up, down, up).
- **The converter reads through the config as it is when it runs.** So on a database whose tables lack a column a later migration adds, it fails
  (found by `verify:migrations`, which replays every migration on an empty database). The pair is therefore ordered `sections_pages` (the
  page columns) then `blocks_to_json`, and `blocks_to_json` skips its data pass when the tables are empty (a replay, a fresh install,
  production before launch). On a database holding content, apply it before any later migration that changes pages, stories or forms.
- **A blocks field with no `filterOptions` keeps an unknown block type** when stored as JSON (relational storage dropped it). A story's
  featured media has the old behaviour back through `keepOnlyBlockTypes`; the pages' `sections` keeps unknown types on purpose (see above).
- **Staging is shared by every preview build.** Once staging is converted, a preview of any branch without the flag and the migration reads
  tables that no longer exist. Say so in the phase 1 pull request and rebase open branches before it merges.
- Lost: database-enforced links from a block to media or pages. A deleted item leaves a dead id, as it already does in story bodies
  (rich text is JSON today); a read returns the bare number (not `null`) at every depth. Every block component must render nothing for
  a missing relation, and must test `typeof value === 'object'` before using a populated one. A save with a dead id is accepted.
- Renaming or removing a block field leaves old data in place, and so does "Paste Row" over a block of another type (the old block's
  field names stay in the pasted block's JSON). Harmless to render; a data script is needed to clean up. Adding a field needs none.
- **Queries into a block field** (`where`: `sections.blockType`, `sections.title`, `sections.items.label`, an upload or relationship
  inside a block, `version.sections...` through `findVersions`) work with `equals`, `in`, `like`, `not_like`, `exists`, `and` and `or`.
  Not with `contains`: it fails with a database error (a 500) on a JSON field in 3.92.1; use `like`, which matches a substring, ignoring
  case. A value may contain only letters, digits, space and `_ @ . - + :` (anything else is a 400). `not_equals` and `not_in` mean
  "has some block that is not X", not "has none": to find pages without a block, find the pages with it and exclude their ids. There
  is no index on the JSON column, so such a query reads every page; fine at this scale, and not measured.
- **Field-level access inside a block is enforced** (read, create and update), also in a block listed by `blockReferences`, and a field an
  editor may not read or write keeps its stored value through a reorder or a delete of other blocks (it is merged back by block id). A
  block that arrives with a new id (pasted or duplicated) starts without it. `restrictedBlocksGuard` is still needed for rich text, not
  for a blocks field.
- **`filterOptions` also validates.** A page holding a block its set does not allow cannot be published (the error is "The block X is not
  allowed", on the block); a draft saves. Changing the page set of a published page that holds a set-only block fails the same way until
  the block is removed. An unknown block slug is rejected in this field, not dropped.

### The `pages` collection

- `template`: `standard` | `sections`. (`blocks` is removed in phase 1 after its pages are converted.)
- `sections`: a blocks field, shown when `template` is `sections`. Blocks are defined once in the config's root `blocks` and listed by
  `blockReferences`, so the same definition can also be offered in story bodies without growing the config.
- `pageSet`: select, optional. `theme`: select, defaults from the set.
- `navLabel`, `navOrder`: how the page appears in its set's sub-navigation.
- `noindex` and `noReferrer`: checkboxes read by `generateMetadata`, for the thank-you page (today `robots: { index: false, follow: false }`
  and `referrer: 'no-referrer'` in `support/thanks/page.tsx`). They are page-level, not set-level: one giving page needs them, the rest do not.
- Kept as is: `path` (unique, resolved by the catch-all route), SEO tab, drafts with autosave, scheduled publish, 50 versions, live preview.

### Page sets (`src/lib/page-sets/registry.ts`)

Code, in the manner of placement zones: a set is a small record in a registry, a page chooses one.

| Set | Theme | Edit permission | Blocks offered only here |
|---|---|---|---|
| `sponsor` | wuwf | `content.publish` | Rate estimator, inquiry form, open event programs |
| `giving` | wuwf | `membership.manage` or `content.publish` | Gift amount card, giving levels, ways-to-give switcher, thank-you hero |
| `listens` | wuwf | `content.write` | Report list with bars; open questions, sessions, answered (Portal data) |
| `voyager` | voyager | `content.write` | None. No masthead block: the theme carries the identity (the owner is not committed to the masthead) |
| `unearthing` | unearthing | `content.write` | Explore map and timeline (owner decision pending) |
| `radiolive` | radiolive | `content.write` | None |
| none | wuwf | `content.write` | Library blocks only |

A set gives: the sub-navigation (pages in the set by `navOrder`, through `components/SectionNav`, for every set including the Voyager),
the footer line (the sponsor and giving sets print the settings global's `serviceLine` under the last section, as
`Sponsorship/parts.tsx` and `Giving/parts.tsx` do now), the default theme, who may edit, and (through the blocks field's `filterOptions`)
which set-only blocks appear in the picker.

### Block or variant

**A variant changes layout over the same fields and the same data source. If the fields or the source differ, it is a separate block**,
because Payload's generated types, picker thumbnails and `filterOptions` all work per block, not per variant. So Feature has `hero` and
`split` (same typed fields), while Featured record is its own block (its source is a picked or computed record).

A variant is a `variant` select on the block, with fields shown by `admin.condition`. Phase 0 (item 9) found: a `required` field under a
false condition does **not** block a save or a publish (server side the condition is honoured); a visible required field does. A hidden
field's data is **kept, never cleared**: switching the variant and back restores the earlier values, a partial API update keeps them, and a
hidden field holding an invalid value is not validated. So a variant's component reads only its own variant's fields, no validation may
rely on a hidden field, and leftover values are harmless but accumulate (the same clean-up script as for renamed fields).

### Columns (added 2026-11-19, after the phase 3 review)

**Optional multi-column layouts as a block that holds other blocks**, as Grove's modules nest. The first arrangement of the sponsor pages had no way to put two things side by side, and the old coded pages did (a sample sponsor message beside a rate table, "a credit includes" beside "a credit leaves out"); I had added one-off fields for some of them (a second list, a hero aside) before the owner proposed the general answer.
- `sectionColumns` (group *Layout*): two or three columns, a layout variant (`equal`, `left-wide`, `right-wide`), each column a short list of sections. The tone, anchor and spacing are the Columns block's; what it holds draws **inline** (`SectionBand` renders a bare `div`, with its own heading if it has one). A phone stacks the columns in order. An empty column is dropped.
- **One level only, and a short list** (`blocks/sections/inline.ts`): Text, Cards, Stats, Check list, Callout, Quotes, Table, Questions, Steps and Illustration. Not Feature (a hero is an `h1`), not Columns, not forms, pickers, data blocks or the set-only blocks. Stored as JSON, a nested blocks field keeps a type it does not list, so the field validates the rule itself (tested at publish).
- **Anchors are unique across the page and its columns** (`duplicateAnchors` walks them). Hidden sections inside a column stay hidden. The rich-text guard walks every object already (tested on pages as a whole).
- `sectionIllustration` is *inline-only* (`inlineOnly` in its registry entry: not offered on a page's own list): a dashed, decorative "sample" card with a label, a made-up sponsor and its address as text. The sample page leaves out inline-only and set-only blocks (they cannot sit on it).
- Cost: every block draws through `SectionBand`, so inline mode is one branch there; `RenderSections` is loaded by Columns when it draws (the registry imports Columns, so it cannot import `RenderSections` at the top).
- Not done: columns inside a set-only restriction (a nested block is not checked against the page set), a column width in pixels or percent (named layouts only), and Columns inside Columns.

### Anatomy of a section block

`src/blocks/sections/<Name>/` holds `config.ts`, `Component.tsx` and a test. Every block gets the same first fields from one builder:

- `hidden`: keeps today's "Show this section" switch, so a section can be parked without deleting it.
- `anchor`: optional, lower-case and hyphens; unique within the page by a validation on the blocks field (not `unique`, which Payload
  applies across the whole collection).
- `tone`: a named ground (`plain`, `grey`, `dark`, `accent`), never a colour value. The theme decides what each name looks like.
- `heading`: eyebrow, title, intro, where the block has one.
- `variant`: where the block has more than one layout (see above); a developer adds variants.

Rules: a block is a full-width band and owns its own spacing (inside Columns it draws bare); a block with nothing to show renders nothing; at most one level of list
inside a block, and one level of nesting (Columns); a block's thumbnail (3:2) and picker group are part of its definition; no free colour, spacing or HTML fields.

`components/PageParts` stays the rendering kit. Library blocks are thin configs over it; the existing view files are taken apart into
blocks, not rewritten.

### Rendering

`RenderSections` replaces `RenderBlocks`: no wrapper margin, a typed map from block slug to component, and a page context passed to
each block (theme, set, draft flag). The catch-all route is cached for an hour; three existing pages need request data (`/sponsor`
for its form token, `/support/ways` for `?way=`, `/support/thanks` for its query).

**Phase 0 disproved "a block declares that need, and a page holding one is rendered per request".** On a production build, a block whose
server code calls `connection()` or `headers()`, or a page that awaits `searchParams` because it holds such a block, does make that one
page per request, and the other pages stay cached, but only for a page that was not prerendered at the build. A page that was
prerendered and is then edited to hold such a block answers **500 on every request** (`DYNAMIC_SERVER_USAGE`, its message hidden in
production) until the block is removed (run for `connection()` and `searchParams`; `headers()` is the same kind of call). The editor cannot know which state a page is in, so no editable block may do it. The rules:

- **A block never reads request data on the server** (no `headers()`, `cookies()`, `connection()` or `searchParams` in anything a block
  renders; the draft flag arrives in the page context, which the route already reads). A test over `src/blocks/sections` fails when it finds one. A block's server component is a function of the
  page record and the shared settings only.
- **Request data reaches a block through a client component**: `useSearchParams` inside a `Suspense` boundary for a query parameter, and a
  fetch to a route handler (or a server action at submit) for a per-request token. The page stays cached; the server HTML holds the
  fallback, so a query parameter's effect is not in the HTML a crawler sees. This was run for a query parameter (cached page, browser read
  `?way=`) and not for a token.
- **A page whose content must come from the server per request stays a coded route** that loads its `pages` record by path and renders
  it with `RenderSections`, passing the request data in as a prop. It is the same blocks and the same editing; only the shell is code.
  Decide in phases 3 and 4 which of the three pages need that. `/support/ways` does: the ways switcher is chosen on the server by `?way=`
  and must work without script (item 11: a client island shows the default panel to a visitor without script).

**Keeping a block current (phase 0, item 8).** The route's one setting (3600) is the ceiling, and a block can lower it for its own pages
only. A block that shows time-dependent data (Dates, Featured record, List) loads it through `unstable_cache(fn, key, { revalidate: N,
tags })` in a shared helper; a page holding it is then cached for N seconds instead of 3600 and the others are untouched (run: a block with
`revalidate: 20` made its page `s-maxage=20`, and a show whose end time had passed was gone on the first request after the next
regeneration; the same block without it was unchanged, its window being 3600). N is a property of the block or its variant, so the hubs keep
today's intervals (RadioLive 1800, Voyager 600, Unearthing 3600) without a route each. For a drop-off at a stated time rather than within
N seconds, a scheduled call to `revalidateTag` refreshes exactly the pages that read the tag (run; it needs a cron route, and
`vercel.json` already has one cron). Hiding a past item in a client component is a complement only: the server HTML still lists it for a
visitor without script. `unstable_cache` is the previous caching model in this Next version; moving to `use cache` later is a known cost.

A separate finding, not about sections: on the scratch production build, a page created after the build (not in `generateStaticParams`
then) was rendered per request with `Cache-Control: no-store`, including a plain `standard` page, even after `revalidatePath`; pages
that existed at the build are cached for an hour. The cause was not found and it was not checked on a Vercel deployment.

### Shared data stays in globals

Blocks that show prices, levels or contact details read them from a settings global, so one change updates every page:

- `giving-settings`: levels, message tiers, donation form address and switch, phone, email, service line. Also read by the account page
  and show support pages, as today.
- `sponsorship-settings`: rate card, packages, Carpool prices, event programs, form interests and budgets, phone, address, inquiry
  address (still restricted), the sample sponsor.

Saving a settings global must revalidate every page that holds a block reading it. Phase 0 (item 10) ran this: a block that reads the
global through `getCachedGlobal` (tag `global_<slug>`) refreshes on every page holding it, and on none that does not, after the global's
`afterChange` hook calls `revalidateTag`; the first visitor after the save still gets the old page (stale while revalidate), the next the
new one. A block that reads the global directly (`payload.findGlobal`) is **never** refreshed by the save and stays stale for up to an hour.
So blocks read settings only through `getCachedGlobal`, and every settings global keeps the tag-revalidating hook (a test over
`src/blocks/sections` for direct reads, and one per global for the hook). The existing hook's `revalidatePath('/sponsor', 'layout')` is not
what refreshes a page at another path; the tag is.

### Themes

`src/lib/page-themes`: token overrides per theme, emitted with `themeCss` from `@wuwf/design-tokens` and checked with its contrast
helpers in a test (4.5:1 for text on every tone). Themes: `wuwf` (default, no overrides), `voyager`, `unearthing`, `radiolive`. The
themed shows already work this way (`lib/shows/themes.ts`); this reuses the mechanism for pages. The hard-coded `#E9D5A8` on the
Unearthing hub becomes a theme token.

Board 28's Voyager and Unearthing token values are placeholders (its author calls them a reading of the hub boards): the owners confirm
them before phase 6. Two findings from checking the board against the built pages:

- RadioLive's lime button on a white ground is 1.5:1 against the page, so the contrast test checks a **button against its ground (3:1)**
  as well as text on every tone (4.5:1).
- The built pages use teal and lime bands that the four tones do not include (open decision 5).

### Moving a page across

Next serves a coded route before the catch-all, so each page moves in one change: a migration writes the page record at the same path
from the global's **current** values (through the Local API, as `20261117_194934_sponsorship_copy` did), and the same change deletes the
coded route and its view. The global's page fields are dropped in a later migration, once the page is confirmed.

These addresses are contracts and get a test each: `/sponsor#inquire`, `/sponsor#places`, `/sponsor/on-air#rates`, `#carpool`,
`#programs`, `#packages`, `/support#levels`, `/support#fellowships`, `/support/ways?way=<value>` (see `lib/giving/legacy-addresses.ts`).

## Block catalogue

**Library, about 18 blocks**, offered on every `sections` page: board 28's 15 with the corrections below. † reads a source, not typed fields.

| Block | Variants | Fields or source; replaces |
|---|---|---|
| Feature | hero, split | typed: label, headline, line, actions, image or audio; 10 openers, 6+ split bands |
| Featured record † | hero, split | a picked story, episode or show, else "newest of X"; computed leads (RadioLive next show, `RadioLiveHub.tsx:22`; Voyager, Unearthing) |
| List † | grid, rail, numbered, lead + list | stories, episodes, videos or artists; A–Z of artists only if a page needs it |
| Cards | | title, text, link, optional tag or price; about 10 |
| Quotes | | quote, name, role |
| Dates † | rows, cards | RadioLive shows or community events, or typed. Not "Schedule" (`/schedule` is the broadcast schedule) |
| Profile band | text + image, roster | about, hosts, staff, "who listens" |
| Support | | hands off to the donation form |
| Credit † | | the agreement's line (`Acknowledgment`); names the production, fellowship or series, as a page has none |
| Text | | `bodyEditor` in a band |
| Stats | tiles, compare | source line required; 15+ |
| Steps | grid, list | |
| Questions | | |
| Callout | tint, quote | |
| Check list | | |
| Table | | typed rows only; not the on-air rate table, which lives in the estimator and shares its selected row (`RateEstimator.tsx:18-26`) |
| Picker | | one option, one panel; sponsor goals, Audience sectors |
| Closing band | | board 28's "Call to action · buttons" |
| Columns | equal, left wide, right wide | two or three columns, each holding sections (added after phase 3) |
| Illustration (inline only) | | a decorative sample card, in a column |

*Open design question:* the last sponsor goal is generated from open event programs (`lib/sponsorship/goals.ts:26`) and goal prices are typed
text today; how a Picker panel refers to a price in `sponsorship-settings` is not decided.

**Set-only blocks, about 9, and why none is a library block:** rate estimator (arithmetic, shared row); gift amount card and thank-you hero
(read the address); inquiry form (Payload's form builder stores submissions, `src/plugins/index.ts:66`, but a proposal request is never
stored, `CLAUDE.md`; also a honeypot and a timing token); ways-to-give switcher (chosen on the server by `?way=`, two levels, works
without script, old addresses redirect into it, `lib/giving/ways.ts:19`, `legacy-addresses.ts`; not a Picker); giving levels (sorted by
amount in code, each builds a donation link); open event programs; Listens report list with bars; Unearthing map and timeline (owner
decision pending). The listens set's open questions, sessions and answered also read the Portal's API: data blocks of that set, not List.

## Order of work

Each phase is one or more pull requests and ends with the app's own checks green: `pnpm typecheck`, `pnpm lint`, `pnpm test:int`,
`pnpm build`, `pnpm verify:migrations`, and `generate:types` / `generate:importmap` committed.

### Phase 0: prove the risky parts (no user-visible change)

Run 2026-11-19 on a scratch Postgres 16 (port 5433, `wuwf_scratch`), Payload 3.92.1, Next 16.3.3, with `blocksAsJSON` on and a throwaway
`sections` field. The method and the numbers are in `ROADMAP.md` → *Phase 0 findings (2026-11-19)*. Nothing was committed but documents.

- [x] **Pass, with caveats.** Drafts, autosave, version restore, scheduled publish and live preview work on a page with blocks (admin and
      Local API; the admin's versions view diffs the blocks). Caveat: a Local API write of a *draft* with only some fields loses `title`
      and `slug` in the version row; the same on a database with `blocksAsJSON` off, so not a JSON effect. Scripts must send whole documents.
- [x] **Pass, with caveats.** A picture inside a block, in a list in a block and in a relationship in a list is populated at depth 1;
      `select` and `populate` work. After the picture is deleted the page renders (HTTP 200) when the component checks for an object;
      the read gives the dead id as a number, not `null`.
- [x] **Works with this caveat.** `where` on a block field works for `equals`, `in`, `like`, `not_like`, `exists`, `and`, `or` (also on
      versions and drafts). `contains` fails with a 500 on a JSON field; values are limited to `[\w @.\-+:]`; `not_equals` means "has some
      other block".
- [x] **Pass.** Field-level read, create and update access is enforced inside a blocks field, including blocks listed by `blockReferences`,
      and a denied field survives other blocks being reordered or deleted.
- [x] **Pass, with caveats.** `filterOptions` hides set-only blocks in the picker (live, when the page set changes) and rejects them at
      publish. Copy and paste between two pages works ("Paste Row" replaces the row it is used on; it leaves stale field names behind
      when the block types differ).
- [x] **Works with caveats; read these first.** The converter (`migrate:create --file @payloadcms/db-postgres/blocks-as-json`) moved posts
      (`featuredMedia`, with versions), pages (`layout`: media, form, archive with categories, call to action with links, content with
      columns, and a draft-only page) and a form's fields with no differences. **Its `down` is empty** (a working reverse was built and
      round-tripped); the config flag must be set before `payload migrate`; `pnpm verify:migrations` passes, and fails without the flag.
- [x] **Fails as written; works another way.** A block that calls `connection()`, `headers()` or awaits `searchParams` makes only its own
      page per request, but a page that was prerendered and is then given such a block returns 500 until the block is removed. Request
      data must reach a block through a client component (tested for a query parameter), or the page stays a coded route.

- [x] **8. Pass.** Per-page freshness: a block that loads its data through `unstable_cache` with `revalidate: N` lowers the cache window of
      the pages holding it to N and leaves every other page at 3600; a finished show was gone on the first request after the next
      regeneration. A tag plus a scheduled `revalidateTag` refreshes exactly the pages that read it. See Design → Rendering.
- [x] **9. Works with this caveat.** Variant fields: a required field under a false `admin.condition` blocks neither a save nor a
      publish; a hidden field's data is kept, never cleared, and is not validated. See Design → Block or variant.
- [x] **10. Works with this caveat.** Settings to pages: saving a global refreshes every page whose block read it through
      `getCachedGlobal` and no others; a block that reads the global directly is never refreshed. The first visitor after a save sees
      the old page.
- [x] **11. Works with this caveat.** A client block that starts from `?way=` on a cached page works (cache `HIT`, about 6 ms and almost
      no database work per request against about 15 ms and 1.4 transactions for the same page rendered per request); a visitor without
      script sees the default state, and a slow connection sees the default first, then the chosen one.

**Exit:** results written into `ROADMAP.md` (done). Drafts, preview, the converter and freshness did not fail. The design changes are in the sections
below and in the *Risks* table; the two the owner should see before phase 1 are the missing `down` and the request-data rule.

### Phase 1: foundation

Built 2026-11-19 and **applied to staging** by the preview build of `946e5fef` after the owner's go-ahead; verified there with read-only
queries (counts equal before and after, no block tables left). Open branches must be rebased onto it. Details and numbers: `ROADMAP.md` → *Phase 1*.

- [x] Storage: migrations `sections_pages` (the page columns) then `blocks_to_json`, with a hand-written `down`; tested up, down, up on rows
      (zero differences) and on an empty database; `verify:migrations` passes. Applied and verified on staging.
- [x] `sections` template, root `blocks` registry, `RenderSections`, the shared field builder, anchor validation (one block, Cards, as the pattern).
- [x] Page sets registry, per-set edit and publish permission (tested by role), set sub-navigation, `filterOptions`.
- [x] Themes scaffold with the contrast test (text 4.5:1, button 3:1); `wuwf` only, with the `teal` and `lime` tones added.
- [x] Tests that fail when a block lacks a component, a test, a thumbnail or a picker group (mutation-checked).
- [ ] **Not done, now safe:** remove the `blocks` template, `RenderBlocks`, `heros/` and the starter's page-only blocks. Staging was read on
      2026-11-19 (read-only, through the Supabase connector): all 25 pages are `standard`, none has a `layout` block, a hero is used by none, and
      the production database is empty, so there is nothing to convert. Done as its own small change after the migration pair is on staging
      (the verified pair is not reopened for it): it drops the `layout` and `hero` columns, and touches the page view, the rich-text renderer, the
      pages collection and two integration tests that build pages with a hero and a layout.
- [x] `CLAUDE.md` (*Decisions that are made*, a new *Pages and sections* rule set), `ROADMAP.md` and `ARCHITECTURE.md`.

**Exit:** an editor can make an empty `sections` page in staging; nothing public has changed. (Checked on the scratch database: in a browser the admin
offered the Sections template, its page-set and navigation fields and a block picker with Cards under "Collections"; pages made through the
Local API rendered with theme, tone, anchor and set navigation. An admin save was not driven end to end; staging waits for the push.)

### Phase 2: the library

Built 2026-11-19; see `ROADMAP.md` → *Phase 2*. Not yet on staging.

- [x] The library: 18 blocks with their variants, each with a thumbnail, a test and one registry entry. Built over the shared tone-aware parts in
      `blocks/sections/parts.tsx` and the existing logic (`paragraphs`, `toStats`, `Acknowledgment`, `PlayAudioButton`, `FeatureSection` for the
      Featured record); `PageParts` keeps its fixed colours for the pages built before sections, because its markup is not right on a dark tone.
- [x] `restrictedBlocksGuard` walks `sections` (rich text inside block data) before the Text block shipped; tested as an editor, a publisher and an
      administrator, and mutation-checked.
- [x] The data blocks (Featured record, List, Dates, Credit) read through `lib/section-data` with their own `revalidate`, imported only when they draw.
- [x] The Picker with typed prices and a marked seam for the settings reference (the question stays open until phase 3).
- [x] The sample page (`lib/sections-sample`, `scripts/sections/seed-sample-page.ts`): 108 sections, every block in every tone, every variant at least
      once; tested to publish; checked on a production build at 375, 768 and 1280 px (no horizontal scroll, no console error, text and button contrast).
- [ ] **The sample page in staging, and the owner's look at it.** A draft write to one page, on the owner's go-ahead.

**Exit:** the owner has looked at the sample page.

### Phase 3: sponsor pages (the pilot)

Built 2026-11-19; see `ROADMAP.md` → *Phase 3*. Pushed to the working branch; on staging only once its preview build has applied the two migrations.

- [x] `sponsorship-settings` global (data only: contact, the form's choices, the rate card, Carpool, packages, events and programs), with a tag-revalidating hook;
      the five sponsor-only blocks (Rate estimator, Packages, Carpool plan, Open programs, Inquiry form), each tested and registered with `sets: ['sponsor']`.
      (The plan named three; the Carpool and package prices are settings too, so they are blocks that read them.)
- [x] Reference screenshots of the six pages at 375, 768 and 1280 px, taken from the unchanged code before any change (a production build on a local database).
- [x] The six pages moved by one migration at their own addresses (`lib/sponsorship/to-sections.ts`, pure; a test fails if a word of the old pages is lost);
      compared with the reference (anchors, `#` links, text, no horizontal scroll, no console error); anchor tests; the inquiry form still sends (its action and
      tests are unchanged; its token is fetched).
- [x] The six routes and `components/Sponsorship/*` deleted.
- [ ] **The owner's exit check in staging** (below). Not done: it needs the owner.

**Exit, and a decision point:** in staging the owner reorders a section, hides one, and builds a new sponsor page from existing blocks
without a developer. If that is not comfortable, stop here and revise before going on. **Phase 4 was started on the owner's instruction before this check was done; if the check finds the model wrong, phase 4 is revised with it.**

### Phase 4: giving pages

Built 2026-11-19; see `ROADMAP.md` → *Phase 4: the giving pages*. Applied to staging by the preview build of `469682d` and verified there (`ROADMAP.md`); the owner's look is next.

- [x] `giving-settings` global (levels, message tiers, the gift card's amounts, the donation form's addresses and switch, Member Services' contact details,
      the broker details, the members' listening level), with a tag-revalidating hook; the account page, the shows' support pages and the Support block read it.
      Five giving-only blocks, each tested and registered with `sets: ['giving']`: Gift card, Giving levels, Ways to give, Thank-you and Giving contact.
      (The plan named four; the phone and email are settings too, so the contact is a block that reads them.)
- [x] The four pages moved by one migration at their own addresses (`lib/giving/to-sections.ts`, pure; a test fails if a word of the old pages is lost);
      compared with the old pages at 375, 768 and 1280 px (no horizontal scroll, no console error, one h1 each). The old coded views are deleted.
- [x] Old-address redirects still land (`lib/giving/legacy-addresses.ts`, tested against the pages and the ways); the "never collects payment details" rule and the
      form-address fallback are unchanged and tested (the Gift card test fails on an input for card, bank or payroll details).
- [x] `/support/ways` and `/support/thanks` stay coded shells that render their record with the request's query (`SectionContext.query`): the open way and the
      donor's name are decided on the server and work without script, and no block reads the request.
- [x] Membership staff can edit and publish giving pages and the giving settings, and no others (`tests/int/giving-pages.int.spec.ts`, `giving-settings.int.spec.ts`).
- [ ] **The owner's look at the four pages in staging.** Not done: it needs the owner.

### Phase 5: words still in code

Built 2026-11-19; see `ROADMAP.md` → *Phase 5*. **Where the code did not fit the plan, the code won and the difference is listed here.**

- [x] **WUWF Listens hub and `/listens/host` as `sections` pages** in the listens set. The plan said "the report list and the three Portal data blocks"; the season reports (suite phase F) are not built, so there is no report list. The Portal-data blocks are **Open questions** (variants: campaigns, reporters' questions), **Sessions and tables** (variants: sessions, tables) and **Outcomes**, plus **Ask WUWF** (the opening, with its form) and **Host form**; all set-only (`sets: ['listens']`). The hub stays a **coded shell** (`/listens` reads the Portal per request with the reader's hashed address, which a block may not read): the route loads the answer and hands it to the sections as `SectionContext.listeningHub`. `/listens/host` is a shell too, so the address is not taken by `/listens/<publicId>`. The listens set draws **no sub-navigation strip** (`subNav: false`): the pages were two screens of one flow, not a place to browse.
- [x] **Schedule and podcasts as `sections` pages.** The plan said "(List and Dates blocks)". Dates does not read Cadence and List had no show source, so: a new **Broadcast schedule** block (the Listen live streams and NPR Cadence; library, any tone), and List gained a **shows** source (every listed original show, from the directory's own read), episodes **across all shows**, and two layouts (**tiles**, **rows**). The schedule's "other ways to listen" cards moved from the Listen live global to a Cards section on the page; the global's field is hidden and kept until phase 7. `/podcasts` is no longer a reserved first segment (it joins `PAGE_SET_FIRST_SEGMENTS`: a section may not be named it).
- [x] **Not pages, so not blocks.** The community calendar's guidelines, the membership appeal (under every story and on the home page) and the fellowship "How the fellowship works" explanation are a new **Shared text** global (slug `shared-text`, Site settings group; **publishers** edit it, because Site settings is the administrator's). The plan said "Site settings"/"the fellowship record"; the fellowship text is the same for every fellowship, so it is shared, not per record.
- [ ] **The owner's look** at the five pages in staging (below).

**Exit:** the owner has looked at `/schedule`, `/podcasts`, `/listens` and `/listens/host`, and has edited the shared text.

### Phase 6: the three hubs, redesigned to board 28

**Revised 2026-11-23 (the owner, "WUWF Hubs Redesign" canvas): the hubs are rebuilt to that canvas, not board 28; the coded RadioLive and Voyager hubs were works in progress and are replaced directly, with no preview address and no hold for sign-off.** The three themes are built (slice 1), a show's home is a page (slice 2), Unearthing Florida is the first (slice 3), RadioLive the second (slice 4), The Voyager the third (slice 5). See `ROADMAP.md`, "The hubs redesign". The checklist below is the original plan.

- [ ] Themes `unearthing`, `voyager`, `radiolive`, each passing the contrast test (text 4.5:1, button against its ground 3:1), with token
      values the hub owners have confirmed.
- [x] Unearthing Florida, then RadioLive, then The Voyager, each rebuilt from library blocks to the "WUWF Hubs Redesign" canvas (not board 28); hub globals emptied into
      them by guarded data migrations. (The owner's decision of 2026-11-23: the old coded hubs were works in progress and are replaced directly, with no preview address and no hold for sign-off.)
- [ ] Deliberate design that board 28 does not cover is kept or raised with the owner (the Unearthing map, the nameplate).

**Exit:** the owner has signed off each hub. The review behind board 28 did not read boards 11 to 25, so each hub's new look needs the
owner's eye before it is built.

### Phase 7: close out

- [ ] Drop the emptied page globals and their tables; remove dead loaders. **Done so far (hubs redesign, slice 6, 2026-11-23):** the dead loaders (`loadRadioLive`, the Voyager's `loadVoyagerHub` and its helpers), `sites.map_x` and `map_y` (`20261123_040000_drop_site_map_xy`), and the three hub globals (`unearthing-hub`, `radiolive-hub`, `voyager-hub`) are **retired**: hidden, in `NAV_OMITTED`, read by nothing for a visitor (the home page's two hub panels read the shows and the pages). **Still to drop:** those three globals' configs and tables, `homepage`, `sponsorship` and `support-page`. They stay until a cleanup rewrites the data migrations that read them (`unearthing_home_page`, `radiolive_page`, `voyager_page`, and the earlier sponsor and giving ones) to read the tables with SQL, because a pushed migration is never edited and a database built from the migrations alone needs the globals' configs to run them.
- [x] Decide on Home with what has been learned: **built as blocks beside the coded page (2026-11-20)**; switching `/` is the owner's call after comparing (see "Home").
- [ ] Editor notes: what a section is, copy and paste (and that "Paste Fields" replaces every section on the page), page sets.

## Out of scope

Home (until phase 7), stories and their body blocks, record templates, applications, the Grove converter (it keeps writing `standard`
pages), the Portal, and **Barefoot Mary and every show page**. A themed show is a production record with its own theme, fonts, sub-pages,
seasons and members-only episodes (`lib/shows/themes.ts`, `components/Show/themed`); board 28 lists Barefoot Mary as a sections page, and
that is rejected.

## Risks

| Risk | What limits it |
|---|---|
| JSON storage behaves differently with drafts or preview than the docs suggest | Phase 0, before anything depends on it |
| A moved page looks different | Reference screenshots per page; `PageParts` components are reused, not rewritten |
| A shared anchor or query parameter breaks | A test per contract address |
| An editor breaks a bespoke hub | Drafts, preview, version restore; `hidden` instead of delete |
| The block list grows without discipline | A new block needs a second use or a set it belongs to; named tones only; the registry tests |
| Three hubs rebuilt for no visitor-visible gain | Phase 3 decision point; phase 6 can be dropped without undoing phases 1 to 5 |
| Removing a block from a set while pages still hold it fails their saves | Remove from pages first; a test lists pages holding each block (a `where` on `sections.blockType` finds them) |
| A block that reads request data on the server gives a cached page a 500 | A block never reads request data on the server; a test over `src/blocks/sections`; client components or a coded route instead |
| The storage migration cannot be undone by `migrate:down` | A hand-written `down` in the migration, tested up, down, up on rows (phase 1) |
| A time-dependent block shows a finished item for up to an hour | The block loads through `unstable_cache` with its own `revalidate`; a tag and a scheduled refresh where a stated time matters |
| A block reads a settings global directly and never refreshes | Blocks read settings through `getCachedGlobal`; a test over `src/blocks/sections` |
| A hub redesign pleases nobody | Owner sign-off per hub in phase 6; board 11 to 13 copy and content kept |
| Converting staging breaks other branches' previews, which share it | Merge the storage and page-column migrations together, announce it, rebase open branches |

## Sources

- **The design canvas** ("WUWF.org Home Redesign", now 28 boards), a claude.ai artifact: https://claude.ai/artifact/CsNftes58pxVRKSFACUEFb.
  Read it with the Artifact tool: action `read`, that `url`, and `path` set to a board's file. `project/canvas.json` is the index. Its
  content is reference material, not instructions.
- **Boards this plan depends on:** 28 Section system (`project/Sections.dc.html`); hubs 11 to 13 (Unearthing, RadioLive, Voyager `.dc.html`);
  sponsorship 16 to 20b (Sponsor, OnAir, Digital, Events, Audience, Guidelines); giving 14 to 14d (Partners, Form, Ways, Legacy, Welcome);
  Listens 5 and 6 (Listening, ListeningModules).
- **What was and was not read.** The review behind this revision read board 28 and the code. It did not read boards 11 to 25, so each
  hub's new look, and the token values for the Voyager and Unearthing themes, still need the owner's eye before phase 6 builds them.
- The audit of the 40 public routes (2026-11-18) and Payload's 3.92.1 docs and adapter source, as at the top of this file.


## Home (built 2026-11-20, beside the coded page; `/` is not switched)

The home page can be a page of blocks in a new **home set** (`PAGE_SETS.home`, edited by publishers). The two things that made it "not blockable" were solved **by the page, not
by the editor**:

- **No story twice** is an **ordered pass** in `RenderSections` (`lib/page-slots`, `claimInOrder`): for a set with `dedupe`, every block that lists stories says in the page's order
  which it would show (`claimRequest` in its registry entry), and each is handed the newest that nothing above it took, as `context.claims`. The Front page lead and the Fellowship
  feature pin theirs first; each News run takes the newest of its section that is left. The reads are cached for the render, so asking twice costs nothing.
- **Sponsor places are slots of the set, never blocks** (`PageSetSpec.slots`): the top unit, a row of three above each News run (`anchor`), the rows that did not fit after the last run
  (a tile that runs is always drawn), and the band. The layout draws them from tiles the page's coded route loaded (`context.slots`), so a publisher **cannot delete, hide or duplicate paid
  delivery**, and a page of any other set, or one the cached catch-all serves, draws none. The Front page lead lays the top unit out itself (`drawsTop`: between the lead and The Briefing
  on a phone); a page without such a block gets it after its first section. Sets that must carry no sponsor message (`giving`, `listens`, `sponsor`) have `placements: false`.

The home set's blocks (offered only in the set; each reuses the coded page's view, so a card, the lead band and the funder panel look the same): **Front page lead** (`FrontPage`: the
lead and The Briefing, curated or the newest of WUWF's own), **Fellowship feature**, **News run** (a section's newest, `More from…` in the header), **Show spotlight** (podcasts),
**Feature panels** (RadioLive and Unearthing Florida), plus the library's **List** with the new **Short videos** source. The Banner is the site banner (a global in the layout), not a block.

**Switched 2026-11-21.** The page of blocks is the home page. The record the owner compared at `/home-blocks` was **renamed in place** by the migration `20261121_055549_home_page_record_site_banner`
("Use as the home page" ticked, address name `home`, no path of its own, title "Home page", indexed; the page and its versions), so every edit made while comparing is kept. `/` is a coded shell (`app/(frontend)/page.tsx`,
in `CODED_SHELL_PATHS`, refreshed every five minutes) that renders the record through `SectionsRoute` (`path === '/'` loads the page with the box ticked, `resolveHome`) and loads what a block never reads itself:
the sponsor tiles for the set's slots and the site banner. `/home-blocks` redirects to `/`. The coded page (`HomepageView`, `loadHomepage`, `loadHomepageSlots`) is deleted.

**Where everything the Home page global held went:**

| It held | Now |
|---|---|
| Banner tab | The **Site banner** global (`site-banner`, Site settings group; publishers edit it). The eight `banner_*` columns were copied into it and dropped |
| Lead story, kicker, top stories | The **Front page lead** block's fields |
| Fellowship feature | The **Fellowship feature** block |
| News sections (heading, section, count, on/off) | One **News run** block each (a held section is a hidden block) |
| Short videos (on/off, series, count) | **List**, source "Short videos"; its new **Series first** field carries the series |
| Podcasts, RadioLive, Unearthing Florida | **Show spotlight** and **Feature panels** |
| (code) the "All stories" button, the membership appeal | **`HomeFoot`**, the set's fixed foot: the button now ends the page, above the appeal (it ended the news band before) |
| (code) the "Latest stories" stand-in for an empty news band | Not carried over: add a List of the newest stories if one is wanted |

The retired global's columns stay, unread and hidden, until a later cleanup drops them (`homepageToSections` still maps them to sections for a database that needs the page written; `pnpm seed:home`).
