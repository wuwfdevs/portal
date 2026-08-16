# Sourcework Analysis — Design (Phase 5: themes, meta-themes, synthesis)

Status: **designed 2026-08-16, not yet built** — not reviewed with the
product owner. Written alongside `docs/sourcework-design.md` §9 (Phase 4:
research questions and data points), not after it and not in isolation from
it: a data point with nothing to group it into a pattern isn't a very
meaningful deliverable on its own, so this design and Phase 4's are meant to
be read, and likely reviewed, together, even though they'll still ship as
two separate migrations. Read `docs/sourcework-design.md` in full first,
especially §2 (which already committed to "one data point commonly feeds
multiple themes" before this doc existed) and §9 (Phase 4's data model —
this phase adds nothing to it, only a new table that references it).

This is the file `docs/sourcework-design.md` §5 already named as Phase 5's
prerequisite ("needs `docs/sourcework-analysis-design.md`") — a real,
separate design effort, not a subsection of the main doc, because unlike
Phase 4 (a straightforward extension of the existing excerpt/provenance
model) this phase is, per §5's own framing, "genuinely new product surface,"
informed by prior art from actual qualitative-analysis tools (CAQDAS:
NVivo, Atlas.ti, MAXQDA, Dedoose) rather than by anything already built here.

## 1. What this phase is, and isn't

Phase 4 is **collection**: a reporter grounds findings (data points) in
evidence (excerpts). This phase is **synthesis**: grouping those findings
into a pattern worth reporting — a **theme** — and, when patterns
themselves cluster, grouping themes into a **meta-theme**. "The county
missed both of its own inspection deadlines" (a Phase 4 data point) becomes
meaningful at the investigation level once it sits alongside two or three
other data points under a theme like "County repeatedly missed
self-imposed compliance deadlines," which might itself sit under a
meta-theme like "Systemic accountability failure" alongside a theme about
budget cuts to the inspection office. Nothing before this phase gives a
reporter a place to say a set of findings *means* something together — that
gap is exactly why Phase 4 alone is a thinner deliverable than it looks.

**What this phase deliberately does not attempt**, each cut for a stated
reason rather than quietly dropped:

- **A formal codebook (a priori coding) separate from emergent themes.**
  CAQDAS tools distinguish a fixed codebook defined before analysis begins
  from themes discovered while working through material. This system only
  ever supports the emergent kind — a theme is created the moment a
  reporter notices a pattern across data points already collected, not
  planned in advance. Phase 4's research questions already are this
  system's a priori structure (what a reporter set out to find before
  starting); a second, parallel "planned theme" concept above data points
  would duplicate that role for no concrete need.
- **Saturation tracking.** CAQDAS tools sometimes surface signals like "new
  data is no longer producing new themes" for large-N qualitative studies.
  WUWF's investigations are project-scoped newsroom work, not large-sample
  research — there's no real "how much more coding is left" question a
  reporter here is asking, and building a rate-of-new-theme-emergence
  signal with nothing to hang it on is exactly the kind of speculative
  feature CLAUDE.md warns against.
- **A generic, polymorphic memo system** attachable to any entity (a data
  point, an excerpt, a theme, a project). CAQDAS memos are freeform
  reflexivity notes a researcher can pin to almost anything. Here, the one
  place a memo-like note is actually asked for is a theme's own synthesis —
  see §3's `notes` column — so that's where it lives, as a plain field on
  the one table that needs it, not as a separate attachable-to-anything
  table and UI with no second caller.
- **Rich text.** A theme's `notes` field is plain text, matching every other
  free-text field this tool already has (`sw_data_points.summary`,
  `tw_projects.description`). Roadmap's Tiptap/ProseMirror editor
  (`docs/roadmap-design.md`) is the one place in this portal rich text
  exists, for a genuinely different need (structured post/comment bodies
  read back through a whitelist renderer); nothing here asks for bold text
  or lists inside a synthesis note.
- **Automatic theme suggestion.** An LLM proposing groupings from a data
  point's text is a real, plausible future feature — the same "no concrete
  need yet" call Phase 4 (§9.1) already made about automatic extraction from
  excerpts. Left out here for the same reason.

## 2. Resolving Phase 5's own open question: are themes project-scoped?

`docs/sourcework-design.md` §5 posed this directly: "can a theme span
multiple `tw_projects` (an entire investigation), or is it project-scoped
like research questions in Phase 4?" Resolved here: **a theme is not
project-scoped at all — `sw_themes` carries no `project_id` column.** Its
membership is entirely derived from whichever data points a reporter
attaches to it, and since a data point's own `project_id` (Phase 4) can
differ across the data points inside one theme, a theme's "which
project(s) does this touch" is a computed read (join through its member
data points), never a stored value forcing one owning project to be picked.

This is a deliberate answer, not a default:

- **No RLS reason to restrict it.** Every `sw_`/`tw_` table's RLS in this
  tool is scoped to `private.has_transcription_access(auth.uid())` — "any
  tool member" — with no per-project ownership or visibility boundary
  anywhere in Sourcework today (unlike, say, Editorial Planning's pitches
  being visible to their own submitter plus editors). Nothing about
  security makes cross-project theming harder than project-scoped theming.
- **It's the actual product need.** §1's original motivation for this whole
  data model was one recording mattering to more than one story; Phase 3a's
  payoff was a project referencing more than one source. The natural next
  step — an investigation-level pattern spanning more than one *project* —
  is precisely what the open question's own "an entire investigation"
  phrasing is reaching for. A reporter noticing the same official behaving
  evasively across two separate stories, months apart, is a real and
  valuable theme; scoping themes to one project would make that
  unrepresentable.
- **Research questions stay project-scoped and that's fine, deliberately
  asymmetric.** A research question is "what am I trying to find out for
  *this* story" — inherently tied to one investigation's framing. A theme
  is "what pattern have I noticed" — which can legitimately outlive or span
  the story that first surfaced it. Modeling them differently isn't an
  inconsistency; it's each table matching what it actually represents.

## 3. Data model: two new tables

```sql
sw_themes
  id uuid pk
  title text not null
  notes text                              -- the reporter's own synthesis/
                                           -- memo — nullable, filled in as
                                           -- understanding develops; also
                                           -- what a top-level meta-theme's
                                           -- "synthesis" write-up is, see below
  parent_theme_id uuid references sw_themes on delete set null
  created_by uuid references profiles(id) on delete set null
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()

sw_theme_data_points
  theme_id uuid not null references sw_themes on delete cascade
  data_point_id uuid not null references sw_data_points on delete cascade
  added_at timestamptz not null default now()
  added_by uuid references profiles(id) on delete set null
  primary key (theme_id, data_point_id)
```

Notes on the choices:

- **"Meta-theme" is not a second table — it's a theme with children.**
  `parent_theme_id` is self-referential: a top-level theme has it null; a
  theme grouped under a broader pattern has it set. This is the same
  "generalize, don't add a parallel table" call this doc has made
  repeatedly (document excerpts folded into `sw_source_excerpts` rather
  than a new table; `tw_chunks` generalized rather than a parallel
  document-chunk table) — a meta-theme is structurally identical to a
  theme, it just happens to have children, so it doesn't need its own
  schema.
- **A theme with children can still hold data points of its own.** Nothing
  restricts `sw_theme_data_points` rows to leaf-level themes only — a
  meta-theme can directly ground a data point alongside its child themes.
  Real CAQDAS code hierarchies work this way (a parent code often still
  codes some material directly, not only through its children); forcing a
  strict two-level "meta-themes hold only themes, themes hold only data
  points" split would be an arbitrary rule this design doesn't need.
- **No depth limit on `parent_theme_id`.** The product concept is two
  levels (theme, meta-theme), but nothing breaks if a reporter nests a
  third level, and there's no concrete reason to add a check constraint
  preventing a scenario nobody's asked to disallow — the mirror image of
  this repo's usual "don't validate for what can't happen," applied to a
  case where over-constraining costs more than it protects.
- **`notes` is where "synthesis" lives — no third table for it.** The
  brief's "themes, meta-themes, synthesis" reads as three things; modeled
  here as two tables, where "synthesis" is simply what a reporter calls the
  `notes` field on whichever theme is currently the top of their hierarchy
  for a given investigation. Adding a dedicated synthesis table (or a
  project-level "final write-up" document) with no concrete second use
  would be exactly the kind of premature abstraction CLAUDE.md warns
  against for a single current use.
- **`parent_theme_id` is `on delete set null`, not `cascade`.** Deleting a
  meta-theme shouldn't destroy its children's own data-point groupings —
  they should simply become top-level themes again. Matches the
  "detaching/removing one thing shouldn't destroy value the user didn't
  intend to lose" posture Phase 4 (§9.2) already applied to
  `sw_data_point_excerpts`.
- **Both tables are freely deletable**, `for all` under the same
  collaborative predicate every other `sw_` table uses — reorganizing or
  discarding a theme that turned out not to hold up is an ordinary
  editorial action, the same posture Phase 4 gave data points.
- **No `search`/`embedding` columns on `sw_theme_data_points`** — it's a
  plain join table, nothing to index.
- **`sw_themes.title`/`notes` are not embedded or tsvector-indexed here**
  — see §6 for why, and how a reporter finds a theme without going through
  the shared search index.

## 4. RLS

Same collaborative model as everything else in this tool, no elevated
role and no project-scoping predicate (§2 already established there's
nothing to scope it to):

```sql
create policy sw_themes_member_all on public.sw_themes
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
grant select, insert, update, delete on public.sw_themes to authenticated;

create policy sw_theme_data_points_member_all on public.sw_theme_data_points
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
grant select, insert, update, delete on public.sw_theme_data_points to authenticated;
```

No new `private` predicate — `has_transcription_access` already means
exactly the boundary these tables need.

## 5. Screens

**A fourth top-level tab, "Themes."** `/sourcework`'s existing tab strip
(`Tab = "projects" | "sources" | "clips"`, `page.tsx`) gains `"themes"` —
plain extension of the existing `?tab=` query-param pattern (`TabLink`,
the conditional per-tab fetch in the page's `Promise.all`), not a new
routing mechanism. This is the right place for it, not nested under any one
project's page, because §2 just established themes aren't project-scoped —
they belong alongside Sources and Excerpts as a tool-wide browse surface,
not inside a project workspace the way Phase 4's Research tab is.

The tab renders top-level themes with their children nested/indented
beneath them (a plain nested list — no tree widget, matching this repo's
consistent "plain controls over a fancier component absent a concrete
need" calls elsewhere, e.g. reorder buttons over drag-and-drop). Each theme
row: title, a one-line count ("6 data points, spanning 2 projects" — the
derived cross-project read from §2), and a truncated `notes` preview.

**Theme detail** (`/sourcework/themes/[id]`, a new route mirroring
`/sourcework/sources/[id]`'s precedent for "a concern that doesn't fit
inside the project-workspace shape"):

- Title and `notes` (editable inline, like `ProjectDetails`' existing
  title/description edit pattern).
- A parent-theme picker ("Group under…"), listing every other theme as a
  candidate parent, excluding itself and its own descendants (a plain
  cycle check in the update action — self-referential trees need this,
  nothing else in this schema does).
- Its own child themes, listed with links in.
- Its data points: each rendered the same card shape Phase 4's Research tab
  uses (summary, its own grounding excerpts as chips linking back into the
  source), with the project each data point came from now shown explicitly
  (it wasn't ambiguous on Phase 4's project-scoped tab; it is meaningful
  context here). "+ Add a data point" opens a picker searching **across
  every project the reporter has access to** — unlike Phase 4's picker,
  which is deliberately scoped to one project's attached sources (§9.3),
  this one is tool-wide by design, since a theme's whole purpose can be
  connecting data points across projects.

### 6. Server-side work

New `lib/transcription/themes.ts`, alongside `research.ts`
(Phase 4) and `projects.ts`:

- `listThemes()` — every theme the caller can see (all of them; no
  project filter exists to apply), with each one's derived data-point count
  and spanned-project list for the tab's summary line.
- `getThemeDetail(themeId)` — one theme plus its parent, children, and data
  points (each with its own excerpts and source, flat queries per this
  codebase's established "PostgREST embedding doesn't type reliably"
  convention).
- `listAttachableDataPoints(themeId, query)` — every data point across
  every project the caller can see, excluding ones already attached to this
  theme; the tool-wide counterpart to Phase 4's project-scoped
  `listLibraryClips`.

New `[id]`-less `themes/actions.ts` (these aren't inside any one project's
route segment, matching the new top-level route): `createTheme(title)`,
`updateTheme(id, title, notes)`, `setThemeParent(id, parentId | null)`
(rejects a cycle), `deleteTheme(id)`, `attachDataPointToTheme(themeId,
dataPointId)`, `detachDataPointFromTheme(themeId, dataPointId)`. All
`requireToolAccess("transcription")`-gated first, `failIfError`/`failWith`
for the `?error=` convention, same as every other Sourcework action.

**No new capability.** Same reasoning §9.8 already gave for Phase 4:
nothing outside this tool has a concrete reason today to programmatically
create or read a theme. Revisit only if one shows up.

## 7. Search: deliberately not wired into `tw_search`

Themes are left out of the shared search index in this phase, on purpose,
not as an oversight:

- `tw_search()`'s return shape carries one `project_id`/`project_title` per
  hit — every existing hit kind (transcript, document, clip, project, and
  Phase 4's data point) genuinely belongs to exactly one project. A theme,
  per §2, often doesn't — forcing it into that row shape would mean either
  inventing a fake "primary project" for a cross-project theme (precisely
  the kind of dishonest modeling §2's original design decisions warn
  against) or teaching every caller of `tw_search` to handle a null
  project on one more hit kind for a feature that's genuinely different in
  kind from the rest.
- The Themes tab already has its own dedicated browse surface (§5) with
  its own search need, which a plain `ilike`/`websearch_to_tsquery` filter
  over `title`/`notes` inside `listThemes()` can serve without touching the
  cross-tool-search RPC at all — themes aren't findable from Sourcework's
  global search bar in this phase, only from the Themes tab itself.
- Revisit if reporters actually want "surface a matching theme alongside
  transcript/excerpt/data-point hits" from one search box — that's a real
  possible follow-up, deferred here for the same "no concrete need behind
  it yet" reasoning this document applies elsewhere, not ruled out.

## 8. Relationship to Phase 4 — nothing there needs to change

`sw_data_points` (`docs/sourcework-design.md` §9.2) already has everything
this phase needs to reference it: a stable `id`, and nothing about its
shape assumed anything about downstream grouping. `sw_theme_data_points`
attaches to it exactly the way `sw_data_point_excerpts` attaches to
`sw_source_excerpts` — a plain join table added later, not a reason to
revise the referenced table. Phase 4's own open question #1 (whether a data
point should answer more than one research question) is unrelated to this
phase — that's about a data point's relationship to a *research question*,
not to a theme, and §2 had already settled data-point-to-theme as
many-to-many before either phase's write-up existed. The two designs
compose without rework in either direction.

## 9. Open questions — genuinely unresolved, needs review before implementation

1. **Is a plain nested list the right UI for the theme hierarchy**, or does
   a real second level of nesting (a meta-theme with several themes, each
   with several data points) need more visual structure once someone's
   actually used it with real material? §5 kept this deliberately simple;
   worth a second look once there's real content to test it against.
2. **Should a theme be able to link to a research question directly**
   (beyond the indirect path through its data points, each of which may or
   may not answer one)? Not modeled here — a theme's connection to "what
   was I trying to find out" is currently only visible by opening each of
   its data points individually.
3. **Cross-project data-point picking (§5) has no guardrail against
   picking something the reporter doesn't actually have context on** —
   unlike Phase 4's project-scoped picker, where everything offered is
   already something the reporter is actively working on, this phase's
   tool-wide picker could surface a data point from a project the reporter
   has never opened. Worth watching whether that's confusing in practice
   versus genuinely useful for spotting unexpected cross-project patterns.
4. **Does deleting a theme need a confirmation step**, the same open
   question Phase 4 (§9.9) raised for research questions — here more
   pressing, since theme deletion (unlike research question deactivation)
   is not reversible and can affect a hierarchy (a meta-theme's children
   get orphaned to top-level, per §3). Leaning toward yes, unlike Phase 4's
   lean toward no — worth confirming.
