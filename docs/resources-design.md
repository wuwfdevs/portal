# Resources: design

**Status (2026-09-28):** slice 1 (Foundation) has landed. Slices 2–5 are planned, below.

Resources is a top-level area at `/resources` for three kinds of content:

1. **Procedures** — station SOPs, grouped by area, written by designated editors.
2. **Tool guides** — one set per portal tool, kept current by the same migrations that
   ship feature changes.
3. **Release notes** ("What's new") — one entry per user-visible change.

It was specified in a design handoff ("Resources: station wiki + tool guides", with an
HTML reference of five screens). This document records what was built and where the build
departed from the handoff, so the handoff itself is not needed to work on the tool.

## Access

Roadmap's shape exactly (`docs/roadmap-design.md` §6). The registry row `resources` is
`default_access = 'approved_staff'`, so every active user reads it without a grant. A
`tool_access` grant with `tool_role = 'editor'` is the elevation; administrators edit too.

- `private.has_resources_access(uid)` — the ticket in (enabled row, active profile, open
  access or a grant).
- `private.is_resources_editor(uid)` — access plus an administrator or an `editor` grant.
- `private.resources_audience_for(uid)` — the reader's audience, from the platform role the
  profile already carries: `student` → students, `faculty_partner` → partners, everyone
  else → staff. No profile change was needed.
- `private.can_open_tool(uid, tool_id)` — the SQL twin of `canOpenTool` in
  `lib/auth/authz.ts`. A guide or release note about a tool is visible only to people who
  can open that tool.

`rc_articles` select: an editor sees everything (they maintain it); anyone else sees an
article when it is addressed to their audience and, if it names a tool, they can open that
tool. Writes are editor-only. `lib/resources/access.ts`'s `requireResourcesAccess()` gates
every page and reports `isEditor` for rendering editor-only controls.

## Data model (`20260928140000_resources.sql`)

- **`rc_articles`** — one table, discriminated by `kind` (`procedure | guide |
release_note`). `slug` is the identity migrations upsert on; never match a seeded row by
  id. `body` is ProseMirror JSON validated by `lib/roadmap/rich-text.ts`, never HTML.
  Check constraints hold each kind's shape (a procedure has an area and no tool; a guide
  has a tool; a release note has a date and may be portal-wide). `sort_order` orders a
  tool's guides. `search_vector` is a generated column over title, summary, and the body's
  text nodes (`public.rc_body_text()`), searched by `rc_search_articles()` (security
  invoker, so RLS still scopes it).
- **`rc_article_versions`** — insert-only, like `log_clock_versions`. **Departure from the
  handoff:** it holds _every_ version, the current one included, not only prior states. A
  `before update` trigger bumps `version` when the title or body changes and sets
  `edited_since_release` (true for an editor's change, false for a release's); an `after
insert or update` trigger snapshots the new state with `rc_articles.version_note`. That
  makes a History list one read and gives the current version a note ("Updated for PDF
  documents"), which the handoff's prior-state-only design could not.
- **`rc_release_note_guides`** — which guides a release note changed.

Audit: `audit_events_insert_resources_editor` admits editors, for slice 2's
`rc.article.*` events. Reading is not audited.

## Seed content

The migration seeds real release notes (the user-visible changes recorded in `CLAUDE.md`)
and six guides written against the screens as they exist today. **It seeds no
procedures:** the handoff's procedures were placeholders, and placeholders must not reach
production. `supabase/seed.sql` carries three sample procedures, clearly labeled, for
local and preview only.

## Screens (slice 1, read-only)

All under `src/app/(portal)/resources/`, laid out per `docs/ui-patterns.md`.

- `/resources` — search (`?q=`, ranked results replace the sections), Station procedures
  (Area `FilterChips`, `?area=`, a `TableFrame` table whose rows open the procedure), Tool
  guides (one card per tool with at least one readable guide), and the latest three
  release notes.
- `/resources/procedures/[slug]` — article plus an aside: `DetailSummary`, "Tools this
  uses" (the guide links found in the body — `guideLinksInBody()`), and History behind
  `?history=1`.
- `/resources/tools/[toolKey]` redirects to the tool's first guide;
  `/resources/tools/[toolKey]/[slug]` is the guide, with the provenance note when its
  latest version came from a release, the `needs_review` note for editors only, and an
  aside of the tool's guides, details, and history.
- `/resources/whats-new` — release notes grouped by day, a Tool filter (`?tool=`), and
  "Guide updated:" links. Each card is anchored by its slug.

The portal nav has a Resources tab between Dashboard and Administration. Resources also
appears on the dashboard as an ordinary registry card.

## Later slices

2. **Editing and screenshots** — editor create/edit (`/resources/procedures/new`,
   `/[slug]/edit`, one shared form), the `figure` node behind `parseRichText({ allowFigures:
true })` (move the whitelist to `src/lib/rich-text.ts` then, with Roadmap re-importing
   it), `rc_media` + the private `resources-media` bucket, and the Playwright capture
   script. The editor's "+ New procedure" link and `DetailSummary` Edit link arrive here.
3. **In-tool Help panel** — the header button, `RightPanelProvider` shared with the
   assistant, `screenKeyForPath()` in `lib/resources/screens.ts`, and
   `/api/resources/help`.
4. **Assistant capability** — `resources.search` over `rc_search_articles()`.
5. **The CLAUDE.md rule** — every user-visible change ships a release note and guide
   update in its migration; backfill guides for each tool.
