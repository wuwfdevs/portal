# Sourcework Analysis — Design and Phased Plan

Status: **design only, nothing built.** This is the document
`docs/sourcework-design.md` §5 requires before Phases 4 and 5 (research
questions and data points; themes). It also scopes two things that doc did not:
background context gathering and deliverable generation. Read that doc's §2–§3
first; this one builds on its Source / Representation / Excerpt model and does
not restate it.

Written 2026-10-09 from a product conversation and a research pass over
comparable tools and methods (§9). Most of the research was read through search
snippets and background knowledge, not full texts, because several sites were
unreachable from the research sandbox; §9 says which claims are verified.

## 1. What this is, and isn't

A reporter working on a project that holds several interviews wants to:

1. say what they are trying to learn (**research questions**);
2. have the tool pull together background that fills the model's gaps;
3. get, for each source, the **data points** that bear on those questions and on
   the story;
4. see, across sources, what **themes** are forming, as sources keep arriving;
5. get a short list of the best **excerpts** (actualities) for those themes;
6. optionally turn it into a **deliverable** (a script, a voicer, a wrap) from a
   template.

Every output of the model is a **suggestion** until a person accepts it. The
reporter is the interpreter; the tool proposes.

Not in scope: cross-project themes (themes are project-scoped); a coding tool in
the QDA sense (hand-applied codebooks, inter-coder agreement); community
sensemaking workshops, voting, or any public surface; unattended processing
(there is still no job queue, so every run is a click); a pipeline planner or
plugin framework for analysis steps (see `sourcework-design.md` §2: developer-
authored steps invoked in sequence).

## 2. Principles

These are the rules the research converged on. They decide the details below.

1. **Everything the model produces is a suggestion with a status**
   (`suggested` / `accepted` / `rejected`). Reject hides; it never deletes.
   Accepted items are pinned and later runs never alter them.
2. **A data point is a paraphrase; an excerpt is a literal cut.** They serve
   different purposes and are chosen by different criteria (§5.3, §5.5).
3. **The model never types out source text.** Where the model points at source
   material it returns segment/word ranges (or page and block ids), and code
   derives the text and timestamps. This is a data-shape choice, not a
   verification layer; fidelity checking is left to a self-review instruction in
   the prompt (§5.3) and to the reporter listening before accepting an excerpt.
   The transcript is itself ASR output, so matching the transcript proves the
   model did not alter it, not that the speaker said it. Playback in the review
   UI is the real check.
4. **Themes are stable entities.** New data points are assigned to existing
   themes. New, split, and merged themes are proposed by an explicit run and
   reviewed. Labels never change silently.
5. **Rank by breadth, not repetition.** A theme's strength is how many distinct
   speakers and sources support it, shown beside the data points that complicate
   it. One source is a flag, not a verdict.
6. **Editors own wording; code owns structure.** Prompts and templates are
   editable language over a fixed output schema and fixed variables (§6).
7. **Keep each step small and re-runnable.** A run is keyed to its inputs and
   prompt version, and re-running never destroys accepted or edited work.

## 3. The pipeline

```
 research questions ─┐
                     ├─► 1 Context ─► 2 Extract ─► 3 Themes ─► 4 Quotes ─► 5 Deliverable
 sources + transcripts┘     (per        (per         (per         (per         (per
                          project)    source)      project)     theme)     template)
```

Each arrow is a button, not a background job. Steps 1–2 run when a source is
ready; 3 runs when the reporter asks to review themes; 4 and 5 are on demand.

## 4. Data model

All tables use the `sw_` prefix and project-level RLS in the same shape as
`sw_project_sources` (any tool member, `private.has_tool_access` for the
`transcription` key). Column lists are a sketch for the build phase, not a
migration.

```
 tw_projects ──1─<── sw_research_questions
     │
     ├──1─<── sw_context_notes            (web background; one table, no types)
     │
     ├──>─<── sw_sources ──1─< sw_representations ──(transcript segments / document blocks)
     │             │
     │             └──1─< sw_source_excerpts   (exists; gains origin + review_status)
     │                          ▲
     │                          │ >─< sw_data_point_excerpts  ("exemplifies")
     │                          │
     ├──1─<── sw_data_points ──1─< sw_data_point_spans   (1..n evidence spans)
     │             │
     │             └──>─< sw_themes   via sw_data_point_themes (stance)
     │
     ├──1─<── sw_themes
     ├──1─<── sw_deliverables ──> sw_deliverable_template_versions
     └── sw_analysis_runs (audit of every model call: kind, prompt version, counts)

 sw_prompt_versions   (editor-managed language per prompt slot, immutable versions)
 sw_deliverable_templates / _versions
```

### 4.1 `sw_research_questions`

`id, project_id, position, question text, created_by, archived_at`. Ordered, text
only. Archiving hides a question without orphaning its data points.

### 4.2 `sw_context_notes`

Background the model gathered, shown in a collapsed **Background** list on the
project, never in the way. `id, project_id, title, summary, url, retrieved_at,
status ('active' | 'dismissed'), created_by`. Rules:

- Gathered automatically (§5.1); no approval step.
- Background only. It primes extraction and may be cited in a *deliverable's
  internal notes*, but is never quotable and never an excerpt.
- A reporter can dismiss a note. Dismissed notes are not sent to later runs.
- Deliberately not stored in `sw_sources`: that table is immutable original
  media that everything else cites.

### 4.3 `sw_data_points`

`id, project_id, source_id, representation_id, question_id (nullable),
relevance ('question' | 'story'), story_element (nullable: 'character' |
'place' | 'moment' | 'detail' | 'background'), claim text, ai_claim text
(original, kept when a person edits `claim`), speaker_id (nullable →
`tw_speakers`), kind ('firsthand' | 'secondhand' | 'opinion' | 'factual'),
status, prompt_version_id, run_id, embedding, embedding_stale, created_at`.

- `claim` is a short paraphrase that preserves precision: names, places, numbers,
  dates, qualifiers and hedges ("as a kid, he thinks, around 1960"). It is not a
  topic label.
- `relevance = 'question'` requires `question_id`; `'story'` requires
  `story_element`. One passage that answers two questions becomes two data
  points; this is rare and avoids a join table.
- One row per claim, not two (no separate suggestion/response rows). A person
  editing a claim keeps the original in `ai_claim`; accepting sets `status`.
- `kind` separates what someone lived from what they heard or think. Memories
  are reconstructed, so they are tagged, not "fact-checked".

### 4.4 `sw_data_point_spans`

`id, data_point_id, position, locator_kind ('temporal' | 'document'),
start_ms, end_ms (temporal), page_number, first_block_id, last_block_id
(document)`. A data point has **one or more** spans, since a memory is often built
up across two passages. Mirrors the typed-locator shape of
`sw_source_excerpts` / `sw_excerpt_document_locations`, including its
exactly-one-locator-shape check. The model returns segment (or block) ranges;
code writes the timestamps and can re-derive the text on demand.

### 4.5 `sw_themes` and `sw_data_point_themes`

`sw_themes`: `id, project_id, title, definition (one sentence, claim-style),
memo (human-only, never touched by a run), status ('suggested' | 'accepted' |
'rejected'), parent_theme_id (nullable; meta-themes later, no separate type),
color, embedding, accepted_by, accepted_at, created_at`.

`sw_data_point_themes`: `data_point_id, theme_id, stance ('supports' |
'complicates'), assigned_by ('model' | 'person'), run_id`. A data point can sit
in several themes.

A theme's definition must be a statement ("Locals treat the fort's tunnels as a
private playground"), not a topic ("Childhood"). The prompt requires it and the
list view flags a suggestion that reads as a bucket.

Per-theme numbers are **computed**, never stored: distinct sources, distinct
speakers, supporting vs. complicating counts, and "single source" when only one
source backs it. Reads go through a security-invoker view or query, the way
`sw_project_overview` does.

### 4.6 Excerpts: two additions to `sw_source_excerpts`

`origin ('manual' | 'suggested')` and `review_status ('suggested' | 'accepted' |
'rejected')` (default `accepted`, so every existing excerpt is unchanged),
plus `suggestion_reason text` and `quality_tier smallint` for suggested rows.
`sw_data_point_excerpts (data_point_id, excerpt_id)` records "this excerpt
exemplifies that data point". A theme's representative quotes are *derived*: the
accepted excerpts linked to that theme's data points. There is no theme-to-
excerpt table.

Excerpts stay source-level, as today, so a quote can surface in any project that
references the source.

### 4.7 Prompts, templates, deliverables

- `sw_prompt_versions`: `id, slot, version, body, created_by, created_at,
  note`. Insert-only. `sw_prompt_live (slot, version_id)` is the movable pointer;
  rollback is moving it. Slots are defined in code (§6).
- `sw_deliverable_templates` / `sw_deliverable_template_versions`: a template
  has a name and kind (`script`, `voicer`, `wrap`, `cut_and_copy`, …) and
  immutable versions holding the section structure and style language (§5.6).
- `sw_deliverables`: `id, project_id, template_version_id, title, body jsonb,
  status, created_by`. `body` is an ordered list of
  `{ type: 'narration', text }` and `{ type: 'actuality', excerpt_id }` blocks,
  so an actuality is always a real excerpt, never retyped text.
- `sw_analysis_runs`: one row per model run, in the spirit of
  `sw_document_processing_runs` (an audit log, not a queue):
  `id, kind, project_id, source_id, prompt_version_id, model, status, counts,
  error, started_at, finished_at`.

## 5. The steps

### 5.1 Context (per project, automatic and quiet)

When the first source of a project reaches a transcript, and when research
questions change, one call with web search enabled gathers background on the
people, places, events and terms the questions and sources mention (the Fort
Barrancas / advanced redoubt case). Results become `sw_context_notes`.

- **No approval step and no modal.** The Background list on the project shows
  what was found; dismissing a note is the only control.
- Notes are passed to extraction as reference, labelled as unverified web
  material, so the model can read "the redoubt" correctly. They are never
  evidence.
- Names found here can also be offered as ASR custom vocabulary for later
  sources (a possible follow-up, not part of this phase).
- Privacy: a search query can include names a source asked to keep confidential.
  The prompt instructs the model to query on places, events and public figures
  and to omit interviewee names; the run row records the queries.

### 5.2 Extract (per source, on a click, batchable)

Input: the source's transcript (or document text) in segments, the research
questions, active context notes, and the **extraction guide** (§6). Output, per
data point: the claim, `relevance` and `question_id` / `story_element`, the
speaker, `kind`, and the span ranges.

What qualifies:

- **Responsive** — bears on a research question.
- **Story** — outside the questions but a producer would want it. The fixed set:
  *character* (who they are, how they talk), *place*, *moment* (a scene or
  turning point), *detail* (a concrete or sensory specific), *background*
  (history or context). The tunnel between the fort and the redoubt, remembered
  from childhood, is a place and a moment with no question needed.

The guide defines each category in plain language ("a place counts when the
speaker gives it a specific, vivid description, not just a name"). Editors tune
that wording; the set of categories stays in code so filters and screens can
rely on it.

Instructions in the prompt: preserve precision and hedging; return ranges, never
text; before answering, check each claim against its spans and drop or correct
any that overstate them. Long transcripts are chunked with the existing
`tw_chunks` windows and de-duplicated by overlapping spans.

Re-running a source replaces its `suggested` data points and leaves `accepted`,
`rejected`, and edited ones alone.

### 5.3 Review data points

A source's data points appear in its workspace (a new tab or rail alongside
excerpts), each with its spans highlighted in the transcript and playable. Accept,
edit the claim, or reject. Suggested rows look visibly different from accepted
ones.

### 5.4 Themes (per project)

Two operations, deliberately separate:

**Assignment (automatic after accept, cheap).** For each newly accepted data
point, find the nearest themes by embedding (pgvector, the same optional
`OPENAI_API_KEY` path as the rest of search), then one call confirms assignment
and stance against those themes' definitions, or reports "no fit". No-fit points
wait in a candidate pool.

**Review themes (on a click).** Takes the pool plus the accepted themes'
definitions and proposes new themes, and merge or split suggestions for existing
ones, as `suggested` rows the reporter accepts, edits, or rejects. Accepted
themes are never altered by this run. Splits and merges are suggestions that
describe a change; accepting performs it, and the theme's memo records why.

Why not recluster: incremental clustering tools reshuffle labels between batches,
and a reporter's edits and memos would not survive it. Freeze the set, assign into
it, and propose changes explicitly.

The theme page is the main analysis view: definition, memo, supporting and
complicating data points grouped by source, the breadth numbers from §4.5, and the
representative excerpts. A theme backed by a single source says so.

### 5.5 Quotes (per theme, on a click)

Excerpt selection is driven by what makes a clip work on air, not by what is
responsive. It is a separate step with a separate prompt, the **quote quality
guide** (§6). Example criteria, all editable:

- it sings: concrete, emotionally specific, in the speaker's own voice;
- it stands on its own without setup;
- clean in and out points, no filler, no half-sentence starts;
- a usable length for the format;
- clean audio.

Input: the theme's accepted data points, the transcript around their spans (not
the paraphrase), and ASR confidence and audio flags where the providers supply
them. The best clip may sit next to a span or cover only part of one, so the
model is free to choose ranges anywhere in the neighbourhood. Output per
suggestion: ranges (snapped to word boundaries in code), a one-line **why this
works**, a quality tier, and the data points it exemplifies. These become
`sw_source_excerpts` rows with `origin = 'suggested'`.

Review is one click with the clip playing right there. Accepting turns it into an
ordinary excerpt; rejecting hides it. A reporter can also keep making excerpts by
hand exactly as today.

### 5.6 Deliverables (optional)

A template defines: a name and kind; ordered sections, each `narration` or
`actuality` with guidance and optional count limits; a target duration; the
number of actualities; and style language. A run takes a project's accepted
themes and accepted excerpts (or a subset the reporter picks), the template
version, and project-level direction (angle, audience, sensitivities).

The model writes **narration only**. Actualities are placed by excerpt id, so
quote text and audio always match the source. Length is computed in code from
`lib/log/read-time.ts` (160 words per minute) plus excerpt durations and shown
as "3:42 of 3:30". The deliverable is an editable document of blocks; export in
this phase is copy as text plus the existing excerpt zip export
(`clips.zip`). Nothing is generated from the model's memory of a transcript: the
inputs are only data points and excerpts a person has accepted.

No prior art was found for generating a script or wrap from interview audio, so
this layer is kept deliberately small.

## 6. Prompts and who edits them

Slots (defined in code, each with a fixed output schema and variable list):

| Slot | Editors control | Code controls |
|---|---|---|
| `context` | what background to look for, and how | search tool, note schema |
| `extraction` | what counts as responsive and as each story element; how to phrase precision | output schema, categories, range format |
| `theme_assign` / `theme_review` | how a theme definition should read | schema, stance values, statuses |
| `quote_quality` | the definition of a good actuality | range schema, tiers |
| deliverable templates | sections, length, style | block schema |

Rules, borrowed from prompt-management tools:

- Versions are immutable; "live" is a pointer; rollback is moving it.
- Saving checks that required variables are present and that nothing outside the
  allowed placeholders is referenced.
- A **try it** button runs a draft version on one chosen source and shows the
  result without saving. A small saved example set per slot is a later addition
  (Phase 4), not a launch requirement.
- Each run records the prompt version; the **accept rate per prompt version**
  (accepted ÷ reviewed) is the quality metric.

Access: a `tool_roles` grant carrying `editor` on the `transcription` tool
(the stacking-roles mechanism, `docs/broadcast-roles.md`) edits prompts and
templates. Everyone with tool access can run steps, review, and accept. See §10
for the one open access question.

## 7. Operations and constraints

- **No job queue.** Every step is a click. Extraction across several sources uses
  the existing batch pattern (`useTaskQueue` / `BatchRunPanel`, three at a time).
- **`OPENAI_API_KEY` is required** for this feature; an unset key fails the run
  clearly, as the program-log import does. Embeddings stay optional elsewhere
  and are not made mandatory for existing search.
- **Model**: structured outputs on the model `editorial-inquiry/ai.ts` and the
  program-log importer pin; reasoning mode on, since the self-review of claims
  against spans depends on it.
- **Cost** is bounded by being per-source and on demand; each run row records
  model and counts.
- Interview audio and text go to a third party. That is already true of ASR; the
  design records it so it is not a surprise.

## 8. Phasing

Each phase ships usable value and its own migration, applied through
`APPLIED.md` as usual, with Resources release notes and guides per CLAUDE.md.

| Phase | Ships | Notes |
|---|---|---|
| **A. Questions, context, data points** | Research questions on the project; Background list; extraction run per source; review UI; spans playable in the transcript and PDF viewer | `sw_research_questions`, `sw_context_notes`, `sw_data_points`, `sw_data_point_spans`, `sw_analysis_runs`, `sw_prompt_versions` (extraction + context only), editor role |
| **B. Themes** | Assignment, Review themes, theme page with breadth numbers, memos | `sw_themes`, `sw_data_point_themes`, embeddings |
| **C. Suggested quotes** | Quote selection per theme; suggested excerpts with a why-line; review | `sw_data_point_excerpts`, two excerpt columns, `quote_quality` slot |
| **D. Deliverables** | Templates (editor-managed), generation, length check, copy/export | `sw_deliverable_*` |

Not scheduled: meta-themes (the `parent_theme_id` column exists), cross-project
themes, a keyword-in-context view over all sources (the hybrid search already
exists and can back one), a pairwise "which quote is better" picker, a theme
change log table, member-checking or "shared with source" statuses.

## 9. Prior art and what was taken

Verified items were read in search results or on the project's page; others are
marked as background knowledge. Nothing here was copied verbatim; these are
patterns.

- **Cortico / MIT CCC (Local Voices Network, Fora)** — human-steered
  "sensemaking": AI proposes, people curate, every story ties back to its audio
  (verified at summary level). Taken: curated themes over clips tied to audio;
  AI as first pass.
- **Pol.is** — consensus vs. disagreement across opinion groups (summary
  verified). Taken: rank by breadth of distinct speakers, not repetition.
  Skipped: voting and opinion-group maps.
- **Consider.it** (details unverified) — pro/con lists. Taken: supporting and
  complicating evidence shown side by side.
- **Decidim** (partly verified) — traceability, hide-not-delete moderation.
  Taken: statuses and reject-means-hide. Skipped: spaces, components, permissions.
- **All Our Ideas** — pairwise comparison. Considered for ranking quotes;
  deferred as unnecessary at this scale.
- **QualCoder, Taguette, CATMA** (repositories verified, workflow from background
  knowledge) — coded segments with memos; flat tags with a "theme → its quotes
  grouped by source" view; separating the taxonomy from each person's
  annotations. Taken: the theme page shape and memos.
- **OpenVerbatim** — not found; no claims made. Related tools that log each AI
  suggestion and the researcher's decision were seen only as product pages.
- **Voyant Tools** — not reachable; keyword-in-context noted as a later option.
- **OHMS** (partly verified) — time-indexed oral history entries: a time,
  synopsis, keywords, subjects. Taken: pairing a short synopsis with a time
  locator. Changed: explicit start and end, since OHMS implies the end from the
  next entry.
- **INCEpTION, Argilla** (partly verified) — suggestions shown distinctly from
  accepted annotations; AI value and human response kept apart, with model and
  prompt recorded. Taken: distinct suggested state, rejections persist, prompt
  version on every suggestion. Simplified: one row with `ai_claim`, not two.
- **Omeka S, Doccano** — mostly overkill here. Taken: a small, fixed set of
  descriptive fields; a flat span table.
- **Dovetail, Condens** (vendor material) — AI claims that cite transcript
  moments; timestamp, speaker and recording link on every highlight.
- **TnT-LLM, Clio, BERTopic** — build a taxonomy from a sample, then assign;
  minimum cluster size; incremental refitting reshuffles labels (a documented
  issue). Taken: freeze themes, assign into them, propose changes in explicit
  runs, flag low-support themes.
- **Method literature** — grounded theory's constant comparison (new data
  compared to existing themes), memoing, and saturation; Braun & Clarke's
  distinction between a topic and a theme and their public position against
  generative AI in reflexive analysis; Nelson's computational grounded theory
  (computation proposes, interpretive reading refines, then confirm against the
  whole dataset). Taken: claim-style theme definitions, memos, the reporter as
  interpreter. These were largely read from snippets; verify before citing.
- **Reported LLM failure modes** (preprints and news accounts, snippets only) —
  altered or merged quotes, over-broad themes, fragmented codes, and
  paraphrases presented as quotes in newsroom incidents. These motivate
  principles 3 and 4.

## 10. Open questions

1. **Who may edit an accepted theme's definition?** Recommendation: anyone with
   tool access edits their project's themes; only `editor`s edit prompts and
   templates.
2. **Extraction trigger**: a click per source, or automatically when a
   transcript completes? Recommendation: a click, since there is no queue and
   cost should be a choice. Revisit once the accept rate is known.
3. **Is web context ever citable in a deliverable?** Recommendation: background
   only, per §4.2.
4. **Excerpt scope**: suggested excerpts attach to the source (so they surface in
   any project using it), as all excerpts do today. Confirm this is wanted.
5. **Similarity threshold and candidate count** for assignment are tuned on real
   transcripts, not designed here. Phase B includes a short calibration pass on
   a real project.
6. **ASR confidence and audio-quality inputs** to quote selection depend on what
   the transcription provider returns; Phase C scopes what is actually
   available before promising it.
