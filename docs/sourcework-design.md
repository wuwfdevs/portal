# Sourcework — Design and Phased Plan

Status: **Phases 1–3b shipped. Phase 4 is designed, not yet built — see §9.
Phase 5 is designed too, not yet built — see `docs/sourcework-analysis-
design.md`, written alongside §9 rather than after it (a data point isn't a
very meaningful deliverable without something to group it into a pattern).
Phase 6 remains a roadmap, not a spec** — it needs its own design doc
reviewed before implementation starts, the same way Remote Interview and
Audience Listening each got one. **Phase 3 has been split into 3a and 3b**
(§5) — 3a (Source Library and a multi-source Project UI) shipped first, see
§7; **3b (PDF documents, a document-processing pipeline, page-aware
structured text) is designed and shipped, see §8.** Translation, bundled
into the original single Phase 3, is deferred past 3b — see §8.1.

This document generalizes the Transcription Workspace's data model into
Sourcework: a provenance-preserving foundation for turning source material
(today: audio/video; later: documents, translations) into structured knowledge,
while the existing transcription UI stays intact. It supersedes
`docs/transcription-workspace-design.md` §2's constraint #1 ("one source media
file per project, permanently") — see "Relationship to the Transcription
Workspace design" below for what still holds.

## 1. The problem this solves

The Transcription Workspace's `tw_projects` was 1:1 with one media file, by
deliberate design. That works for "transcribe this interview," but it can't
express something that actually happens in a newsroom: the same interview
mattering to more than one story, sometimes years apart. Today that requires
either re-uploading the same audio into a second project (duplicating storage
and transcription cost) or losing the connection between the two entirely.

## 2. Design decisions

- **Source and Project are different objects with different lifetimes.** A
  Source is immutable original material (one recording, one file). A Project
  is the work that references one or more Sources — it never owns them.
- **A transcript is a Representation, not a project property.** Representation
  generalizes "the transcript" to any derived content produced from a source
  (later: OCR text, a translation) — each is one row, tied to a source, with
  an optional parent representation for chains like OCR → translate.
- **Transformations are developer-authored pipelines, invoked in sequence by a
  user — not a declarative, type-checked, composable graph.** A French PDF
  gets OCR'd, then the resulting text gets translated: two explicit actions, a
  UI offering "Translate" wherever a text-kind representation is shown. Each
  pipeline is a plain function with a real (TypeScript) input/output type; no
  runtime type registry or pipeline planner exists or is planned near-term —
  nothing in this repo yet needs "give me English text from a French PDF" as
  one auto-planned step.
- **Provenance chains are many-to-many, not a strict tree**, once analysis
  (Phase 4+) exists: one excerpt commonly grounds multiple data points, one
  data point commonly feeds multiple themes. Join tables, not parent pointers.
- **Cross-tool project unification (Editorial Planning, Audience Listening) is
  a separate, later decision (Phase 6)** — not a migration-risk question but a
  security-review one: those tools' RLS/anonymous-participant models deserve
  their own review rather than being entangled into this foundational work.
- **`sw_` prefix** for new tables, parallel to `tw_`/`ep_`/`al_`/`ri_` — a new
  subsystem, not core portal infrastructure like `profiles`/`tools`.
- **No backward-compatible staging.** Nothing in this database was live when
  Phases 1–2 shipped, so the migrations restructure directly to the intended
  shape (see the migration files' own comments) rather than deprecating
  columns in place.

## 3. Data model (Phases 1–2, shipped)

```
sw_sources                  immutable original material (one recording/file)
├── sw_representations      derived content: transcript, (later) ocr_text, translated_text
│   ├── tw_segments         ordered transcript text + word timings (kind=transcript)
│   └── tw_speakers         diarization label → human name (kind=transcript)
├── sw_source_excerpts      [start_ms,end_ms) region + editorial title/excerpt/export
└── sw_project_sources      many-to-many: which project(s) reference this source

tw_projects                 the work: title, description, created_by — no media,
                             no status of its own (see below)

tw_chunks                   derived retrieval windows, keyed to a representation
                             (unchanged in spirit from the Transcription Workspace
                             design doc §5/§6 — just rekeyed)
```

`tw_projects` dropped `status`, every `media_*` column, `transcription_provider_
job_id`, `error_message`, and `transcribed_at` — "is this project ready" wasn't
well-defined once a project can reference more than one independently-
progressing source. `lib/transcription/projects.ts`'s `computeProjectStatus()`
derives the same four states (`uploading`/`processing`/`ready`/`failed`) the UI
has always shown, from a source's upload status plus its transcript
representation's status — every screen that shows one status is still looking
at one source's worth of work, since every project created through this tool's
UI still references exactly one source (see Phase 3+ below for when that
changes in practice).

`interview_date` moved from `tw_projects` to `sw_sources` — it's a fact about
the recording, not about whichever project(s) later reference it. `title` and
`description` stay on `tw_projects`: they're the project's own editorial
framing, which can drift from the source's own title over time.

Storage paths moved from `<project id>/...` to `<source id>/...`
(`sourceObjectPath`, `excerptExportObjectPath` in `lib/transcription/media.ts`)
— no data had to move: the bucket's RLS is membership-scoped, not
path-scoped, and the migration reuses each existing `tw_projects` row's id as
its new `sw_sources` row's id, so historical paths stayed valid without a
rename.

## 4. Relationship to the Transcription Workspace design

`docs/transcription-workspace-design.md` is still the product doc for the
transcription UI itself (upload, correction, speaker naming, clips, export,
search) — none of that changed. Its §2 constraint #1 ("one source media file
per project... a session that produced three files is three projects") is
superseded by `sw_project_sources`'s many-to-many shape, but in practice every
project created through the UI today still references exactly one source —
nothing has shipped yet that lets a reporter attach a *second*, pre-existing
source to a project, or browse the source library independent of a project.
That's the first piece of Phase 3+ work, not something Phases 1–2 needed to
justify the split: the split's payoff so far is that a shared source's
transcript is addressable by more than one project without re-transcribing,
the moment that UI exists.

## 5. Phased plan

**Phase 1 (shipped)** — `sw_sources`, `sw_representations`, `sw_project_sources`;
`tw_segments`/`tw_speakers`/`tw_chunks` rekeyed from `project_id` to
`representation_id`; `tw_projects` shrunk. One migration
(`20260731120000_sourcework_sources_representations.sql`), reusing each
project's id for its source/representation rows so the rekey is a rename, not
a data rewrite.

**Phase 2 (shipped)** — `tw_clips` folded directly into `sw_source_excerpts`
(`source_id`, nullable `representation_id`, `excerpt_text`) — a rename and
reshape, not a parallel legacy table
(`20260731130000_sourcework_source_excerpts.sql`).

**Phase 3 has been split into two independently-shippable slices** — the
original single Phase 3 bundled a UI problem (browsing/reusing sources) with
a vendor-research problem (OCR/translation), and the two don't need to land
together. Splitting them lets the UI half ship against Phases 1–2's
already-built data model without waiting on a document pipeline decision.

**Phase 3a (shipped — see §7)** — the Source Library and Source Detail
screens, and the "reference an existing source" / multi-source Project UI
that makes the many-to-many shape from Phase 1 actually reachable, for the
one source kind that exists today (`audio_video`). No new source kind,
pipeline, or vendor dependency.

**Phase 3b (shipped — see §8)** — new source kind `document` (PDF) and a
document-processing pipeline (native PDF text extraction, falling back to
Mistral OCR) producing a page/block-aware `document_text` representation,
document-aware excerpts, and search/status generalization to cover it.
Translation — bundled into the original single Phase 3 alongside OCR — is
explicitly **deferred**, not part of 3b; it remains a future transformation
on any text-kind representation (transcript or document_text), unpicked and
unscoped, same as before.

**Phase 4 (designed, not started — see §9)** — `sw_source_excerpts` gains
company: research questions (project-scoped), data points, and a
many-to-many join between data points and the excerpts that ground them.

**Phase 5 (designed, not started — see `docs/sourcework-analysis-
design.md`)** — themes, meta-themes, synthesis. Genuinely new product
surface, not a refactor — informed by CAQDAS prior art (NVivo/Atlas.ti/
MAXQDA/Dedoose: codebook vs. emergent coding, memos, saturation), most of
which that design deliberately doesn't adopt — see its §1. Its own open
question ("can a theme span multiple `tw_projects`, or is it project-scoped
like research questions in Phase 4?") is resolved there, in its §2: a theme
is not project-scoped at all — membership is derived entirely from which
data points it groups, which can span more than one project.

**Phase 6 (not started, highest risk)** — Audience Listening's `al_answers`
handoff (currently one-off `tw_projects` rows via `startTranscriptionForProject()`,
see `lib/audience-listening/handoff.ts`) moves to referencing a shared
`sw_sources` row instead; Editorial Planning's pitches gain the ability to
create/attach a shared project. Both reopen those tools' design docs'
explicit scope statements ("not a production-tracking system"; "one answer,
one transcription project... the grouping stays here") — rewrite the
reasoning there, don't silently supersede it. Don't start until Phases 1–5
have shipped and been used on at least one real investigation.

## 6. What Phases 1–2 deliberately did not touch

- The transcription UI (upload, correction, speaker naming, clip creation,
  export, search) — every screen works exactly as before; only the data
  underneath it moved.
- `tw_clips`' production fields (`export_storage_path`, `exported_at`) —
  carried over onto `sw_source_excerpts` unchanged.
- Audience Listening's per-answer handoff shape (`sendAnswerToTranscription`
  still creates one project + one source per answer) — Phase 6's concern, not
  this one's.

## 7. Phase 3a design — Source Library and multi-source Project UI (shipped)

Status: **shipped 2026-07-31.** Written from four mockup screens (Source
Library, Source Detail, multi-source Project, Research Workspace) reviewed
against this doc and the current implementation, then reviewed with the
product owner (§7.4's open questions were answered before implementation
started) and built the same day. The mockups' Research Workspace screen
(data points → themes → synthesis) is **out of scope here** — that's Phase
4/5, unchanged by this section. This section covers only the two screens'
worth of UI Phase 3a actually needed: a source-centric library, and a
project that can hold more than one source.

It shipped with **zero new source kinds, pipelines, or vendor
dependencies** — everything it needed (`sw_sources`, `sw_representations`,
`sw_project_sources`, `sw_source_excerpts`) already shipped in Phases 1–2,
and `sw_project_sources`'s existing `for all` RLS policy already covered the
new insert, so no migration was needed either.

### 7.1 What's actually missing today

Phases 1–2 built the data model; nothing built on top of it yet lets a
reporter *use* the many-to-many shape. Concretely, today:

- There's no way to attach an existing source to a second project — every
  project's source comes from `new-project-form.tsx`'s upload flow, which
  always creates a brand-new `sw_sources` row.
- There's no page that shows a source on its own, independent of a project —
  `sw_sources` is only ever read through whichever `tw_projects` row
  references it (`getProjectById`/`getPrimarySourceForProject`).
- `sw_source_excerpts` already carries `source_id`, decoupled from any one
  project — but the only place excerpts are shown is the per-project rail
  (`clip-rail.tsx`) and the cross-project flat list at `/sourcework`
  (`ClipLibrary`, `?tab=clips`), never scoped to "every excerpt of this one
  source across every project it's used in."
- `lib/transcription/projects.ts`'s `getPrimarySourceForProject` /
  `getPrimaryProjectIdForSource` and `computeProjectStatus()` all assume
  "the" one source a project has — true today, not true the moment a second
  source can be attached.

### 7.2 New screens

**Source Library** — a third tab at `/sourcework` (`?tab=sources`,
alongside Projects and Excerpts); card grid of every `sw_sources` row the
caller has tool access to. Each card: type badge (today, always "Audio"),
title, uploaded date, duration, and "Used in N projects" from
`sw_project_sources`. Search and a type filter chip row, matching the
existing search bar's affordance at `/sourcework` — the filter chips are
close to inert with one source kind, but the UI shouldn't have to be
rebuilt when Phase 3b adds more.

**Source Detail** (`/sourcework/sources/[id]`, a new route) — one source,
independent of any project. **Revised from the original proposal below —
see the note at the end of this list for what actually shipped and why.**
- ~~Representation chain: today always a fixed three-node shape (Original
  Audio → Transcription + Diarization → Transcript), rendered generically
  (a list of representation rows plus the pipeline that produced each) so
  Phase 3b's OCR/translation chains extend it without a rewrite.~~
- "Used in projects" — every `tw_projects` row joined through
  `sw_project_sources`, linking out to `/sourcework/[projectId]`.
- "Source excerpts here" — every `sw_source_excerpts` row for this
  `source_id`, across every project that made one. This is new: nothing
  today shows a source's excerpts independent of the project that made
  them, even though the data has always supported it since Phase 2.
- The mockup's word-level "alignment" hover demo (excerpt text ↔ a
  timestamp or bounding box, highlighting as you hover a word) is **not
  included** — it's a nice interaction idea with no concrete need behind it
  yet (clip creation's existing word-highlight-while-selecting already
  covers the "which words am I selecting" problem `segment-row.tsx` solves).
  Leave it out unless a real use case shows up.

  **What actually shipped, and why this list is now wrong about the first
  bullet:** Source Detail did not become a metadata-plus-chain-diagram
  summary page that links out to "the real" workspace elsewhere. It
  rendered the *same* working surface the project workspace shows —
  player/transcript/clip rail for a ready source, the same processing/
  failed/uploading states, the same retry action — embedded directly on
  `/sourcework/sources/[id]`, keyed off whichever project first referenced
  the source (see `getPrimaryProjectIdForSource`) purely so existing
  project-scoped actions (retry, clip creation) have somewhere to write.
  A fixed "Original Audio → Transcription → Transcript" chain diagram was
  never built: with exactly one source kind and one pipeline, it would
  have drawn the same two/three-node shape every single time, which is
  the same "no concrete need yet" reasoning the alignment-hover bullet
  above already used. Phase 3b (§8) is the first real second pipeline
  shape (PDF → native-or-OCR → document text) and it *still* doesn't need
  a chain diagram — it needs a different workspace body for a different
  source kind, which is what §8.5 builds by extending this same page with
  source-kind-aware rendering, not by adding a chain visualization on top
  of it. Revisit a chain diagram only if a real multi-hop pipeline
  (document → translation, say) ships and the two-pipeline reality still
  isn't legible from the workspace alone.

**Project workspace gains multi-source.** The existing `/sourcework/[id]`
page and `TranscriptWorkspace` stay the primary editing surface — this
isn't a rebuild, it's addition:
- A "This project's sources" pill row above the workspace, one pill per
  attached source (today, always exactly one — the row is inert but
  present, same reasoning as the filter chips above).
- "+ Reference another source" opens a picker (search/select from Source
  Library, excluding sources already attached to this project) and calls a
  new `attachSourceToProject` action.
- Clicking a pill switches which source's media/transcript the workspace
  shows — the existing `TranscriptWorkspace`/`ClipRail`/`ClipComposer`
  already operate on one source's worth of data (`source_id`-scoped
  excerpts), so switching pills is a data swap, not a new component.

### 7.3 New server-side work (as built)

- `attachSourceToProject(projectId, sourceId)` (`[id]/source-actions.ts`) —
  insert into `sw_project_sources`. No new RLS was needed:
  `sw_project_sources_member_all` (Phase 1 migration) is already `for all`
  for any tool member, so the insert this needed was already covered.
- `listAttachableSources(projectId, query)` (`[id]/source-actions.ts`) —
  sources the caller can see that aren't already attached to `projectId`.
- `listExcerptsForSource(sourceId)` (`lib/transcription/clips.ts`) — new
  read, factored out of the existing `listClipsForProject` (which now calls
  it after resolving the primary source), for Source Detail's "excerpts
  here" list and for the workspace's active (non-primary) pill.
- `listSourcesForProject(supabase, projectId)` and
  `computeAggregateProjectStatus(statuses)` (`lib/transcription/projects.ts`)
  — every source a project references plus the worst-case badge, feeding
  `getProjectById`'s new `sources`/`status` shape.
- `listSources()` and `getSourceDetail(sourceId)`
  (`lib/transcription/projects.ts`) — the Source Library and Source Detail
  reads.
- `getPrimarySourceForProject`/`getPrimaryProjectIdForSource` were **kept
  as-is**, not removed — they still back every project-wide action that
  doesn't (yet) need per-source targeting (upload completion, reindex, the
  clips.zip export, project deletion's cascade check). What changed instead:
  call sites that act on *whichever source the reporter is currently
  looking at* — clip creation, and transcription retry — now take an
  explicit `sourceId`/`representationId` rather than asking "the" project's
  source, so acting on a non-primary pill can't silently land on the wrong
  one. `startTranscriptionForProject` itself was narrowed to take a
  `representationId` directly instead of re-deriving "the" project's
  primary one, which was a real correctness gap: retrying a failed
  *second* source would otherwise have re-kicked the first one.

### 7.4 Open questions — resolved before implementation

1. **Where does Source Library live?** Resolved: a third tab —
   "Projects" / "Sources" / "Excerpts" — keeping Excerpts as its own
   browse surface rather than folding it into Source Detail.
2. **Multi-source project status.** Resolved: worst-case status across all
   attached sources, shown as the one project-level badge
   (`computeAggregateProjectStatus`); each pill also carries its own status
   dot for the sources beneath that badge.
3. **Route shape for Source Detail.** Resolved: `/sourcework/sources/[id]`,
   as proposed — confirmed at build time not to collide with
   `/sourcework/[id]` or `/sourcework/new` (distinct path segment count).
4. **Confirmation UX for reusing a source?** Resolved: no confirmation —
   attach is a single click, matching the "no RLS/data risk" reasoning in
   the original open question.

### 7.5 Explicitly out of scope for Phase 3a

- Any new source kind (document/PDF, image, text) or its upload flow — that
  stays Phase 3b.
- OCR, translation, or any other transformation pipeline.
- The Research Workspace (data points, themes, meta-themes, synthesis) —
  Phase 4/5, needs its own design doc as already scoped in §5.
- The word-level alignment hover demo (§7.2).

## 8. Phase 3b design — PDF documents and a document-processing pipeline (shipped)

Status: **shipped 2026-07-31.** Supersedes §5's original single-paragraph
Phase 3b scope ("document source kind, OCR, translation"). Translation is
**not** part of this phase — see §8.1. This section is grounded in the
implementation that actually exists after Phase 3a: read §7 first.

### 8.1 What this phase is, and isn't

A reporter can attach a PDF (a public-records release, a court filing, a
scanned memo) as a Sourcework Source, get back a page-aware structured text
Representation, read it next to the original, search it alongside every
transcript, and excerpt it with the same provenance guarantees a clip has —
without knowing or caring whether the text came from the PDF's own embedded
layer or from OCR.

This is a **document foundation** phase, not a document-analysis phase. It
does not attempt: translation (explicitly deferred — see below), annotation
(§8.11), table-to-spreadsheet extraction, human correction of OCR at the
block level, general vision-model image/chart interpretation, or turning
extracted text into research data points (that's Phase 4, unstarted). If a
later phase needs any of those, it operates on the `document_text`
representation this phase produces — the same way a future translation
pipeline would.

**Why translation is cut, not deferred quietly:** the original Phase 3
paragraph bundled "OCR, translation" as if they were one decision. They
aren't — OCR is a prerequisite for *reading a PDF at all* in this tool;
translation is a transformation on text that already exists (a transcript
today, a document today) and needs its own vendor research, its own
provenance question (does a translated excerpt still trace to the original
language's page/bbox, or to the translation's own position?), and its own
UI decision (a third pill? inline toggle?) that doesn't yet have a concrete
enough need behind it to answer well. Cutting it keeps this phase's scope to
what §2's "transformations are developer-authored pipelines invoked in
sequence" already promises: document-text-from-PDF is one pipeline,
translation is a separate one for whenever it's actually asked for.

### 8.2 Source kind: `document`

`sw_sources.kind` gains `'document'` (enum value, additive). A document
source is immutable original material exactly like an audio/video one — the
uploaded PDF bytes never change after upload, matching §2's design
decisions unchanged.

New nullable column `sw_sources.page_count integer` — generic (not
PDF-specific in name) for the same reason `original_duration_ms` is generic
to "audio/video," in case a future document-like kind (a paginated image
set, say) also has a natural page count. `original_duration_ms` stays null
for a document source; `page_count` stays null for audio/video. Every other
`sw_sources` column (`title`, `original_storage_path`,
`original_content_type`, `original_size_bytes`, `status`, `error_message`)
is already kind-agnostic and needs no change.

**No new storage bucket.** PDFs live in the existing `transcription-media`
bucket at the existing `sourceObjectPath(sourceId, contentType)` convention
(`lib/transcription/media.ts`) — the bucket's RLS is membership-scoped, not
content-type-scoped (§3's "Storage paths" note already established this for
the source-id rekey), so the only bucket-level change needed is adding
`application/pdf` to `allowed_mime_types`. `isAllowedMediaType`/
`extensionForContentType` in `media.ts` gain the PDF entry; `media.ts` stays
the one place both upload paths (audio and document) validate against.

**`interview_date` stays audio/video-only in spirit** — it's nullable
already and technically settable on a document source, but the UI never
shows or writes it for one (§8.9). No schema change needed to prevent it;
this is a UI-copy decision, not a data-model one, matching the audio/video
`interview_date` precedent of being "a fact about the recording" that
simply doesn't apply to a document.

### 8.3 Representation kind: `document_text`

`sw_representations.kind` gains `'document_text'` — **not** `'ocr_text'`.
The Phase 1 migration defined `'ocr_text'` and `'translated_text'` as
placeholder values with no reader or writer anywhere in the codebase (a
grep across the repo confirms this). `'ocr_text'` names the *mechanism*
(OCR), which is exactly the leak into the data model this phase's brief
warns against — a document extracted via native PDF text has nothing to do
with OCR, but would need the same representation kind. `document_text`
names the *artifact* (structured document text), regardless of which of the
two processing paths produced it. `'ocr_text'` is left in the enum
unchanged — enum values are additive-only in this repo's migration
discipline, and dropping one is a non-additive, higher-risk change with no
behavioral upside since nothing ever wrote it — but no code path will ever
write `'ocr_text'` going forward; treat it as retired-but-present, the same
status `harden_functions` has in the migration ledger for a different
reason (`APPLIED.md`).

A document source's `document_text` representation reuses every generic
column `sw_representations` already has, exactly as the transcript kind
does — no new columns on this table:

- `status` / `error_message` — the same four-state lifecycle
  (`pending`/`processing`/`ready`/`failed`) transcripts use.
- `produced_by` — `'native-pdf-text'` or `'mistral-ocr'`, the method that
  actually produced the current content (§8.6 explains why exactly one of
  these is true per representation, never both).
- `config` — processing metadata for the *current* successful (or
  in-flight) attempt: `{ method, provider, model, options, schemaVersion }`.
  This is the "sufficient version information to reproduce or reprocess it
  later" the brief asks for, at the representation level.
- `provider_job_id` — unused for the document pipeline (neither path is a
  provider-side async job the way AssemblyAI's is); left null.

Historical attempts, raw provider payloads, and per-attempt errors are
**not** crammed into `sw_representations` — seeing a stale `config` blob
grow into a log is exactly the "opaque provider JSON as the primary model"
mistake the brief warns against avoiding for the page/block data, and the
same reasoning applies to attempt history. That's what
`sw_document_processing_runs` is for — see §8.6.

### 8.4 Canonical document structure: two new tables

The brief's central provenance invariant — "any extracted passage shown,
searched, or excerpted must remain traceable to its page and, where
coordinates are available, to the corresponding visible region" — drives a
normalized, page-and-block schema rather than one JSON blob per
representation.

```sql
sw_document_pages
  id uuid pk
  representation_id uuid not null references sw_representations on delete cascade
  page_number integer not null                -- 1-based
  width_pt real                                -- page dimensions, when known
  height_pt real
  rotation_degrees integer not null default 0  -- 0/90/180/270, from the PDF's own page rotation
  created_at timestamptz not null default now()
  unique (representation_id, page_number)

sw_document_blocks
  id uuid pk                                   -- the stable identifier a later
                                                 -- transform (or excerpt) references
  representation_id uuid not null references sw_representations on delete cascade
  page_id uuid not null references sw_document_pages on delete cascade
  page_number integer not null                 -- denormalized off page_id: every
                                                 -- caller of this table wants the
                                                 -- page number, and joining
                                                 -- sw_document_pages for it on
                                                 -- every chunk-build/search-result
                                                 -- read is pure overhead
  reading_order integer not null                -- 0-based position within the
                                                 -- representation, spanning pages
  block_type sw_document_block_type not null default 'paragraph'
  text text not null default ''
  bbox jsonb                                     -- {x0,y0,x1,y1}, fractional
                                                  -- 0..1 of page width/height —
                                                  -- resolution-independent, so the
                                                  -- viewer maps it at any zoom
                                                  -- without knowing the source DPI
  confidence real                                -- 0..1, OCR only; null for native
  source text not null check (source in ('native', 'ocr'))
  extra jsonb not null default '{}'::jsonb       -- provider-specific extras kept
                                                  -- without widening the table —
                                                  -- e.g. a table block's HTML
  created_at timestamptz not null default now()
  unique (representation_id, reading_order)

create type sw_document_block_type as enum (
  'heading', 'paragraph', 'list_item', 'table', 'table_cell',
  'figure', 'caption', 'header', 'footer', 'other'
);
```

Notes on the choices:

- **`bbox` is one nullable jsonb column, not four numeric columns.** A
  bounding box is always used as one unit (draw a highlight rectangle),
  never queried by its individual edges, so there's no indexing or
  filtering reason to normalize it into columns — same reasoning
  `tw_segments.words` already uses for word timings in this codebase.
  Nullable because native extraction sometimes can't recover a reliable
  box for a given text run; the block and its text still exist and are
  still page-traceable even without one, satisfying the invariant's "where
  coordinates are available" qualifier honestly rather than faking a box.
- **`reading_order` is representation-scoped, not page-scoped**, so a
  chunk window (§8.8) can walk blocks across a page boundary with one
  `order by reading_order` instead of a two-level page-then-position sort.
- **No `search`/embedding columns on `sw_document_blocks` itself.** Search
  operates on chunks (windows of blocks), exactly as it operates on windows
  of transcript segments today, not on individual blocks — see §8.8. A
  block existing only to be assembled into a chunk, never searched
  directly, is why it doesn't need its own tsvector/embedding.
- **Ordered pages are `sw_document_pages`, not a `page_count` array
  somewhere** — each page is a real row so dimensions/rotation are
  queryable and a page can exist (e.g., a page rendered with an empty text
  layer, all-image) with zero blocks under it.

### 8.5 Document workspace: extending Source Detail and the project workspace, not forking them

Both `/sourcework/sources/[id]` and the multi-source project workspace
(`/sourcework/[id]`) already resolve "the active source" (§7's shipped
behavior, not the original chain-diagram proposal — see the correction at
the end of §7.2) and render a workspace body for it. Phase 3b adds a
second body and a switch:

```
activeSource.kind === 'audio_video'  → <TranscriptWorkspace ... />  (unchanged)
activeSource.kind === 'document'     → <DocumentWorkspace ... />    (new)
```

Both call sites (`sources/[id]/page.tsx` and `[id]/page.tsx`) already fetch
"the active source" and branch on its status before rendering a workspace —
the new branch is on `kind` first, `status` second, inside the same
`status === 'ready'` block each page already has. No new route, no new
top-level page component.

**`DocumentWorkspace`** (`components/transcription/document-workspace.tsx`,
mirroring where `TranscriptWorkspace` already lives structurally):

- **PDF rendering via `react-pdf`** (wraps `pdfjs-dist`) — an established
  library, not a hand-rolled canvas renderer, per the brief. Specific
  reason for the dependency (CLAUDE.md's "no major dependency without a
  reason"): rendering a PDF page to a canvas with correct text-layer
  alignment is exactly the kind of well-trodden, easy-to-get-subtly-wrong
  problem a dependency should own.
- **Two panes, same "two views of one object" framing the transcript
  workspace already uses for audio+transcript:** the rendered PDF page on
  one side, extracted text (this page's `sw_document_blocks`, in reading
  order) on the other. Clicking a block in the text pane scrolls/highlights
  its bbox on the rendered page (when a bbox exists); there is no reverse
  "click the PDF to jump to text" in this phase — clicking inside a
  rendered PDF page to resolve which text block was clicked needs
  coordinate-to-block hit-testing that adds real complexity for an
  interaction the brief doesn't ask for (it asks for text→region, not
  region→text). Left as a natural follow-up if reporters ask for it.
- **Page navigation**: prev/next plus a page-number field, driving both
  panes together. **Zoom**: in/out controls scaling the rendered page (and,
  since bbox is stored fractionally, the highlight overlay needs no
  recomputation at a new zoom level — it's the same reason bbox was
  designed as fractional in §8.4).
- **Text selection → excerpt creation**: selecting text in the reading-order
  pane (which can span multiple rendered blocks, including across a page
  boundary) surfaces the same "Create excerpt" affordance the transcript
  pane's word-selection already has, backed by new pure logic
  (`lib/transcription/document-selection.ts`, mirroring the existing
  `selection.ts`/`selection.test.ts` pair) that resolves a browser
  `Selection` into an ordered list of `{ blockId, pageNumber, startOffset,
  endOffset }` spans — see §8.7 for what that becomes in the database. The
  DOM-selection-to-span glue is thin and browser-only (untested, like the
  analogous glue in the existing selection code); the span-resolution logic
  itself is pure and tested.
- **Processing / failure / retry / empty states**: reuses
  `ProcessingPoller` and the existing status-branch shape in both host
  pages unchanged — `ProcessingPoller` already only cares about `status`,
  not source kind. Failure shows `error_message` plus a retry action (§8.6
  covers what retry does differently here than transcription retry).
- **Metadata shown is document-appropriate**: page count instead of
  duration, file size, no speaker/diarization UI. §8.9 covers copy in
  detail.

### 8.6 Document processing pipeline

An explicit, typed, server-only pipeline — not a transcript-specific
function stretched to fit, and not a declarative pipeline graph (§2's
constraint stays: this is one more developer-authored pipeline, invoked
like the transcript one, not a generalized planner).

**Decision, not a user choice.** `isNativeTextAdequate(pages:
NativeExtractionPage[]): boolean` (`lib/transcription/document-
normalization.ts`, pure, tested) inspects the PDF's own embedded text layer
— extracted via `pdfjs-dist`'s text-content API, no network call — and
decides whether it's usable prose or the near-empty/garbled output a
scanned page's missing text layer produces. Heuristic, not exhaustive:
average extractable characters per page above a floor, and the fraction of
pages that come back essentially empty, both under a tunable threshold.
Reporters never see a "native vs. OCR" toggle; they see one "Process
document" state that resolves to one of the two paths.

**Two paths, one normalized output.** Both a native-extraction run and an
OCR run write into the same `sw_document_pages`/`sw_document_blocks` shape
(§8.4) via a shared normalizer interface — `NormalizedDocumentResult {
pages: NormalizedPage[]; blocks: NormalizedBlock[] }` (`lib/transcription/
document-provider.ts`, pure types, mirroring `asr-provider.ts`'s role for
the transcript pipeline). Native extraction (`lib/transcription/providers/
native-pdf.ts`) reads text runs directly off the PDF via `pdfjs-dist`,
grouping into paragraph-level blocks by layout gaps; block boundaries are
a reasonable heuristic, not typeset-perfect, and `block_type` is mostly
`paragraph` (a modest heading heuristic — meaningfully larger font size
than the page's median — is included where `pdfjs-dist` exposes it; no
attempt at list/table detection on the native path, since a PDF with real
tabular/list *structure* markup is rare enough in practice that this isn't
worth building against — a table that came through as prose paragraphs is
still fully readable, searchable, and excerptable, just not specially
typeset). `confidence` is null throughout (extracted text is exact, not a
probabilistic read). `source = 'native'`.

**Mistral OCR** (`lib/transcription/providers/mistral-ocr.ts`) is the
fallback path, via the official `@mistralai/mistralai` TypeScript SDK
(`client.ocr.process(...)`, model `mistral-ocr-latest`) — never a
hand-rolled HTTP call, following this repo's stated preference for an
official SDK over reimplementing a provider's wire format. **Docs
verification note**: `docs.mistral.ai` returns 403 to automated fetches in
this environment (the same failure mode the Daily integration's design doc
already recorded for `docs.daily.co` — see CLAUDE.md's Remote Interview
slice 3 entry) — confirmed while writing this doc. The request/response
shape below is reconstructed from the SDK's own published usage examples
and its `package.json`/dependency metadata (`@mistralai/mistralai@2.5.0`,
repo `mistralai/client-ts`), **not** from the primary docs. Before writing
`mistral-ocr.ts`, install the SDK and read its own `.d.ts` types directly
— an installed package's type definitions are unambiguous and don't
require a docs site to be reachable at all, which is the actually-reliable
way to satisfy this phase's "verify current behavior" requirement given
the fetch failures. Treat every field name below as provisional until
checked against those types:

```ts
const response = await client.ocr.process({
  model: "mistral-ocr-latest",
  document: { type: "document_url", documentUrl: signedUrl },
  includeImageBase64: false, // we already have the original PDF in Storage
});
// response.pages: [{ index, markdown, images: [{ id, topLeftX, topLeftY,
//   bottomRightX, bottomRightY, ... }], dimensions: { dpi, width, height } }]
```

`mapMistralResponseToDocument()` (pure, colocated `.test.ts`, mirroring
`providers/assemblyai-mapping.ts`'s split from `assemblyai.ts`) converts
that into `NormalizedDocumentResult`: one `sw_document_pages` row per
`pages[]` entry (dimensions from `dimensions`), blocks parsed out of each
page's `markdown` in reading order (headings/paragraphs/lists/tables from
markdown syntax — `#`/`##` → `heading`, `-`/`1.` → `list_item`, a markdown
table → `table` with the original markdown retained in `extra.markdown`),
image regions from `images[]` → `figure` blocks with `bbox` normalized from
the corner coordinates against the page's own `dimensions`. Confidence and
finer per-run bounding boxes, if the installed SDK's types expose them
beyond what markdown parsing recovers, get mapped through; if not, they
stay null rather than invented. `source = 'ocr'`. The **raw** `response` is
retained (see below) for exactly the case where the markdown-based mapping
above turns out to lose something worth recovering later without
re-calling the provider.

**Idempotency and retry** — `sw_document_processing_runs`:

```sql
sw_document_processing_runs
  id uuid pk
  representation_id uuid not null references sw_representations on delete cascade
  attempt integer not null
  method text not null check (method in ('native', 'ocr'))
  provider text                         -- null for native; 'mistral' for ocr
  provider_model text                   -- e.g. 'mistral-ocr-latest'
  options jsonb not null default '{}'::jsonb
  status text not null default 'processing' check (status in ('processing','ready','failed'))
  error_message text
  raw_response jsonb                    -- provider's raw payload, OCR only —
                                         -- diagnostics/reprocessing, never read
                                         -- by the app's normal display path
  started_at timestamptz not null default now()
  finished_at timestamptz

  -- at most one in-flight run per representation:
  unique index on (representation_id) where status = 'processing'
```

This is a plain audit-log table, not a job queue — nothing polls it, no
worker consumes it, and it exists for the same reason `audit_events` exists
elsewhere in this repo: a record of what was attempted, by what method,
with what result, that the live `sw_representations` row alone can't carry
without becoming a growing blob (§8.3). The partial unique index is the
actual idempotency guard: a second "process this document" request while
one is already in flight fails the insert rather than silently starting a
duplicate; `startDocumentProcessing()` checks for an existing in-flight run
first and returns a friendly no-op rather than surfacing that constraint
violation to a reporter.

**A processing run can go stale** if the serverless invocation running it
is killed outright (deploy, platform-level timeout) rather than failing
cleanly — see the execution model below. `isStaleProcessingRun(startedAt,
now, thresholdMs)` (pure, tested; default threshold generous — minutes, not
seconds, since a large scanned document's OCR pass is not fast) lets the
retry action recognize a stuck `'processing'` run, mark it `'failed'` with
"processing appears to have stalled," and clear the way for a fresh
attempt — without this, the partial unique index above would permanently
block retrying a document whose processing run died without writing its
own failure.

**Execution model — decoupled from the browser.** Native extraction is a
local, CPU-bound operation (no external network call) and completes in
milliseconds to low seconds even for a large PDF, so it runs synchronously
inside the same Server Action that creates the processing run — no
decoupling needed, same as everything else in this codebase that's fast
enough to just await. Mistral OCR is a real external call that can take
anywhere from a few seconds to over a minute for a large scanned document —
long enough that keeping a reporter's request open is both a poor UX and a
real risk of hitting a platform request-duration limit, and Mistral's OCR
endpoint is fully synchronous with **no native webhook support** (confirmed
via research while writing this doc — Mistral's only async primitive is
the Batch API, which is poll-only and priced/designed for scale processing,
not a single reporter's single document). AssemblyAI's kickoff-then-webhook
pattern (`docs/transcription-workspace-design.md` §6) doesn't have an
equivalent here to reuse.

The pattern used instead: `startDocumentProcessing()` creates the
processing-run row and flips the representation to `processing`, then
returns — the Server Action's response reaches the browser immediately, so
the reporter's page navigates to the (now-processing) document view and
`ProcessingPoller` takes over exactly as it does for a transcribing audio
source. The actual Mistral call and the normalization/write-back happen
inside Next's `after()` (`next/server`, available in the installed Next
16), which runs after the response has been sent but within the same
serverless invocation's extended lifetime — decoupled from whether the
reporter's browser stays connected, without introducing a queue, a worker,
or any new standing infrastructure; it's a platform primitive this Next
version already ships, used here for the first time in this repo.
`maxDuration` is raised (300s) so a large document's OCR pass has room to
finish — on the **pages** that can trigger it (`sourcework/new/page.tsx`,
`sourcework/[id]/page.tsx`, `sourcework/sources/[id]/page.tsx`), not on
`actions.ts` itself: a bare `export const maxDuration` inside a `"use
server"` file broke Turbopack's Server Actions compilation outright
("module has no exports at all"), confirmed by hitting it while building
this slice. A Server Action inherits its invoking route's `maxDuration`, so
the three call-site pages carry it instead — each documents this inline so
a future page that also calls `completeProjectUpload`/`retryTranscription`
doesn't quietly lose the extended budget. The honest risk, stated plainly
rather than glossed over: if the
invocation is killed before `after()` finishes (a deploy landing
mid-request, a hard platform-level cap below the configured
`maxDuration`), the processing run is left `'processing'` with no failure
ever written — which is exactly what `isStaleProcessingRun` and the retry
action's stale-run check above exist to recover from, rather than a
reporter being stuck forever behind a partial unique index. This is the
one place this phase's architecture carries real operational risk, and it
is not fully testable in this sandboxed environment (see §8.13).

On success (either path): `sw_document_pages`/`sw_document_blocks` for the
representation are replaced wholesale (delete-then-insert — the same
"clean slate" precedent the transcript webhook already uses for
`tw_segments`/`tw_speakers`, justified the same way: nothing downstream can
have referenced block ids from a *previous* run of a representation that's
being reprocessed from scratch, so there's nothing to preserve across the
boundary), `sw_sources.page_count` is set, the representation flips to
`ready` with `config`/`produced_by` recorded, the processing run flips to
`ready`, and `reindexRepresentation()` runs (§8.8) — swallowed on failure,
exactly like the transcript webhook already swallows a post-success
indexing failure, so a document that extracted perfectly doesn't get
marked failed because chunking or embedding had a bad moment.

### 8.7 Document excerpts: a typed locator, not `start_ms`/`end_ms`

`sw_source_excerpts` already generalizes past "clip" (§3's Phase 2), and
already carries a nullable `representation_id` — a document excerpt uses
that column to point at the source's `document_text` representation
exactly as a clip points at its `transcript` one. What it doesn't have is
anywhere to put *where in the document* the excerpt is, since `start_ms`/
`end_ms` are a temporal concept that doesn't apply.

```sql
alter table sw_source_excerpts
  add column locator_kind text not null default 'temporal'
    check (locator_kind in ('temporal', 'document')),
  alter column start_ms drop not null,
  alter column end_ms drop not null;

-- replaces sw_source_excerpts_time_range_check:
alter table sw_source_excerpts add constraint sw_source_excerpts_locator_check check (
  (locator_kind = 'temporal' and start_ms is not null and end_ms is not null and end_ms > start_ms)
  or
  (locator_kind = 'document' and start_ms is null and end_ms is null)
);

sw_excerpt_document_locations
  id uuid pk
  excerpt_id uuid not null references sw_source_excerpts on delete cascade
  sequence integer not null              -- ordered: an excerpt spanning
                                          -- blocks/pages is >1 row, in order
  page_number integer not null
  block_id uuid references sw_document_blocks on delete set null
                                          -- set null (not cascade): the block
                                          -- a reprocessed representation
                                          -- regenerates won't share this row's
                                          -- old block id, but the excerpt's own
                                          -- text/page/offsets still mean
                                          -- something without it — see below
  start_offset integer                   -- char offsets into that block's text
  end_offset integer
  bbox jsonb                             -- this location's region, when known —
                                          -- the spanned block's own bbox today
                                          -- (see the tradeoff note below), not a
                                          -- finer sub-block box
  unique (excerpt_id, sequence)
```

This satisfies every locator requirement in the brief: selected text stays
on `excerpt_text` (unchanged, already generic); one or more pages is the
distinct `page_number` values across an excerpt's location rows; block
references and in-block offsets are `block_id`/`start_offset`/
`end_offset`; one or more bounding regions is one row per region; spanning
blocks or pages is simply more than one ordered row; reopening the source
at the location is `/sourcework/sources/[sourceId]?page=<page_number>` (or
`/sourcework/[projectId]?source=<sourceId>&page=<page_number>` from a
project), the document-kind counterpart of today's `?t=<start_ms>`.

**Stated tradeoff**: `bbox` on a location row is the *spanned block's own*
bounding box, not a computed sub-region tightened to the exact selected
characters within that block (e.g., "the last half of this paragraph").
Computing a precise sub-block highlight rectangle needs per-character or
per-line position data most PDFs (and Mistral's markdown-oriented OCR
output) don't hand back at that granularity, and reconstructing it would
mean either a second, denser layer of position data on every block "just
in case" or real text-shaping work at excerpt-creation time — both real
engineering for a need the brief doesn't ask for (it asks that a passage
"remain traceable to... the corresponding visible region," which a
whole-block highlight satisfies) and adjacent to the explicitly-deferred
"detailed human correction of OCR at the individual block level." The
`start_offset`/`end_offset` pair already pins the *exact text* precisely;
only the *visual highlight* is block-grained rather than character-grained.
Revisit if a real workflow need for tighter highlighting shows up.

**Why `on delete set null` for `block_id`, not `cascade`:** reprocessing a
representation (a retry, or someday a reprocess-with-different-options
action) deletes and regenerates every block under it, per §8.6's
delete-then-insert. An excerpt made against the *previous* run's blocks
would otherwise cascade-delete the moment someone retries processing —
destroying a reporter's saved excerpt because *the pipeline*, not the
excerpt, changed. `set null` keeps the excerpt (its `excerpt_text`,
`page_number`, and offsets are still meaningful and still open the source
at the right page) while honestly dropping the now-stale bbox/block link
rather than pointing it at an unrelated new block that happens to reuse the
id space. This is a real, narrow gap — a retried document's excerpts lose
block-level (though not page-level) highlight precision — accepted rather
than solved with block-diffing machinery that has no other use in this
phase.

`sw_source_excerpts_search_idx` (the existing generated tsvector over
`title || excerpt_text`) needs no change — it already covers document
excerpts, since both columns stay generic text.

### 8.8 Chunking, indexing, and search generalization

**`tw_chunks` gains document-shaped location columns, not a parallel
table.** A chunk is already "a retrieval window of text with enough
position data to deep-link back," representation-scoped since Phase 1 —
generalizing its position columns is smaller and more honest than standing
up a second chunk table with its own staleness triggers and its own half
of `tw_search` to maintain in lockstep forever.

```sql
alter table tw_chunks
  alter column start_ms drop not null,
  alter column end_ms drop not null,
  add column page_start integer,
  add column page_end integer,
  add column anchor_block_id uuid references sw_document_blocks on delete set null;

-- replaces tw_chunks_time_range_check:
alter table tw_chunks add constraint tw_chunks_location_check check (
  (start_ms is not null and end_ms is not null and end_ms > start_ms)
  or
  (start_ms is null and end_ms is null and page_start is not null and page_end >= page_start)
);
```

`anchor_block_id` is `set null` on delete for the same reprocessing reason
as §8.7's excerpt locations — a search hit surviving a reprocess with
page-level but not block-level precision is the same accepted tradeoff.

**Chunk building branches on the representation's kind**, not a new
per-kind table: `reindexRepresentation()` (`lib/transcription/
indexing.ts`) reads the representation's `kind` first, then calls either
the existing `buildChunks()` (segments → ~45s windows, unchanged) or a new
`buildDocumentChunks()` (`lib/transcription/chunking.ts`, pure, tested,
alongside the existing one) that walks `sw_document_blocks` in
`reading_order` and closes a window by **character** count instead of
milliseconds (documents have no natural time axis; a target of roughly a
few paragraphs per window, with a modest block-count overlap so a passage
straddling a window boundary isn't split between two mediocre embeddings —
the same reasoning `CHUNK_OVERLAP_MS` already documents for the transcript
case, translated to a block unit instead of a time unit). Each resulting
window records `pageStart`/`pageEnd` (min/max page across its blocks) and
`anchorBlockId` (its first block). `resolveEmbeddingContext()` and
`embedPending()` need no change at all — they already operate purely on
`representation_id`/`source_id`, never inspecting `kind` or the temporal
columns directly; `buildEmbeddingInput()` is also unchanged, since it only
ever touches `title`/`interviewDate`/`description`, all already optional.

**`tw_search()`** is regenerated once more (its fourth revision in this
migration lineage — the established pattern here, per the existing
`tw_search_source_id` migration's own comment about `create or replace`
refusing an output-shape change). The chunk half's `hit_kind` becomes
`'transcript'` or `'document'` depending on the owning representation's
`kind` (a join already exists here for `source_id` resolution — extending
it to also read `kind` is the only structural change), and the function's
return row gains a nullable `page_number` alongside the existing
`start_ms`/`end_ms` (populated from a chunk's `page_start` or an excerpt's
first `sw_excerpt_document_locations` row, whichever hit kind it is).

`lib/transcription/search.ts`'s `SearchResultKind` gains `'document'`;
`SearchResult` gains `pageNumber: number | null`.
`components/transcription/search-results.tsx`'s `KIND_BADGE` gains
`document: { label: "In document", variant: "neutral" }` (the audio
counterpart, `'transcript'`, keeps its existing `"In transcript"` label —
neither is renamed to something falsely generic, since the words 'audio
transcript' and 'document text' mean different things to a reporter
reading the badge) and `resultHref()`/the position line render
`formatDuration(startMs)` when present, else `p. ${pageNumber}` when
present, else neither — covering all three kinds (document chunk hit,
document excerpt hit, and the unaffected audio/project cases) from the one
existing shape.

**Everything OPENAI_API_KEY-optional stays optional.** None of the above
touches `embeddings.ts`, and `buildDocumentChunks()`/chunk storage happen
unconditionally exactly as `buildChunks()` already does — only the
subsequent embed pass checks for a configured provider. A document
processed with no embeddings key still gets full-text keyword search over
its extracted text from the moment it's `ready`.

### 8.9 Status, lifecycle, and copy

`computeProjectStatus()` (`lib/transcription/projects.ts`) already takes a
generic `source`/representation status pair and was never actually
audio-specific in its logic — only its parameter name (`transcript`) and
every call site's *label* for the `processing` state claimed it was. The
parameter is renamed to `representation` (behavior unchanged — this
function needed no logic change to already be kind-correct, which is worth
stating plainly rather than implying a bigger fix happened here than did).

What genuinely needed generalizing was **copy**, which was hardcoded
per-screen rather than derived once:

```ts
// lib/transcription/projects.ts (or a small colocated display helper)
export function processingLabel(kind: SwSourceKind): string {
  return kind === "document" ? "Extracting text" : "Transcribing";
}
```

Every `STATUS_BADGE`/`map` literal across `source-library.tsx`,
`sources/[id]/page.tsx`, and `[id]/page.tsx` that hardcoded `"Transcribing"`
for the `processing` state now calls this instead, keyed off the active
source's `kind`. `"Ready"`/`"Uploading"`/`"Failed"` stay kind-generic
copy — none of the three implied an audio-specific meaning the way
"Transcribing" did.

**Source cards and pills.** `SourceLibrary`'s `KIND_LABEL` gains
`document: "PDF"`; a document card shows `page_count` ("12 pages") where an
audio card shows `formatDuration`; `interview_date` doesn't render for a
document row at all rather than showing a blank/undefined date. The type
filter chip row (§7.2, "close to inert with one source kind") becomes
real: Audio / PDF, filtering the already-loaded rows client-side exactly as
the existing title filter does. `SourcePillRow` (`[id]/source-pill-row.tsx`)
gains a small kind badge/icon per pill so a multi-source project's pill row
is scannable at a glance without opening each one.

**Multi-source aggregate status is unaffected in logic** —
`computeAggregateProjectStatus()` already reduces by worst-case severity
across whatever statuses it's given, with no kind-awareness in its
comparison; a project with one failed PDF and one ready interview already
correctly shows `failed` overall today's logic, unchanged. What's new is
that the per-pill status dot's *label* (via `processingLabel` above) is now
honest about which kind is doing what, so "the aggregate shows failed, but
which one, and doing what?" is answerable by looking at the pills instead
of assuming everything is a transcript.

### 8.10 Source picker and multi-source workspace

`listAttachableSources()`/`AttachSourceModal` (`[id]/attach-source-modal.tsx`,
`[id]/source-actions.ts`) already list every source the caller can see,
generic over `kind` — no logic change needed, only the same kind badge
`SourceLibrary` gains, reused in the picker's list rows so a reporter
attaching a source to a project can tell PDFs from recordings before
clicking one. Attaching a document source to a project, switching a
project's active pill to it, and creating an excerpt while it's active all
already route through the same source-id-parameterized functions §7.3
built (`attachSourceToProject`, `listExcerptsForSource`, the `?source=`
query param) — none of that plumbing is kind-aware today and none of it
needs to become so; kind-awareness lives entirely at the two points that
actually differ (which workspace body to render, §8.5; what copy to show,
§8.9).

### 8.11 Future annotation (not built)

Noted per the brief, briefly and deliberately not designed further:
structured annotation of a document (highlighting entities, tagging
clauses, whatever a later analysis phase wants) is architecturally just
another developer-authored transformation whose input is a `document_text`
representation and whose output would be another representation (or a new
representation kind) referencing it via `parent_representation_id` — the
same shape §2 already established for OCR → translate. The only thing this
phase needs to guarantee for that to be possible later is durable,
stable identifiers on the input side, which `sw_document_blocks.id` and
`sw_document_pages.id` already are (never reused across a reprocess — a
retry generates fresh rows, per §8.6/§8.7's delete-then-insert). No
annotation table, UI, schema, or review workflow exists or is implied by
anything above.

### 8.12 Capability layer

No new capability is added in this phase. `sourcework.project.search`
(Phase B) remains Sourcework's only registered capability; nothing in
Phase 3b gives another tool a reason to programmatically trigger document
processing or read document text the way Audience Listening's handoff
needed `startTranscriptionForProject` — document processing here is
UI-triggered only, the same as transcription retry has never had a
capability entry either. Revisit if a concrete cross-tool need for this
shows up; adding one later is additive (one more `defineCapability()` call
against `lib/transcription/document-ingest.ts`'s functions), not a
redesign.

### 8.13 What was and wasn't exercised against a live provider

This repo has no Mistral account, mirroring the Daily/AssemblyAI-adjacent
situation already documented for Remote Interview (CLAUDE.md, Phase 4
slice 3). Everything in `providers/mistral-ocr.ts` beyond the pure
`mapMistralResponseToDocument()` mapping function (tested against
constructed fixture payloads shaped like the SDK's published examples) is
**unverified against a live call** — the request actually reaching Mistral,
authentication, real timing behavior, and the exact field-level shape of a
production response for a genuinely difficult scan (handwriting, heavy
rotation, dense tables) are all unconfirmed. The schema itself is not
hypothetical: both migrations (§8.4/§8.6/§8.7/§8.8's tables and the
`tw_search()` rewrite) were applied to both hosted Supabase projects
(`wuwf-tools-portal-preview` then `wuwf-tools-portal`, per this repo's
migration workflow) and diffed field-by-field against a live
`generate_typescript_types` pull, not just written and assumed correct. The
native-extraction path was exercised directly against a real (small,
synthetic) PDF, including the actual `pdfjs-dist` Node text-extraction call
this design depends on — not just its pure downstream logic.
`isNativeTextAdequate()`'s thresholds, `buildDocumentChunks()`, the
locator/provenance logic, and the status/copy generalization are all pure
logic exercised directly by tests. The `after()`-based execution
model's actual behavior under a hard platform-level kill mid-processing
(§8.6's stated risk) is inherently not something a sandboxed session can
provoke and observe; `isStaleProcessingRun()`'s recovery path is unit
tested but not exercised against a real stuck invocation.

### 8.14 Explicitly out of scope for Phase 3b

Translation; handwriting-specific escalation; a general vision-model
fallback; sensitive-document routing; self-hosted OCR; document
annotations (§8.11); automatic transform planning or a declarative
pipeline graph (§2 stays unchanged); automatic conversion of extracted
content into research data points (Phase 4); table-to-spreadsheet
workflows; detailed human correction of OCR at the individual block level
(§8.7's stated tradeoff); broad image/chart interpretation; Phase 4/5/6
work of any kind.

## 9. Phase 4 design — Research questions and data points (designed, not started)

Status: **designed 2026-08-16, not yet built.** Not reviewed with the
product owner the way §7.4's open questions were before Phase 3a's build —
treat §9.9 below as genuinely open until someone signs off on it, not as a
formality. Grounded in what Phases 1–3b actually shipped (read §7 and §8
first) and in §5's one-paragraph scope for this phase: `sw_source_excerpts`
gains company — research questions, data points, and a many-to-many join
between the two.

### 9.1 What this phase is, and isn't

A reporter working a project can now write down what they're actually
trying to find out (a short ordered list of research questions, scoped to
one project — CAQDAS prior art calls this a "research question," Phase 5's
own open question about whether a *theme* can span multiple projects
already confirms research questions are project-scoped, not tool-wide), and
record a finding — the reporter's own articulated claim, grounded by one or
more excerpts as evidence — as a data point. A data point can answer one of
the project's research questions, or none (an interesting finding that
doesn't fit the fixed list is still worth keeping, the same "emergent"
category CAQDAS tools distinguish from the fixed "codebook").

This is a **collection** phase, not a **synthesis** phase. It does not
attempt: grouping data points into themes or meta-themes, any notion of
"saturation," memos, or synthesis writing — that's Phase 5, explicitly
deferred to its own design doc per §5, informed by real CAQDAS prior art
this phase deliberately doesn't reach for yet. It also does not attempt
automatic extraction — turning a passage a reporter is looking at into a
suggested data point via an LLM call is a real, plausible future feature,
but nothing today generates a data point except a reporter typing one;
§8.14 already named this as out of scope for 3b and it stays out of scope
here too, for the same "no concrete need yet" reasoning §7.2's alignment
hover and 3a's other deferrals used.

**Why this is the phase that pays off Phase 3a's multi-source project
model.** §1's original motivation was a source mattering to more than one
project; Phase 3a's payoff was the reverse direction, a project referencing
more than one source. Phase 4 is the first place that actually matters
product-wise: a data point can be grounded by excerpts from *different*
sources attached to the same project — "both the interview and the
document corroborate X" is a single finding with two pieces of evidence,
each traceable back to where it came from. Nothing before this phase gave a
reporter a place to say that.

### 9.2 Data model: three new tables

```sql
sw_research_questions
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  prompt text not null
  position integer not null
  active boolean not null default true
  created_by uuid references profiles(id) on delete set null
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
  unique (project_id, position)

sw_data_points
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  research_question_id uuid references sw_research_questions on delete set null
  summary text not null
  created_by uuid references profiles(id) on delete set null
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
  search tsvector generated always as (to_tsvector('english', summary)) stored
  embedding extensions.vector(1536)
  embedding_stale boolean not null default true

sw_data_point_excerpts
  data_point_id uuid not null references sw_data_points on delete cascade
  excerpt_id uuid not null references sw_source_excerpts on delete cascade
  added_at timestamptz not null default now()
  added_by uuid references profiles(id) on delete set null
  primary key (data_point_id, excerpt_id)
```

Notes on the choices:

- **`research_question_id` is a single nullable FK, not a join table.**
  §2's "provenance chains are many-to-many, once analysis exists" is about
  excerpts→data points and (Phase 5) data points→themes — it was never a
  claim about questions→data points, and §5's own phrasing names exactly
  one join table for this phase (`sw_data_point_excerpts`). A data point
  answering more than one research question at once is a real but rarer
  case than "which passages support this finding," and nothing in this
  phase's brief asks for it — a nullable FK is the smaller, honest model,
  revisit only if a real need for a many-to-many surfaces.
- **`sw_research_questions` follows the deactivate-don't-delete precedent**
  `log_content_items`/`ep_criteria` already established for configuration
  rows other tables can reference (CLAUDE.md, "Log: content library field
  trim" and earlier entries) — an `active` flag, no delete grant. A data
  point can reference a since-deactivated question without the reference
  ever dangling, and a stale question just stops showing up in the create
  form's picker.
- **`sw_data_points` and `sw_data_point_excerpts` are freely deletable**,
  matching `sw_source_excerpts`' own grant (`select, insert, update, delete`
  since the `tw_clips` migration) and `sw_project_sources`' attach/detach
  shape — a data point is closer in kind to an excerpt (a reporter's own
  editorial artifact, wrong or superseded ones just get removed) than to a
  tool's shared configuration.
- **No `on delete cascade` from `sw_source_excerpts` into
  `sw_data_point_excerpts` losing the whole data point** — deleting one
  piece of evidence (`clip-actions.ts`'s existing `deleteClip`) only removes
  that join row; the data point and its other evidence, if any, survive.
  Matches `sw_project_sources`' own "detaching a source doesn't delete the
  project" shape.
- **`search`/`embedding`/`embedding_stale` on `sw_data_points` mirror
  `sw_source_excerpts` exactly** (§8.8's "everything OPENAI_API_KEY-optional
  stays optional" applies unchanged) — see §9.7. `sw_research_questions`
  gets neither: a project's question list is short and browsed directly, the
  same reason `ep_criteria`/`ep_form_fields` have no search of their own.
- **No document-vs-temporal branching anywhere in this phase.**
  `sw_data_point_excerpts.excerpt_id` references `sw_source_excerpts`
  generically, regardless of `locator_kind` — a data point can be grounded
  by a transcript clip and a PDF excerpt in the same list with no
  kind-specific code, the same "generalization falls out for free" §8.7's
  closing paragraph already noted for the search index. This phase sits one
  level above source-kind concerns entirely.
- **`updated_at` triggers on both new base tables**, reusing the existing
  generic `set_updated_at()` function the way every other `sw_`/`tw_` table
  does (see `sw_source_excerpts`' renamed trigger for the pattern) —
  `sw_data_point_excerpts` needs none, it has no mutable columns.
- **An `embedding_stale`-flagging trigger on `sw_data_points`**, mirroring
  `sw_flag_source_excerpt_embedding()`: `before update of summary`, sets
  `embedding_stale := true` when `summary` actually changed. Insert needs no
  trigger — the column default is already `true`.

### 9.3 What a data point is, and isn't, relative to an excerpt

Worth stating plainly, since the two are easy to blur: an **excerpt** is a
quoted or extracted passage, unedited, tied to one source at one location —
what someone said, or what a document says, verbatim. A **data point** is
the reporter's own articulated claim or finding, in the reporter's own
words, that one or more excerpts support. "She said the bridge inspection
was delayed twice" (an excerpt, verbatim) versus "The county missed both of
its own inspection deadlines" (a data point, the reporter's synthesis,
grounded by that excerpt and maybe a second one from a records document).
`sw_data_points.summary` is a single text field, not a title-plus-body pair
like an excerpt's `title`/`excerpt_text` — a data point states one claim,
it doesn't need the two-part "what to call this clip" / "what it says"
shape an excerpt does.

**A data point may exist with zero excerpts.** Requiring at least one at
creation would force a reporter to have already found their evidence before
writing down what they're looking for, which is backwards for a lot of real
research work (jot the claim, go find what supports it). The Research tab
shows an "Add evidence" prompt on an ungrounded data point rather than
blocking its creation — advisory, never a hard constraint, the same posture
Underwriting's competitive-adjacency check and Log's submission-readiness
review both take (CLAUDE.md: "never a block," "a checkpoint, not a lock").

**Scope is one project, not the whole tool — deliberately asymmetric with
Phase 5's themes.** An excerpt picker for a data point only offers excerpts
from sources *currently* attached to that data point's own project —
reusing `listLibraryClips(projectId)` unchanged, which already scopes to a
project's attached sources (§7.3). `docs/sourcework-analysis-design.md` §2
resolves themes the other way — not project-scoped at all, since a theme's
whole purpose can be connecting data points across projects. That's not an
inconsistency between the two phases: a data point's own evidence is
naturally grounded in the one story it was written for, while a theme's job
is to notice patterns *across* stories. Each table is scoped to match what
it actually represents, not to match the other.

**A source detached from the project after grounding a data point stays
grounding it.** `removeSourceFromProject` (§7.3) already lets a reporter
detach a source without deleting it or its excerpts. If a data point was
already grounded by that source's excerpt, the join row is left alone — the
finding doesn't retroactively lose its evidence because the source's
*attachment* status changed later. This is the same accepted, narrow drift
§8.7 already accepted for a reprocessed document's stale `block_id`: real,
worth naming, not worth building reconciliation machinery for in this
phase. A detached source's excerpts simply stop appearing in the *picker*
for new attachments, same as any other source no longer in scope.

### 9.4 RLS

Same collaborative sub-resource model every `sw_`/`tw_` table already uses
— no new elevated role, matching how ordinary excerpt/clip creation has
never needed one:

```sql
create policy sw_research_questions_select on public.sw_research_questions
  for select to authenticated
  using (private.has_transcription_access(auth.uid()));
create policy sw_research_questions_insert on public.sw_research_questions
  for insert to authenticated
  with check (private.has_transcription_access(auth.uid()));
create policy sw_research_questions_update on public.sw_research_questions
  for update to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
grant select, insert, update on public.sw_research_questions to authenticated;
-- no delete grant — deactivate via `active`, matching log_content_items.

create policy sw_data_points_member_all on public.sw_data_points
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
grant select, insert, update, delete on public.sw_data_points to authenticated;

create policy sw_data_point_excerpts_member_all on public.sw_data_point_excerpts
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
grant select, insert, update, delete on public.sw_data_point_excerpts to authenticated;
```

No new predicate in the `private` schema — `private.has_transcription_access`
already exists and already means "a member of this tool," which is exactly
the boundary every table here needs.

### 9.5 Screen: the Research tab

A new route, `/sourcework/[id]/research`, linked from a "Research" button
in the project header (alongside the existing `ProjectActionsMenu`) —
**a separate page, not a query-param tab inside the existing project
page.** The existing page is source-centric (`SourceCardGrid`, a pill row,
one active source's workspace body); research questions and data points are
project-wide, not source-scoped, so there's no single active source for
them to sit alongside. `/sourcework/sources/[id]` already established the
precedent of a dedicated route for a concern that doesn't fit the
pill-and-active-source shape.

Two sections on one page, both `requireToolAccess("transcription")`-gated
like every other Sourcework route:

**Research questions** — an ordered list (`ReorderButtons`,
`components/editorial/reorder-buttons.tsx`, reused as-is — this is exactly
the "plain up/down button" ordered-list pattern the settings screens
already use, not a new component), each row: the prompt text, an inline
edit form, a deactivate toggle (no delete button, per §9.2), and — once
Phase 5 exists — an **"Answered by: `<theme title>`, `<theme title>`"**
line (or "Not yet answered" when the list is empty), each name linking into
`docs/sourcework-analysis-design.md`'s theme detail route.
This is the one line this whole phase is really building toward
(`docs/sourcework-analysis-design.md` §1's "actual deliverable" framing:
data points and themes are the process, a research question's list of
answering meta-themes is the point) — a reporter should be able to look at
this list alone and see which questions are settled and which are still
open, without opening a single theme. Powered by a Phase-5-side read
(`listThemesAnsweringQuestions`, see that doc's §5/§6) — nothing about this
list's own query changes; it's an additional prop threaded in from a second
data source. Before Phase 5 ships, this line is simply absent. An "Add a
research question" form appends at the end. Deactivated questions collapse
into a "Show deactivated" disclosure below the active list, matching the
usual "don't clutter the primary list with retired rows" convention.

**Data points** — a card per data point: the summary text, a small "Answers:
`<question prompt>`" line when `research_question_id` is set (nothing shown
when it's null — not "No question," which would read as an error state for
what's actually a normal, expected case), and its grounding excerpts listed
underneath, each as a small chip linking back to
`/sourcework/[id]?source=<sourceId>&t=<startMs>` (temporal) or
`&page=<pageNumber>` (document) — reopening the source at the right place,
the same deep-link shape §8.7 already established for document excerpts. A
data point with no excerpts shows the "Add evidence" prompt from §9.3
instead of an empty list. "+ Attach an excerpt" opens a picker scoped to
`listLibraryClips(projectId)` (§9.3), excluding excerpts already attached
to *this* data point; each attached excerpt gets its own small remove
control. "+ New data point" is a plain form: summary text, an optional
research-question `<select>` (active questions only), submitted with no
excerpts yet — evidence gets attached afterward from the card, per §9.3's
"may exist with zero excerpts" call.

No word-level selection UI, no drag-and-drop, no kanban board — this is a
list of cards with plain forms, matching the "reorder buttons over DnD
absent a concrete need" precedent (CLAUDE.md's Academic Partnerships
entry) and Editorial Planning's own settings screens.

### 9.6 Server-side work

New `[id]/research-actions.ts`, alongside the existing
`[id]/clip-actions.ts`/`[id]/source-actions.ts` per-project-workspace
pattern, all asserting `requireToolAccess("transcription")` first and using
`failIfError`/`failWith` for the `?error=` bounce-back convention:

- `createResearchQuestion(projectId, prompt)` / `updateResearchQuestion(id,
  prompt)` / `setResearchQuestionActive(id, active)` /
  `reorderResearchQuestion(id, direction)` — the last following the exact
  swap-adjacent-`position` pattern `editorial/settings/actions.ts` already
  uses three times (rubric, criteria, pillars): find the row's index in the
  active-and-ordered list, swap with its neighbor, rewrite every row whose
  position actually changed.
- `createDataPoint(projectId, summary, researchQuestionId?)` /
  `updateDataPointSummary(id, summary)` / `setDataPointResearchQuestion(id,
  researchQuestionId | null)` / `deleteDataPoint(id)`.
- `attachExcerptToDataPoint(dataPointId, excerptId)` /
  `detachExcerptFromDataPoint(dataPointId, excerptId)` — plain inserts/
  deletes into `sw_data_point_excerpts`, no new RPC needed (unlike, say,
  Log/Underwriting's cross-tool boundary functions, this join is entirely
  within one tool's own RLS).
- Reads live in `lib/transcription/research.ts` (new, alongside
  `projects.ts`/`clips.ts`): `listResearchQuestions(projectId)`,
  `listDataPoints(projectId)` (joins in each data point's attached excerpts
  and their source/location info for the chip links, flat queries per the
  existing "PostgREST embedding doesn't type reliably" convention
  `listLibraryClips` already follows).
- No new capability in `lib/transcription/capabilities.ts` — see §9.8.

Edits to `summary` flow through `embedPendingDataPoints` (§9.7) the same
way clip edits already call `embedPendingForProject` — best-effort, never
blocking the write.

### 9.7 Search and embedding generalization

**A data point is project-scoped, not source-scoped — `embedPending`
(`lib/transcription/indexing.ts`) can't cover it as written.** Every
existing embedding pass in this module is keyed by `sourceId` (chunks via
their representation's source, excerpts via `source_id` directly);
`sw_data_points.project_id` is the only thing a data point actually has,
and, per §9.3, its evidence can legitimately span more than one of a
project's sources. Rather than force a project-scoped concept through a
source-scoped function, this phase adds a parallel, project-keyed pass:

```ts
// lib/transcription/indexing.ts
export async function embedPendingDataPoints(
  supabase: Client,
  projectId: string,
): Promise<{ embedded: number; embeddingError?: string }>
```

Same shape as `embedPending` (stale-flag-driven, `MAX_EMBEDS_PER_PASS`
capped, swallows its own errors, embeds against `buildClipEmbeddingInput`-
style project-context-prefixed input — reusing that function directly,
since a data point's summary wants the identical "project title/date/
description" heading a clip's excerpt text already gets), called from
`research-actions.ts` after a summary edit, keyed on `project_id` instead
of resolving a primary source the way `embedPendingForProject` does. No
existing caller needs to change — this is additive, not a rework of the
source-scoped path chunks and excerpts still use.

**`tw_search` gains a fifth hit kind, `'data_point'`** (alongside the
existing `transcript`/`document`/`clip`/`project` — its seventh revision in
this migration lineage: `20260731181000_sourcework_documents_search.sql`
and `20260803130000_tw_search_scoping.sql`'s own comments count five and
six, per the precedent §8.8's revision count already named). Simpler than
the excerpt case: a data point already carries
`project_id` directly, so there's no lateral "which project references this
source" resolution to do — join straight to `tw_projects`. No
`start_ms`/`page_number` to populate (a data point has no single location;
its evidence chips already carry their own). `snippet` is the summary text
itself.

`SearchResultKind` gains `'data_point'`; `SearchResult` needs no new field.
`KIND_BADGE` gains `data_point: { label: "Data point", variant:
"informative" }`; `resultHref()` for a data point kind points at
`/sourcework/[projectId]/research#data-point-[id]` (an anchor into §9.5's
list — no query param needed since the Research tab isn't itself
source-scoped).

**Research questions are not indexed.** A project's question list is short
and browsed directly on its own tab, the same reasoning §9.2 already gave
for leaving `search`/`embedding` off that table entirely — nothing here
needs a fifth-and-sixth hit kind, just a fifth.

### 9.8 Capability layer

No new capability. Mirrors §8.12's reasoning exactly: nothing outside this
tool has a concrete reason today to programmatically create a research
question or a data point, the way Audience Listening's handoff needed
`startTranscriptionForProject`. `sourcework.project.search` stays this
tool's only registered capability until a real cross-tool need for one of
these appears — adding one later is additive, not a redesign, per the same
closing note §8.12 already makes.

### 9.9 Open questions — genuinely unresolved, needs review before implementation

Unlike §7.4 (resolved with the product owner before Phase 3a was built),
this phase has not been through that round trip yet. These are this
design's own best answers, not confirmed ones:

1. **Should a data point be able to answer more than one research
   question?** §9.2 chose a single nullable FK on the reasoning that
   nothing in this phase's brief asks for many-to-many here. Worth
   confirming against a real multi-question project before building, since
   changing this later means a real migration (FK column → join table), not
   a config flip.
2. **Does deleting a research question need a confirmation step**, the way
   deleting an Academic Partnerships submission does, or is deactivate-
   don't-delete (no delete path at all) enough on its own? This design
   assumes the latter is sufficient since nothing is ever actually lost —
   worth a second look once someone's used the screen.
3. **Is an "Add evidence" nudge on an ungrounded data point enough, or
   should the project's aggregate status/badge reflect ungrounded data
   points the way it already reflects source processing failures?** This
   design deliberately kept it advisory-only (§9.3) but a reporter finishing
   a project with several ungrounded claims might want a stronger signal.
4. **Should the excerpt picker surface which *other* data points an excerpt
   is already attached to**, so a reporter can see at a glance that a
   passage is already grounding a different finding? Not designed here —
   a real but secondary need, easy to add to `listLibraryClips`'s existing
   read without a schema change if it turns out to matter.
