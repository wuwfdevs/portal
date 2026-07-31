# Sourcework — Design and Phased Plan

Status: **Phases 1–2 shipped. Phases 3–6 are a roadmap, not a spec** — each needs
its own design doc (this one included) reviewed before implementation starts,
the same way Remote Interview and Audience Listening each got one. **Phase 3
has been split into 3a and 3b** (§5) — 3a (Source Library and a multi-source
Project UI) is designed in §7 below, proposed and awaiting review; 3b
(document source kind, OCR, translation) is still unstarted and unscoped.

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

**Phase 3a (design proposed in §7, awaiting review — not yet authorized to
build)** — the Source Library and Source Detail screens, and the "reference
an existing source" / multi-source Project UI that makes the many-to-many
shape from Phase 1 actually reachable, for the one source kind that exists
today (`audio`). No new source kind, pipeline, or vendor dependency.

**Phase 3b (not started — needs its own design doc)** — new source kind
`document` (PDF), an OCR pipeline, and a translation pipeline operating on
any text-kind representation. OCR/translation vendor choice is unpicked —
research and choose deliberately, the same way AssemblyAI and Daily were
chosen elsewhere in this repo, don't assume one. Once this ships, Phase 3a's
Source Library and representation-chain UI should already have room for it
(see §7's "Representation chain" notes on why it's drawn generically).

**Phase 4 (not started)** — `sw_source_excerpts` gains company: `research_
questions` (project-scoped), `sw_data_points`, `sw_data_point_excerpts` as a
many-to-many join.

**Phase 5 (not started — needs `docs/sourcework-analysis-design.md`)** —
themes, meta-themes, synthesis. Genuinely new product surface, not a
refactor — informed by CAQDAS prior art (NVivo/Atlas.ti/MAXQDA/Dedoose:
codebook vs. emergent coding, memos, saturation). Open question for that doc:
can a theme span multiple `tw_projects` (an entire investigation), or is it
project-scoped like research questions in Phase 4?

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

## 7. Phase 3a design — Source Library and multi-source Project UI (proposed)

Status: **proposed, awaiting review.** Written from four mockup screens
(Source Library, Source Detail, multi-source Project, Research Workspace)
reviewed against this doc and the current implementation on 2026-07-31. The
mockups' Research Workspace screen (data points → themes → synthesis) is
**out of scope here** — that's Phase 4/5, unchanged by this section. This
section covers only the two screens' worth of UI Phase 3a actually needs:
a source-centric library, and a project that can hold more than one source.

This is a design, not an implementation — nothing in this section is
authorized to build until it's been reviewed, per this doc's own governance
(§0/top status line). It's scoped to ship with **zero new source kinds,
pipelines, or vendor dependencies** — everything it needs (`sw_sources`,
`sw_representations`, `sw_project_sources`, `sw_source_excerpts`) already
shipped in Phases 1–2.

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

**Source Library** — a new tab at `/sourcework` (see §7.4), or a new
route; card grid of every `sw_sources` row the caller has tool access to.
Each card: type badge (today, always "Audio"), title, uploaded date,
duration, which representations exist (today, always "Transcript" once
ready), and "Used in N projects" from `sw_project_sources`. Search and a
type filter chip row, matching the existing search bar's affordance at
`/sourcework` — the filter chips are close to inert with one source kind,
but the UI shouldn't have to be rebuilt when Phase 3b adds more.

**Source Detail** (`/sourcework/sources/[id]`, a new route — see open
question in §7.5) — one source, independent of any project:
- Representation chain: today always a fixed three-node shape (Original
  Audio → Transcription + Diarization → Transcript), rendered generically
  (a list of representation rows plus the pipeline that produced each) so
  Phase 3b's OCR/translation chains extend it without a rewrite. No new
  data is needed — `sw_representations` already has `parent_representation_
  id` for exactly this.
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

### 7.3 New server-side work

- `attachSourceToProject(projectId, sourceId)` — insert into
  `sw_project_sources`; needs both project and source tool access (both are
  already the same `transcription` tool access check, so no new RLS
  predicate — just a new insert policy on `sw_project_sources` scoped the
  same way the existing `select` policy is, if one doesn't already allow
  authenticated tool members to insert).
- `listAttachableSources(projectId, query)` — sources the caller can see
  that aren't already attached to `projectId`.
- `getExcerptsForSource(sourceId)` — new read, parallel to the existing
  `listClipsForProject`, for Source Detail's "excerpts here" list.
- `getPrimarySourceForProject`/`getPrimaryProjectIdForSource` in
  `lib/transcription/projects.ts` need to stop assuming singularity. Call
  sites that create/trim/export an excerpt already know which source they're
  acting on from the active pill — they should take `sourceId` explicitly
  rather than asking "the" project's source, so a two-source project doesn't
  silently act on the wrong one.

### 7.4 Open questions (resolve before implementation starts)

1. **Where does Source Library live?** `/sourcework` today has
   "Projects" / "Excerpts" tabs. Does it become "Projects" / "Sources" /
   "Excerpts" (three tabs), or does "Sources" replace "Excerpts" as the
   primary browse surface, since Source Detail already shows a source's
   excerpts inline? The mockup treats the library as the landing screen —
   worth deciding deliberately rather than defaulting to "just add a tab."
2. **Multi-source project status.** `computeProjectStatus()` derives one
   badge (`uploading`/`processing`/`ready`/`failed`) from one source. With
   two+ sources independently progressing, is the project's badge the
   worst-case status across all of them, or does the single project-level
   badge stop making sense in favor of per-source status shown on each pill?
3. **Route shape for Source Detail.** `/sourcework/sources/[id]` (new
   segment) vs. some other shape — needs to not collide with
   `/sourcework/[id]`'s existing project-id semantics or `/sourcework/
   new`.
4. **Any confirmation UX for reusing a source?** Attaching an existing
   source to a second project doesn't touch RLS or data risk (tool access is
   shared and flat), but it does mean two stories now share one source's
   excerpts/transcript edits. Worth a one-line confirmation ("this source is
   already used in *N* other projects") or not worth the friction — a
   product call, not an engineering one.

### 7.5 Explicitly out of scope for Phase 3a

- Any new source kind (document/PDF, image, text) or its upload flow — that
  stays Phase 3b.
- OCR, translation, or any other transformation pipeline.
- The Research Workspace (data points, themes, meta-themes, synthesis) —
  Phase 4/5, needs its own design doc as already scoped in §5.
- The word-level alignment hover demo (§7.2).
