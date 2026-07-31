# Sourcework — Design and Phased Plan

Status: **Phases 1–2 shipped. Phases 3–6 are a roadmap, not a spec** — each needs
its own design doc (this one included) reviewed before implementation starts,
the same way Remote Interview and Audience Listening each got one.

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

**Phase 3 (not started — needs its own design doc)** — new source kind
`document` (PDF), an OCR pipeline, a translation pipeline operating on any
text-kind representation, and the "reference an existing source" / browse-
sources UI that makes the many-to-many shape from Phase 1 actually reachable.
OCR/translation vendor choice is unpicked — research and choose deliberately,
the same way AssemblyAI and Daily were chosen elsewhere in this repo, don't
assume one.

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
