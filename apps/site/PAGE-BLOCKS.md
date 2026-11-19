# Pages built from sections: the plan

**Status: proposed 2026-11-19. Nothing here is built.** Rules live in `CLAUDE.md`; state and history in `ROADMAP.md`. This file is the
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
   Proposed: convert in a migration (Payload ships a converter). The alternative is to rebuild staging from the import.
3. **Home stays a global** until phase 7. Confirm.
4. **How far editors may go on the bespoke hubs.** Blocks can be reordered and removed by anyone who can edit the page; Payload has no
   lock on a blocks row. Proposed: accept it (drafts, preview and version history make a mistake cheap to undo).

## Design

### Storage: blocks as JSON

Set `blocksAsJSON: true` on the Postgres adapter. A blocks field becomes one `jsonb` column instead of a table per block type (and per
list inside a block, all doubled for drafts). Checked in the 3.92.1 adapter source: queries into block fields still work on Postgres
through JSON paths, and a converter for existing data ships with the adapter (`blocksToJsonMigrator`; its exact command is not yet
confirmed).

- The setting is database-wide: `posts.featuredMedia` and the form builder's fields switch with it.
- Lost: database-enforced links from a block to media or pages. A deleted item leaves a dead id, as it already does in story bodies
  (rich text is JSON today). Every block component must render nothing for a missing relation.
- Renaming or removing a block field leaves old data in place. Such a change needs a data script; adding a field does not.

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
for its form token, `/support/ways` for `?way=`, `/support/thanks` for its query). A block declares that need, and a page holding one
is rendered per request. This is the least-proven part of the design and is tested in phase 0.

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

On a scratch database, with `blocksAsJSON` on and one throwaway `sections` page:

- [ ] Drafts, autosave, version restore, scheduled publish and live preview work on a page with blocks.
- [ ] A picture inside a block is populated on read; deleting the picture leaves the page rendering.
- [ ] A `where` on a block field works (find pages that contain a given block).
- [ ] Field-level access inside a block is enforced in a blocks field (it is not inside rich text; see `hooks/restrictedBlocksGuard`).
- [ ] `filterOptions` hides set-only blocks; copy and paste between two pages works.
- [ ] The converter moves existing `posts.featuredMedia`, `pages.layout` and form fields to JSON, up and down.
- [ ] A block that needs request data makes its page per-request without making every page per-request.

**Exit:** results written into `ROADMAP.md`. If drafts, preview or the converter fail, stop and bring the finding to the owner.

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
| Removing a block from a set while pages still hold it fails their saves | Remove from pages first; a test lists pages holding each block |
