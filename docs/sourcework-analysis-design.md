# Sourcework Analysis — Design and Phased Plan

Status: **design only, nothing built.** This is the document
`docs/sourcework-design.md` §5 requires before Phases 4 and 5 (research
questions and data points; themes). It also scopes two things that doc did not:
background context gathering and piece generation (a finished wrap, voicer or script). Read that doc's §2–§3
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
6. optionally turn it into a **piece** (a script, a voicer, a wrap) from a
   **format**, then edit it by hand or with the assistant.

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
6. **Editors own wording; code owns structure.** Prompts and piece formats are
   editable language over a fixed output schema and fixed variables (§6).
7. **Keep each step small and re-runnable.** A run is keyed to its inputs and
   prompt version, and re-running never destroys accepted or edited work.

## 3. The pipeline

```
 research questions ─┐
                     ├─► 1 Context ─► 2 Extract ─► 3 Themes ─► 4 Quotes ─► 5 Piece
 sources + transcripts┘     (per        (per         (per         (per         (per
                          project)    source)      project)     theme)     format)
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
     ├──1─<── sw_pieces ──> sw_piece_format_versions
     └── sw_analysis_runs (audit of every model call: kind, prompt version, counts)

 sw_prompt_versions   (editor-managed language per prompt slot, immutable versions)
 sw_piece_formats / _versions
```

### 4.1 `sw_research_questions`

`id, project_id, position, question text, created_by, archived_at`. Ordered, text
only. Archiving hides a question without orphaning its data points.

### 4.2 `sw_context_notes`

Background the model gathered, shown in a collapsed **Background** list on the
project, never in the way. `id, project_id, title, summary, url, retrieved_at,
status ('active' | 'dismissed'), created_by`. Rules:

- Gathered automatically (§5.1); no approval step.
- Background only. It primes extraction and may be cited in a *piece's
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

### 4.7 Prompts, formats, pieces

- `sw_prompt_versions`: `id, slot, version, body, created_by, created_at,
  note`. Insert-only. `sw_prompt_live (slot, version_id)` is the movable pointer;
  rollback is moving it. Slots are defined in code (§6).
- `sw_piece_formats` / `sw_piece_format_versions`: a **format** has a name and
  kind (`script`, `voicer`, `wrap`, `cut_and_copy`, …) and immutable versions
  holding the section structure and style language (§5.6).
- `sw_pieces`: `id, project_id, format_version_id, title, status, created_by`,
  with `sw_piece_versions (piece_id, version, body jsonb, saved_by, saved_via
  ('person' | 'assistant' | 'generation'), created_at)`, insert-only. `body` is an
  ordered list of `{ id, type: 'narration', text }` and
  `{ id, type: 'actuality', excerpt_id, in_ms?, out_ms? }` blocks, so an actuality
  is always a real excerpt, never retyped text. Every save, by a person or by the
  assistant, is a new version; undo is restoring one.
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

Reviewing happens in the **source workspace that already exists**, not in a new
screen. The rail beside the transcript gets a switch at its top, **Excerpts |
Data points**, and the choice drives both what the rail lists and which layer the
transcript and the player's mark strip draw. Only one layer shows at a time, so
there is no legend to learn: in Excerpts mode the transcript looks exactly as it
does today (gold underlines); in Data points mode the evidence spans are
underlined in the WUWF lime instead (the app's success palette, distinct from the
gold excerpt marks and the blue playhead), a dashed underline meaning not yet
reviewed.

A data point card shows its claim, its kind and question or story element, its
time ranges, and a play button. An unreviewed card has a dashed border and its
Accept, Edit and Reject buttons; there is no separate "Suggested" pill, because the
buttons already say it (same for suggested quotes and themes). A card links to the excerpt that
exemplifies it, so the two kinds of item stay connected without sharing a view.
The source tab row is unchanged on desktop (Transcript · Projects). On a phone the
existing phone-only tabs gain **Data points** beside Excerpts and Speakers, for
the same reason those are tabs there: the rail does not fit beside the transcript.

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

### 5.6 Pieces (optional)

A **piece** is a finished item made from a project's material: a wrap, a voicer,
a script, a cut-and-copy. A **format** defines: a name and kind; ordered sections,
each `narration` or `actuality` with guidance and optional count limits; a target
duration; the number of actualities; and style language. A run takes a project's
accepted themes and accepted excerpts (or a subset the reporter picks), the format
version, and project-level direction (angle, audience, sensitivities).

The model writes **narration only**. Actualities are placed by excerpt id, so
quote text and audio always match the source. Length is computed in code from
`lib/log/read-time.ts` (160 words per minute) plus excerpt durations and shown
as "0:52 of 1:00, 3s under". Nothing is generated from the model's memory of a
transcript: the inputs are only data points and excerpts a person has accepted.

A piece is **edited directly, as a block editor**. Narration blocks are inline text.
An actuality block's wording is fixed because it is an excerpt, but it can be
swapped, trimmed, moved or removed. Conventions:

- **Insertion points between every block**, before the first and after the last,
  built the way the On Air rundown's `insertion-point.tsx` is: visible at rest (a
  hairline, a circled +, a hairline), not hover-only. It opens a dashed panel with
  two modes, **Narration** and **Excerpt**; Excerpt is a search box over the
  project's accepted excerpts with arrow-key navigation and Enter to add, and
  shows duration and speaker.
- **Enter** at the end of a narration block adds a narration block below;
  **Backspace** in an empty one removes it.
- **Reorder** by dragging the ⋮⋮ handle (desktop), or Move up and Move down in
  the block's ⋮ menu, which also serves keyboard and phone. Every save is a
version (§4.7); History shows who saved it, a person or the assistant, and restores
any version. Export in this phase is copy as text plus the existing excerpt zip
export (`clips.zip`).

No prior art was found for generating a script or wrap from interview audio, so
this layer is kept deliberately small.

### 5.7 Assistant editing

AI help with a piece is the assistant that already exists
(`src/components/agent-chat-widget.tsx`, `lib/agent/chat.ts`), not a new surface.
Reading the code, three things are needed:

1. **Page context.** The assistant's instructions and tool set are global today; the
   widget reads the path only to move its bubble. It sends the current route and,
   on a piece, the piece id with each request, and the panel shows "Working in:
   <piece title>". Without this, "tighten the setup" has no object.
2. **Piece capabilities** (`lib/sourcework/piece-capabilities.ts`, registered in
   `lib/capabilities/registry.ts`, key `transcription`): read a piece; replace a
   narration block's text; insert, remove and **reorder** blocks; place or swap an
   actuality **by excerpt id**; search excerpts (reusing `sourcework.project.search`);
   and **create a piece from a format** for a project. Edits need no confirmation
   step, because every one writes a version and is undoable, which differs from
   `log.rundownItem.recordOutcome`; each call is still audited as `mcp.*`. An
   actuality is placed by id only, so the assistant cannot alter quote text, and
   length is reported from the same code the screen uses, not estimated by the model.
3. **A refresh after a write.** The chat stream surfaces only reply text, so a tool
   write never reaches the open page. When a turn that called a write capability
   finishes, the widget refreshes the route. Blocks the assistant changed carry an
   "Edited by the assistant · Undo" marker until the next person edit.

### 5.8 Where each step lives

How this fits the screens that exist, from the reporter's and editor's work:

| Moment | Where |
|---|---|
| Set up | **Setup** tab, right-aligned like Traffic's (`TabNav` `end`): the research questions (editable, orderable, archivable), the web **background notes** (dismissable, refreshable), and a *Where this project stands* status. The project's own background text stays in the header. A project without questions behaves as it does today. |
| Add and extract | **Sources** tab. Source cards gain an extraction line ("12 data points · 3 to review"); a `BatchRunPanel` shows progress. Extraction is a status on the source, not a destination. |
| Review per source | Source workspace, **Data points** mode (§5.3). |
| See what is emerging | **Themes** tab: a "Waiting for you" strip (data points to review by source, accepted points not yet in a theme, suggestions), a filterable table with sources, speakers and evidence counts, and suggested rows with Accept, Edit, Reject. The tab badge counts decisions waiting, the way Traffic's Needs attention does. |
| Go deep on one theme | **Theme page** (§5.4), then **Suggested quotes** (§5.5). |
| Make something | **Pieces** tab and the piece editor (§5.6, §5.7). |
| Maintain the language | **Editors** page (prompts and piece formats), reached from Sourcework's setup, editors only (§6). |

The project tab row becomes Sources · Themes · Excerpts · Pieces, with Setup at the right edge (`TabNav`; the
Themes tab appears once a project has research questions or any data point). The
projects list's "needs attention" filter also counts data points and suggested
themes awaiting a decision. The tab and switch names are working names;
the canvas that goes with this doc is the reference for the screens.

## 6. Prompts and who edits them

Slots (defined in code, each with a fixed output schema and variable list):

| Slot | Editors control | Code controls |
|---|---|---|
| `context` | what background to look for, and how | search tool, note schema |
| `extraction` | what counts as responsive and as each story element; how to phrase precision | output schema, categories, range format |
| `theme_assign` / `theme_review` | how a theme definition should read | schema, stance values, statuses |
| `quote_quality` | the definition of a good actuality | range schema, tiers |
| piece formats | sections, length, style | block schema, excerpt placement by id |

Rules, borrowed from prompt-management tools:

- Versions are immutable; "live" is a pointer; rollback is moving it.
- Saving checks that required variables are present and that nothing outside the
  allowed placeholders is referenced.
- **Try this draft** compares a draft with the live version before it is
  published (§6.1).
- Each run records the prompt version; the **accept rate per prompt version**
  (accepted ÷ reviewed) is the quality metric.

Access: a `tool_roles` grant carrying `editor` on the `transcription` tool
(the stacking-roles mechanism, `docs/broadcast-roles.md`) edits prompts and
piece formats. Everyone with tool access can run steps, review, and accept. See §10
for the one open access question.

### 6.1 Trying a draft: the full flow

Purpose: an editor changes wording and wants to see its effect before it reaches
every project. It is a preview, not a test suite; the real quality signal is the
accepted share per version that builds from actual reviews.

1. **Edit.** The editor changes the draft; it autosaves ("Draft saved 2:41 PM").
   There is one draft per slot per editor. The editor page itself holds only the
   text, **Publish…**, **Try this draft**, and a line with the live version, its
   accepted share, and History. What the model is given and returns is a link, not a
   panel.
2. **Pick a sample.** *Try this draft* opens its own screen. The sample is chosen
   for the slot: a *project and source* for the extraction guide (the project
   supplies the questions and background), a *theme* for the quote quality guide, a
   *project* for theme wording and review. It defaults to the last sample used, and
   the screen says what it will cost ("two extraction runs").
3. **Run both.** The live version and the draft run on identical inputs, in
   parallel, as ordinary runs flagged as trials, with a `BusyPanel` while they work.
   Results are stored in `sw_prompt_trials (slot, draft body snapshot, live
   version, sample refs, result per side, created_by, expires_at)` so leaving or
   reloading loses nothing; they expire after 14 days. A trial writes nothing to any
   project: no data points, themes or excerpts. A failure shows the error and can be
   retried at no cost.
4. **Compare.** Rows are aligned by the transcript they point at (spans that overlap
   by at least half match). Groups are *In both*, *Only in draft*, *Only in live*,
   with counts for each side and a filter. For the quote guide, the two ranked clip
   lists sit side by side with each clip playable.
5. **Decide.** *Back to editing* returns to the draft untouched; the trial stays
   under Recent trials. *Publish…* asks for a one-line note about what changed,
   moves the live pointer, and keeps the previous version available for rollback.

It ships for the extraction guide first and the quote quality guide with Phase C;
the other slots follow. Editors only.

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
| **D. Pieces** | Formats (editor-managed), generation, hand editing with block reordering, versions, assistant editing and creation, length check, copy/export | `sw_piece_formats`, `sw_pieces`, `sw_piece_versions`, piece capabilities, assistant page context (§5.7) |

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

### 5.9 Phones

The rules are the existing phone layout's, applied to the new screens:

- Panes become tabs. The rail's Excerpts | Data points switch lives inside the
  existing Excerpts tab, and the tab's count pill shows how many items await review;
  tapping a card's time opens it in the Transcript tab.
- The player docks to the bottom, as now; its mark strip follows the switch.
- Tables become stacked cards (`Table stack`): the Themes list is a card per theme
  with labelled Sources and Evidence lines and 44px Accept, Edit and Reject.
- The Themes tab's "Waiting for you" strip condenses to three lines; the project
  `TabNav` overflows into ⋯ with Setup kept at the right edge.
- Menus and the piece's insert picker are bottom sheets. Reordering is Move up and
  Move down in the block menu, not drag. Insertion points stay visible at rest and
  are 44px tall.
- The assistant opens as a full-screen sheet from a bar at the bottom of the piece.
- Controls are at least 44px and text inputs 16px.
- **The Editors pages work on a phone too.** A slot picker replaces the side list, the
  text area is full width at 16px, and Publish and Try this draft sit in a fixed bottom
  bar. On the Try screen the Live and Draft texts stack inside each row instead of
  sitting in columns, and the pickers stack with a full-width Run both. A piece format's
  sections are cards reordered with Move up and Move down.

**Every screen in this document has a phone design** on the canvas: Sources, Themes,
Setup, source data points, theme page, suggested quotes, piece (with the insert picker,
block menu and the assistant as a full-screen sheet), and the Editors pages (prompt,
try, piece format). Nothing is desktop-only; where a desktop interaction has no touch
equivalent (dragging a block), the same action is reachable another way (Move up and
Move down).

### 5.10 Piece formats editor

A format is edited like a piece: a name, a length with a tolerance, a range of
actualities, an ordered list of sections (each narration or actuality, with one line of
guidance), and a style paragraph. Sections reorder, insert (the same insertion point as
a piece) and remove. It versions, publishes with a note, and has Try the way prompts do:
drafting a piece from a chosen project's accepted themes and excerpts with the draft and
live formats side by side, writing nothing to the project.

## 10. Open questions

1. **Who may edit an accepted theme's definition?** Recommendation: anyone with
   tool access edits their project's themes; only `editor`s edit prompts and
   piece formats.
2. **Extraction trigger**: a click per source, or automatically when a
   transcript completes? Recommendation: a click, since there is no queue and
   cost should be a choice. Revisit once the accept rate is known.
3. **Is web context ever citable in a piece?** Recommendation: background
   only, per §4.2.
4. **Excerpt scope**: suggested excerpts attach to the source (so they surface in
   any project using it), as all excerpts do today. Confirm this is wanted.
5. **Similarity threshold and candidate count** for assignment are tuned on real
   transcripts, not designed here. Phase B includes a short calibration pass on
   a real project.
6. **ASR confidence and audio-quality inputs** to quote selection depend on what
   the transcription provider returns; Phase C scopes what is actually
   available before promising it.

## 11. Decisions taken in review (2026-10-09)

- **Everything must work on a phone.** No screen is desktop-only (§5.9).

- **Research questions and background notes live in a Setup tab**, right-aligned.
  Guidance is a `Steps` status inside Setup (Research questions · Add sources ·
  Extract data points · Review themes), derived from the project's state and never
  enforcing an order, because sources keep arriving and send a project back to
  extraction. The ongoing guide is the Themes tab's "Waiting for you" strip, and a
  run in progress uses `BatchRunPanel`; there is no persistent stepper across tabs.

- The unit is a **piece** made from a **format**; "deliverable" and "template" are
  retired as names.
- Pieces are editable by hand, **blocks reorder**, and AI help is the existing
  assistant, which may also **create** a piece from a format on request.
- Data points and excerpts share the source workspace through a switch at the top
  of the rail; one layer is drawn at a time. There is no separate Data points tab.
- Research questions live in the project header, extraction is a status on source
  cards, and a **Themes** tab is the cross-source place to work.
- The screens use the app's existing components and tokens (TabNav, Segmented,
  FilterChips, Table, Badge, ClipCard-style cards, ActionMenu, BatchRunPanel,
  PlayerBar, SegmentRow); the one new visual is the lime evidence underline.
