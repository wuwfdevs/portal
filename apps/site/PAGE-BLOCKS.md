# Pages built from sections: the plan

**Status: proposed 2026-11-19. Nothing here is built. Phase 0 was run on a scratch database the same day: see "Phase 0 findings" in
`ROADMAP.md`; its checklist below is annotated and the Design section is corrected where it found a difference.** Rules live in
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
| **Exception** | `homepage` global (unchanged) | Home: one sponsor rail spans several sections and stories are de-duplicated across them, so it does not split into independent blocks. Revisit last |

## Open decisions for the owner

1. **Who edits which pages.** `pages` needs `content.write` to save a draft and `content.publish` to go live. Today sponsor pages need
   `content.publish` and giving pages `membership.manage` or `content.publish`. Proposed: a page belongs to a **page set** (below), and
   the set names the permission that may edit it, so membership staff keep the giving pages and nothing else.
2. **Staging data when storage changes.** Production is empty; staging holds imported stories whose featured media is a blocks field.
   Proposed: convert in a migration (Payload ships a converter). The alternative is to rebuild staging from the import. *Phase 0: the
   converter moved a seeded set of posts, pages and a form with no differences, so conversion is workable; it has no `down`, and
   other branches' previews break against a converted staging (see Design → Storage).*
3. **Home stays a global** until phase 7. Confirm.
4. **How far editors may go on the bespoke hubs.** Blocks can be reordered and removed by anyone who can edit the page; Payload has no
   lock on a blocks row. Proposed: accept it (drafts, preview and version history make a mistake cheap to undo).

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
- Kept as is: `path` (unique, resolved by the catch-all route), SEO tab, drafts with autosave, scheduled publish, 50 versions, live preview.

### Page sets (`src/lib/page-sets/registry.ts`)

Code, in the manner of placement zones: a set is a small record in a registry, a page chooses one.

| Set | Theme | Edit permission | Blocks offered only here |
|---|---|---|---|
| `sponsor` | wuwf | `content.publish` | Rate estimator, inquiry form, goal picker, sector picker, comparison bars, open programs, placement table |
| `giving` | wuwf | `membership.manage` or `content.publish` | Gift card, giving levels, ways-to-give switcher, thank-you hero, sample language |
| `listens` | wuwf | `content.write` | Open questions, sessions, outcomes, Ask WUWF |
| `voyager` | voyager | `content.write` | Masthead, publisher bar, section columns, multimedia band, staff roster |
| `unearthing` | unearthing | `content.write` | Archive header, explore map and timeline, collections, then and now |
| `radiolive` | radiolive | `content.write` | Next-show hero, latest set, upcoming and visit, artists grid, host and encores |
| none | wuwf | `content.write` | Generic blocks only |

A set gives: the sub-navigation (pages in the set by `navOrder`, through `components/SectionNav`), the footer line, the default theme,
who may edit, and (through the blocks field's `filterOptions`) which set-only blocks appear in the picker.

### Anatomy of a section block

`src/blocks/sections/<Name>/` holds `config.ts`, `Component.tsx` and a test. Every block gets the same first fields from one builder:

- `hidden`: keeps today's "Show this section" switch, so a section can be parked without deleting it.
- `anchor`: optional, lower-case and hyphens; unique within the page by a validation on the blocks field (not `unique`, which Payload
  applies across the whole collection).
- `tone`: a named ground (`plain`, `grey`, `dark`, `accent`), never a colour value. The theme decides what each name looks like.
- `heading`: eyebrow, title, intro, where the block has one.

Rules: a block is a full-width band and owns its own spacing; a block with nothing to show renders nothing; at most one level of list
inside a block; a block's thumbnail (3:2) and picker group are part of its definition; no free colour, spacing or HTML fields.

`components/PageParts` stays the rendering kit. Generic blocks are thin configs over it; the existing view files are taken apart into
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
  Decide in phases 3 and 4 which of the three pages need that (`/support/ways` and `/support/thanks` are the likely two).

A separate finding, not about sections: on the scratch production build, a page created after the build (not in `generateStaticParams`
then) was rendered per request with `Cache-Control: no-store`, including a plain `standard` page, even after `revalidatePath`; pages
that existed at the build are cached for an hour. The cause was not found and it was not checked on a Vercel deployment.

### Shared data stays in globals

Blocks that show prices, levels or contact details read them from a settings global, so one change updates every page:

- `giving-settings`: levels, message tiers, donation form address and switch, phone, email, service line. Also read by the account page
  and show support pages, as today.
- `sponsorship-settings`: rate card, packages, Carpool prices, event programs, form interests and budgets, phone, address, inquiry
  address (still restricted), the sample sponsor.

Saving a settings global must revalidate every page that holds a block reading it.

### Themes

`src/lib/page-themes`: token overrides per theme, emitted with `themeCss` from `@wuwf/design-tokens` and checked with its contrast
helpers in a test (4.5:1 for text on every tone). Themes: `wuwf` (default, no overrides), `voyager`, `unearthing`, `radiolive`. The
themed shows already work this way (`lib/shows/themes.ts`); this reuses the mechanism for pages. The hard-coded `#E9D5A8` on the
Unearthing hub becomes a theme token.

### Moving a page across

Next serves a coded route before the catch-all, so each page moves in one change: a migration writes the page record at the same path
from the global's **current** values (through the Local API, as `20261117_194934_sponsorship_copy` did), and the same change deletes the
coded route and its view. The global's page fields are dropped in a later migration, once the page is confirmed.

These addresses are contracts and get a test each: `/sponsor#inquire`, `/sponsor#places`, `/sponsor/on-air#rates`, `#carpool`,
`#programs`, `#packages`, `/support#levels`, `/support#fellowships`, `/support/ways?way=<value>` (see `lib/giving/legacy-addresses.ts`).

## Block catalogue

**Generic (12).** Offered on every `sections` page.

| Block | Renders with | Replaces today |
|---|---|---|
| Hero | `PageParts.Hero` (tone; optional aside: buttons, quote card, contact card) | 10 page openers |
| Stat grid | `Sponsorship/parts.StatGrid` + `Source`, moved into `PageParts` | 15+ |
| Card grid (2 to 4 columns; optional link, tag, price) | `PageParts.LinkCards` and the inline card markup | about 10 |
| Split band (heading one side, content the other; ratio from three named choices) | new, from six inline versions | 6+ |
| Steps (grid or compact list) | `StepGrid`, `StepList` | 4 |
| Questions | `Faq` | 3 |
| Closing band (dark, accent or boxed) | `ContactBand`, `ProposalBand` | 7 |
| Callout | inline lime boxes | 3 |
| Quotes | hub testimonials | 1 |
| Text | the story body editor (`bodyEditor`) in a band | new |
| Table | placement and rate table markup | 4 |
| Check list (ticks, or plus and minus) | `CheckList`, guidelines lists | 3 |

**Data blocks (about 12).** Offered everywhere unless noted; each wraps a component that exists.

Story list (by section, topic, fellowship or show), show list, upcoming community events, schedule, listening question (exists as
`ListeningAsk`), funder credit (`Acknowledgment`), membership appeal, audio feature, video row, listen-live button, other ways to listen,
picture or gallery (existing `MediaBlock`, `Gallery`).

**Set-only blocks (about 30).** Listed in the page sets table. Each is the existing section of an existing view, with its fields.

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

**Exit:** results written into `ROADMAP.md` (done). Drafts, preview and the converter did not fail. The design changes are in the sections
below and in the *Risks* table; the two the owner should see before phase 1 are the missing `down` and the request-data rule.

### Phase 1: foundation

- [ ] Storage migration (`blocksAsJSON`), applied to staging by the preview build and verified there.
- [ ] `sections` template, root `blocks` registry, `RenderSections`, the shared field builder, anchor validation.
- [ ] Page sets registry, per-set edit permission, set sub-navigation, `filterOptions`.
- [ ] Themes scaffold with the contrast test; `wuwf` only.
- [ ] Tests that fail when a block lacks a component, a test, a thumbnail or a picker group.
- [ ] Convert any page on the `blocks` template, then remove that template, `RenderBlocks`, `heros/` and the starter's page-only blocks.
- [ ] Update `CLAUDE.md` (*Decisions that are made*, a new *Pages and sections* rule set), `ROADMAP.md` and `ARCHITECTURE.md`.

**Exit:** an editor can make an empty `sections` page in staging; nothing public has changed.

### Phase 2: the generic library

- [ ] The 12 generic blocks, each with a thumbnail, over `PageParts`.
- [ ] One internal sample page in staging that uses every block in every tone, for review at phone, tablet and desktop widths.

**Exit:** the owner has looked at the sample page.

### Phase 3: sponsor pages (the pilot)

- [ ] `sponsorship-settings` global (data only); sponsor-only blocks.
- [ ] Before any change, capture screenshots of the six pages at three widths; they are the reference.
- [ ] Move the six pages; compare against the reference; anchor tests; inquiry form still sends.
- [ ] Delete the six routes and `components/Sponsorship/*View.tsx`.

**Exit, and a decision point:** in staging the owner reorders a section, hides one, and builds a new sponsor page from existing blocks
without a developer. If that is not comfortable, stop here and revise before going on.

### Phase 4: giving pages

- [ ] `giving-settings` global; giving-only blocks (gift card, levels, ways switcher, thank-you hero, sample language).
- [ ] Move the four pages; old-address redirects still land (`lib/giving/legacy-addresses.ts`); the "never collects payment details" rule
      and the form-address fallback are unchanged and tested.
- [ ] Membership staff can edit giving pages and no others.

### Phase 5: words still in code

- [ ] WUWF Listens hub as a `sections` page (five listens blocks); `/listens/host` intro from the same source.
- [ ] Schedule and podcasts as `sections` pages (schedule and show-list data blocks).
- [ ] Not pages, so not blocks: the community calendar guidelines and the membership appeal move to Site settings; the fellowship
      "How it works" text moves to the fellowship record or Site settings.

### Phase 6: the themed hubs

- [ ] Themes `unearthing`, `voyager`, `radiolive`, each passing the contrast test.
- [ ] Unearthing Florida, then Voyager, then RadioLive: set-only blocks from the existing hub components; hub globals emptied into them.
- [ ] Unify what differs by accident: split-band ratios, the three "featured plus list" layouts, rail width (20 or 22rem), the page
      header rebuilt on seven routes. Deliberate design (nameplate, map, hero) is kept.

**Exit:** each hub matches its reference screenshots, apart from the listed unifications.

### Phase 7: close out

- [ ] Drop the emptied page globals and their tables; remove dead loaders.
- [ ] Decide on Home with what has been learned.
- [ ] Editor notes: what a section is, copy and paste (and that "Paste Fields" replaces every section on the page), page sets.

## Out of scope

Home (until phase 7), stories and their body blocks, record templates, applications, the Grove converter (it keeps writing `standard`
pages), the Portal.

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
| Converting staging breaks other branches' previews, which share it | Merge the storage migration on its own, announce it, rebase open branches |
