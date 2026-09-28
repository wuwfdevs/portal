# Resources: design

**Status (2026-09-28):** slices 1 (Foundation), 2 (Editing and screenshots), 3 (the
in-tool Help panel) and 4 (the assistant capability, with semantic search) have landed.
Slice 5 is planned, below.

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
  id. `body` is ProseMirror JSON validated by `lib/rich-text.ts`, never HTML.
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

## Editing (slice 2)

Editors (and administrators) create and edit procedures and guides; readers never see
the controls, and RLS on `rc_articles` is the boundary either way. Per
`docs/ui-patterns.md`, create and edit share one form, `resources/article-form.tsx`:

- `/resources/procedures/new`, `/resources/procedures/[slug]/edit`.
- `/resources/guides/new` asks for the tool first (`?tool=`), because a guide's screens
  depend on it; `/resources/tools/[toolKey]/[slug]/edit`. The screens are a checkbox list
  from `lib/resources/screens.ts`, which tags each screen with its tool, and
  `validateArticleForm()` (`lib/resources/article-form.ts`, pure, tested) refuses a screen
  from another tool.
- **The slug is fixed once a page exists.** Release migrations match guides on slug, and
  links to a procedure shouldn't break on an edit. It is editable only on create, derived
  from the title when left blank.
- A field's error renders under that field (`?error=&field=`); anything else renders at
  the top of the form. A save lands on the page with `?saved=created|updated`, shown as a
  badge beside the heading.
- **Saving is an editor's version.** The action sets `source = 'editor'`,
  `updated_by`, the "What changed" note as `version_note`, and clears `needs_review` —
  saving is how an editor reconciles a guide a release flagged. The triggers do the rest:
  a title or body change bumps `version`, snapshots it, and marks the guide
  `edited_since_release`.
- **History** lists every version; each opens in place (`?version=N`) with a note saying
  which version is on screen. There is no restore button — an editor copies what they
  need into an edit, which records a new version.
- **Delete** is on the edit page, behind a confirm step (`?confirm=delete`). It removes
  the article's own uploaded screenshots from Storage first (their rows cascade, the
  objects don't), then the row, its history, and its release-note links. Audited as
  `rc.article.deleted`; create and edit as `rc.article.created` / `rc.article.updated`.

## Screenshots (slice 2)

Resources is the first body in the portal with images; Roadmap still has none.

- **One opt-in node.** `lib/rich-text.ts` (moved from `lib/roadmap/`, Roadmap re-imports
  it) admits `figure` only when called with `{ allowFigures: true }`, and only among
  blocks (the document, a list item, a quote) — never inline. Attrs: `mediaId` (a UUID),
  `alt` (required, non-empty), optional `caption`. Anything else on the node is dropped.
- **A figure stores an id, never a URL.** `rc_media` (`20260928160000_resources_media.sql`)
  holds the object path, size, and alt text. `lib/resources/media.ts`'s `resolveFigures()`
  reads the rows and signs URLs for the private `resources-media` bucket as the viewer, so
  Storage's own policy decides; `components/ui/rich-text.tsx` renders the image with its
  width and height, or the alt text in a dashed placeholder when there's no image yet, the
  object is missing, or signing failed. `RichText` renders no figures unless the caller
  passes `figures`, so a Roadmap body can't show one however it was stored.
- **Two kinds of media row.** An editor's upload has `article_id` and follows that
  article's visibility. A captured shot has `(screen_key, name)`, no article, and is
  readable by any Resources reader; the guides that embed it are what's scoped.
- **Editor uploads** go browser → Storage at `<article_id>/<media_id>.<ext>`
  (`resources/article-body-field.tsx`), then an `rc_media` row, then the node — never
  through a Server Action. "Add screenshot" appears only when editing an existing article
  (a new one has no id to file under). PNG or WebP, 2 MB, 2400px wide
  (`lib/resources/screenshot-rules.ts`, pure, tested; the bucket enforces type and size
  too). Alt text is required before the upload starts. Removing a figure from a body
  leaves its row and object; deleting the article removes them.
- **Captured shots** come from `scripts/resources-screenshots/`
  (`npm run screenshots:resources`, run by Vitest like the evals): it signs in to preview
  as a seeded user without an inbox (the secret key mints the magic-link token), visits
  each route in `shots.ts` at 1280×800, captures the element marked
  `data-help-shot="<name>"`, and upserts the row by `(screen_key, name)`, keeping its id,
  so every guide using it refreshes with no edit. It refuses to capture from production;
  given production's URL and secret key it also publishes the same images there. A
  migration declares a new shot's row with a fixed id so a guide can reference it before
  the first capture. `playwright-core` (pinned, dev only) was added for this; the
  handoff asked for captured rather than hand-made screenshots.
- The first shot is Sourcework's source grid (`source-card-grid.tsx`). Declaring it
  showed the slice 1 Sourcework guides were already stale — they described a pill row
  and "+ Reference another source" the page no longer has — so the same migration
  rewrote both guides for the card grid and "+ Add source".

## Help panel (slice 3)

A **Help** button in the portal header, on tool pages only, opens a right-hand panel
listing the Resources guides for the screen you're on.

- **Which screen.** `lib/resources/screens.ts`'s `helpContextForPath(pathname, search)`
  (pure, tested) maps a URL to a tool and screen. Each screen in `SCREENS` lists its route
  patterns (`/sourcework/:id`, and `?tab=sources` for the Source Library, which shares
  `/sourcework`'s path); a literal segment beats a parameter, so `/sourcework/new` is the
  projects screen, not a project. A tool page no screen covers (Underwriting's dashboard,
  Log's weather) still gets Help, listing all the tool's guides. The dashboard,
  Administration, and Resources itself get no button — a test asserts every listed route
  maps back to its own screen, so a new pattern can't silently shadow another.
- **One right panel at a time.** The assistant and Help share the right edge.
  `components/right-panel.tsx`'s `RightPanelProvider` (mounted in `(portal)/layout.tsx`)
  holds which one is open; opening either closes the other, and the assistant's bubble
  steps aside whenever either is open. `HelpPanel` (`components/help-panel.tsx`) copies
  the assistant's `<aside>` classes: a full-screen sheet below `lg`, a 24rem push-aside
  column at `lg` and up.
- **Content.** "For this screen" is the tool's guides whose `screen_keys` include the
  current screen; "Changed recently" is the tool's last two release notes; the search box
  searches the tool's guides (`rc_search_articles`, narrowed to the tool). The footer's
  "Ask the assistant about {Tool}" opens the assistant with "About {Tool}: " in its
  compose box — a draft to finish, never sent for the user — and "All {Tool} guides" goes
  to the tool's first guide. With nothing for the screen: "No guide for this screen yet."
- **Loaded by a Server Action, not a route handler.** The handoff suggested
  `/api/resources/help`; `resources/help-actions.ts`'s `loadHelp()` is a non-redirecting
  action returning data instead, per CLAUDE.md's "reach for a Server Action first" and the
  shape Sourcework's workspace search already uses. `lib/resources/help.ts` does the reads
  through the RLS-scoped client, so the panel shows exactly what `/resources` would.
- `Textarea` (`components/ui/input.tsx`) now accepts a `ref`, so the assistant can focus
  its compose box when Help hands it a draft.

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

## Assistant and search (slice 4)

The in-portal assistant reaches Resources through one capability, `resources.search`
(`lib/resources/capabilities.ts`): a query, optionally narrowed by kind or tool key,
returning at most eight titles, summaries and links (`shapeResourceSearchResults()`,
pure). It is read-only, so its confirmation is `none`, and it runs as the caller — RLS
decides what comes back, as everywhere else. The assistant's instructions tell it to
search Resources first for "how do I…" questions and to say so plainly when nothing
relevant comes back rather than guess how a tool works.

Search is hybrid, the same shape as Sourcework's `tw_search`: `rc_search_articles()`
(`20260928180000_resources_semantic_search.sql`, `security invoker`) fuses keyword and
semantic ranks by reciprocal rank fusion (k = 60). Keyword ranking uses every word of
the query first; only if that finds nothing does it fall back to any of the words
(`anyWordQuery()`, pure), since an assistant's query is usually a whole question. Semantic
ranking uses `rc_article_embeddings` — a separate table, not a column on `rc_articles`,
because writing an embedding onto the article would fire its version and `updated_at`
triggers. Each embedding records the `content_hash` (a generated column over title,
summary and body text) it was made from, so a stale row is one whose hash no longer
matches (`rc_articles_needing_embedding()`).

Only an editor's session can write embeddings, so a reader can't skew ranking. They are
written after the response (`after()`), best-effort, when an editor saves an article and
whenever an editor opens `/resources` — which is how articles a release migration inserts
get embedded. `OPENAI_API_KEY` is optional, as for Sourcework: without it no embeddings
are written and search is keyword-only; an embedding failure is never an error.

## Later slices

2. ~~Editing and screenshots~~ — landed; see above.
3. ~~In-tool Help panel~~ — landed; see above.
4. ~~Assistant capability~~ — landed; see above.
5. **The CLAUDE.md rule** — every user-visible change ships a release note and guide
   update in its migration; backfill guides for each tool.
