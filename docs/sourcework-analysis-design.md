# Sourcework Analysis — Design and Phased Plan

Status: **Phases D (pieces by hand, 2026-10-11), A (questions, background, data points, 2026-10-12), B (themes, 2026-10-13) and C (suggested quotes, 2026-10-14) are built; Phase E is design only.** This is the document
`docs/sourcework-design.md` §5 requires before Phases 4 and 5 (research
questions and data points; themes). It also scopes what that doc did not:
background context gathering, suggested quotes, and **pieces** (a wrap, a voicer
or a script built from a project's material). Read that doc's §2–§3 first; this
one builds on its Source / Representation / Excerpt model and does not restate it.

The screens are designed on a canvas, "Sourcework Research Workspace" (desktop and
phone for every screen), which is the reference for layout and copy; this document
is the reference for behavior and data. Written 2026-10-09 from a product
conversation and a research pass over comparable tools and methods (§11). Most of
that research was read through search snippets and background knowledge, not full
texts, because several sites were unreachable from the research sandbox; §11 says
which claims are verified.

## 1. What this is, and isn't

A reporter working on a project that holds several interviews wants to:

1. say what they are trying to learn (**research questions**);
2. have the tool pull together background that fills the model's gaps;
3. get, for each source, the **data points** that bear on those questions and on
   the story;
4. see, across sources, what **themes** are forming, as sources keep arriving;
5. get a short list of the best **excerpts** (actualities) for those themes;
6. build a **piece** (a wrap, voicer or script) from narration and excerpts, by
   hand, optionally starting from an AI draft, and refine it by hand or with the
   assistant.

Every output of the model is a **suggestion** until a person accepts it. The
reporter is the interpreter; the tool proposes.

Not in scope: cross-project themes (themes are project-scoped); a coding tool in
the QDA sense (hand-applied codebooks, inter-coder agreement); community
sensemaking workshops, voting, or any public surface; unattended processing
(there is still no job queue, so every run is a click); a pipeline planner or
plugin framework for analysis steps (see `sourcework-design.md` §2: developer-
authored steps invoked in sequence).

**Everything works on a phone.** No screen in this document is desktop-only (§7.2).

## 2. Principles

These are the rules the research converged on. They decide the details below.

1. **Everything the model produces is a suggestion with a status**
   (`suggested` / `accepted` / `rejected`). Reject hides; it never deletes.
   Accepted items are pinned and later runs never alter them. An unreviewed item
   shows its Accept and Reject buttons and a dashed border; there is no separate
   "Suggested" pill, since the buttons already say it.
2. **A data point is a paraphrase; an excerpt is a literal cut.** They serve
   different purposes and are chosen by different criteria (§5.3, §5.5).
3. **The model never types out source text.** Where the model points at source
   material it returns segment/word ranges (or page and block ids), and code
   derives the text and timestamps. This is a data-shape choice, not a
   verification layer; fidelity checking is left to a self-review instruction in
   the prompt (§5.2) and to the reporter listening before accepting an excerpt.
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
   editable language over a fixed output schema and fixed variables (§8).
7. **Keep each step small and re-runnable.** A run is keyed to its inputs and
   prompt version, and re-running never destroys accepted or edited work.
8. **Do by hand first.** Every step the model can do, a person can do without it:
   questions and themes can be written, excerpts made, a piece built block by block.
   AI is an accelerant at each step, never a gate.
9. **Reuse the app's components and rules.** The screens are built from `TabNav`,
   `Segmented`, `FilterChips`, `Table`, `Badge`, `ActionMenu`, `BatchRunPanel`,
   `Steps`, the excerpt card, the player bar, and the On Air insertion point; the
   one new visual is a lime underline for evidence (excerpts are gold, the playhead
   blue). Phone rules are the existing ones: panes become tabs, menus are bottom
   sheets, tables become cards, controls are at least 44px.

## 3. The pipeline

```
 research questions ─┐
                     ├─► 1 Context ─► 2 Extract ─► 3 Themes ─► 4 Quotes ─► 5 Piece
 sources + transcripts┘     (per        (per         (per         (per      (by hand,
                          project)    source)      project)     theme)    or drafted)
```

Each arrow is a button, not a background job. Steps 1–2 run when a source is
ready; 3 runs when the reporter asks to review themes; 4 is on demand. Step 5 does
not depend on the earlier steps: a piece can be built by hand from any excerpts,
including ones that exist today.

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
     │                          │ ◄── referenced by id from piece blocks
     ├──1─<── sw_data_points ──1─< sw_data_point_spans   (1..n evidence spans)
     │             │
     │             └──>─< sw_themes   via sw_data_point_themes (stance)
     │
     ├──1─<── sw_themes
     ├──1─<── sw_pieces ──1─< sw_piece_versions     (format_version_id optional)
     └── sw_analysis_runs (audit of every model call: kind, prompt version, counts)

 sw_prompt_versions / sw_prompt_live   (editor-managed language per prompt slot)
 sw_piece_formats / sw_piece_format_versions
 sw_prompt_trials                      (private, expiring results of "Try this draft")
```

### 4.1 `sw_research_questions`

`id, project_id, position, question text, created_by, archived_at`. Ordered, text
only. Archiving hides a question without orphaning its data points.

### 4.2 `sw_context_notes`

Background the model gathered, listed in the project's **Setup** tab and never in
the way. `id, project_id, title, summary, url, retrieved_at, status ('active' |
'dismissed'), created_by`. Rules:

- Gathered automatically (§5.1); no approval step.
- Background only. It primes extraction and is never quotable, never evidence, and
  never an excerpt.
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
exemplifies that data point". A theme's representative quotes are _derived_: the
accepted excerpts linked to that theme's data points. There is no theme-to-
excerpt table.

Excerpts stay source-level, as today, so a quote can surface in any project that
references the source, and in any piece.

### 4.7 Prompts, formats, pieces, trials

- `sw_prompt_versions`: `id, slot, version, body, created_by, created_at,
note`. Insert-only. `sw_prompt_live (slot, version_id)` is the movable pointer;
  rollback is moving it. Slots are defined in code (§8).
- `sw_prompt_trials`: `id, slot, draft_body, live_version_id, sample_refs, results
(per side), created_by, expires_at`. Private to the editor who ran it, expires
  after 14 days, never touches project data (§8.1).
- `sw_piece_formats` / `sw_piece_format_versions`: a **format** has a name and
  kind (`script`, `voicer`, `wrap`, `cut_and_copy`, …) and immutable versions
  holding the section structure, length, actuality range and style language (§6.3).
- `sw_pieces`: `id, project_id, title, format_version_id (nullable),
target_seconds (nullable), created_by`. `format_version_id` is null for a piece
  written by hand. `sw_piece_versions (piece_id, version, body jsonb, saved_by,
saved_via ('person' | 'assistant' | 'generation'), created_at)` is insert-only.
  `body` is an ordered list of `{ id, type: 'narration', text }` and
  `{ id, type: 'actuality', excerpt_id, in_ms?, out_ms? }` blocks. An actuality is
  always a real excerpt; `in_ms` and `out_ms`, when present, are this piece's own
  trim of it, and the block's text is always derived from the transcript for that
  range, never typed. Every save, by a person or by the assistant, is a new
  version; undo is restoring one.
- `sw_analysis_runs`: one row per model run, in the spirit of
  `sw_document_processing_runs` (an audit log, not a queue):
  `id, kind, project_id, source_id, prompt_version_id, model, status, counts,
error, started_at, finished_at`.

## 5. The analysis steps

### 5.1 Context (per project, automatic and quiet)

When the first source of a project reaches a transcript, and when research
questions change, one call with web search enabled gathers background on the
people, places, events and terms the questions and sources mention (the Fort
Barrancas / advanced redoubt case). Results become `sw_context_notes`.

- **No approval step and no modal.** The notes are listed in Setup; dismissing a
  note is the only control.
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
questions, active context notes, and the **extraction guide** (§8). Output, per
data point: the claim, `relevance` and `question_id` / `story_element`, the
speaker, `kind`, and the span ranges.

What qualifies:

- **Responsive** — bears on a research question.
- **Story** — outside the questions but a producer would want it. The fixed set:
  _character_ (who they are, how they talk), _place_, _moment_ (a scene or
  turning point), _detail_ (a concrete or sensory specific), _background_
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
underlined in lime, a dashed underline meaning not yet reviewed.

A data point card shows its claim, its kind and question or story element, its
time ranges, and a play button. An unreviewed card has a dashed border and its
Accept, Edit and Reject buttons. A card links to the excerpt that exemplifies it,
so the two kinds of item stay connected without sharing a view. The source tab row
is unchanged on desktop (Transcript · Projects).

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

The **Themes tab** is where a project's research is worked cross-source (§7.1); the
**theme page** is the main analysis view: definition, memo, breadth numbers,
supporting and complicating data points grouped by source (a switch filters All |
Supporting | Complicating), and the representative excerpts. A theme backed by a
single source says so.

### 5.5 Quotes (per theme, on a click)

Excerpt selection is driven by what makes a clip work on air, not by what is
responsive. It is a separate step with a separate prompt, the **quote quality
guide** (§8). Example criteria, all editable:

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
works**, a quality tier (Strong, Good, Usable), and the data points it exemplifies.
These become `sw_source_excerpts` rows with `origin = 'suggested'`.

Review is one click with the clip playing right there, using the existing excerpt
card and trim chips. Accepting turns it into an ordinary excerpt; rejecting hides
it. A reporter can also keep making excerpts by hand exactly as today.

## 6. Pieces

### 6.1 Creating a piece

A **piece** is a finished item made from a project's material: a wrap, a voicer,
a script, a cut-and-copy. **A piece starts blank and is built by hand by default.**

The flow: **Pieces** tab → **+ New piece** → the editor opens at once on an empty
piece with an editable title (no form first) → build it from narration and
excerpts, or choose **Draft with AI** → pick a **format**, the **material**
(accepted themes, all on by default; only accepted excerpts are ever used) and an
optional **direction** → **Generate draft** → land back in the editor with the draft
in place and a note ("Drafted from Radio wrap v3 · 0:57 of 1:00 · Undo") → iterate
by hand or with the assistant.

**Draft with AI appears once, in the empty state of a piece, and nowhere else.** A
piece that already has content has no such button or menu item; starting over from a
format is a request to the assistant, whose draft is a version and is undone from
History. The piece records which format drafted it, and the Pieces list says
"Written by hand" or "Radio wrap format, then edited". A piece with no format has no
target length until the writer sets one.

### 6.2 The block editor

A piece is **edited directly, as a block editor**. Narration blocks are inline text.
An actuality block's wording comes from its excerpt, but it can be swapped, trimmed,
moved or removed. Conventions:

- **Insertion points between every block**, before the first and after the last,
  built the way the On Air rundown's `insertion-point.tsx` is: visible at rest (a
  hairline, a circled +, a hairline), not hover-only. It opens a dashed panel with
  two modes, **Narration** and **Excerpt**; Excerpt is a search box over the
  project's accepted excerpts with arrow-key navigation and Enter to add, and shows
  duration and speaker.
- **Enter** at the end of a narration block adds a narration block below;
  **Backspace** in an empty one removes it.
- **Trim in place.** An actuality block's ⋮ menu has **Trim…**, which opens the trim
  panel under the block (a bottom sheet on a phone): the clip's words highlighted in
  their transcript context, tap a word to move the start or end there, or nudge with
  the existing −250 −50 +50 +250 chips, and **Play as cut**. The piece's length
  updates as you trim. A trim is **per piece by default** (the block's own `in_ms`
  and `out_ms`; the excerpt is untouched). A switch, **Only in this piece | Update the
  excerpt everywhere**, changes the excerpt itself and says how many other pieces
  use it.
- **Reorder** by dragging the ⋮⋮ handle (desktop), or Move up and Move down in the
  block's ⋮ menu, which also serves keyboard and phone.
- **Length** is computed in code from `lib/log/read-time.ts` (160 words per minute)
  plus excerpt durations and shown as "0:52 of 1:00, 3s under".
- **Versions.** Every save is a version; History shows who saved it, a person or the
  assistant, and restores any version.
- **Export** in this phase is copy as text plus the existing excerpt zip export
  (`clips.zip`).

### 6.3 Formats and AI drafting

A **format** defines: a name and kind; ordered sections, each `narration` or
`actuality` with a line of guidance; a target duration with a tolerance; a range for
the number of actualities; and style language. A draft run takes a project's
accepted themes and accepted excerpts (or a subset the reporter picks), the format
version, and a direction (angle, audience, sensitivities).

The model writes **narration only**. Actualities are placed by excerpt id, so quote
text and audio always match the source. Nothing is generated from the model's memory
of a transcript: the inputs are only data points and excerpts a person has accepted.

Editors maintain formats on the Editors page like prompts (§8): a name, length and
tolerance, actuality range, an ordered list of sections that reorder and insert the
way blocks do, and a style paragraph. A format versions, publishes with a note, and
has **Try this draft** (§8.1): drafting a piece from a chosen project's accepted
themes and excerpts with the draft and live formats side by side, writing nothing to
the project.

No prior art was found for generating a script or wrap from interview audio, so this
layer is kept deliberately small.

### 6.4 The assistant

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
   actuality **by excerpt id**; **trim an actuality** (to the piece, by default; the
   assistant can also widen it into the source audio); search excerpts (reusing
   `sourcework.project.search`); **create a blank piece**; and **draft a piece from
   a format** (on request, including to start over). Edits need no confirmation
   step, because every one writes a version and is undoable, which differs from
   `log.rundownItem.recordOutcome`; each call is still audited as `mcp.*`. An
   actuality is placed by id only, so the assistant cannot alter quote text, and
   length is reported from the same code the screen uses, not estimated by the model.
3. **A refresh after a write.** The chat stream surfaces only reply text, so a tool
   write never reaches the open page. When a turn that called a write capability
   finishes, the widget refreshes the route. Blocks the assistant changed carry an
   "Edited by the assistant · Undo" marker until the next person edit.

## 7. Where it lives: screens and phones

### 7.1 Where each step lives

How this fits the screens that exist, from the reporter's and editor's work:

| Moment                | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set up                | **Setup** tab, right-aligned like Traffic's (`TabNav` `end`): the research questions (editable, orderable, archivable), the web **background notes** (dismissable, refreshable), and a _Where this project stands_ status (`Steps`: Research questions · Add sources · Extract data points · Review themes). It is derived from the project's state and never enforces an order, because new sources send a project back to extraction. The project's own background text stays in the header. A project without questions behaves as it does today. |
| Add and extract       | **Sources** tab. Source cards gain an extraction line ("12 data points · 3 to review"); a `BatchRunPanel` shows progress. Extraction is a status on the source, not a destination.                                                                                                                                                                                                                                                                                                                                                                   |
| Review per source     | Source workspace, **Data points** mode (§5.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| See what is emerging  | **Themes** tab: a "Waiting for you" strip (data points to review by source, accepted points not yet in a theme, suggestions), a filterable table with sources, speakers and evidence counts, and suggested rows with Accept, Edit, Reject. The tab badge counts decisions waiting, the way Traffic's Needs attention does.                                                                                                                                                                                                                           |
| Go deep on one theme  | **Theme page** (§5.4), then **Suggested quotes** (§5.5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Make something        | **Pieces** tab → **+ New piece** (§6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Maintain the language | **Editors** page (prompts and piece formats), editors only (§8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

The project tab row is Sources · Themes · Excerpts · Pieces, with Setup at the right
edge (`TabNav`; the Themes tab appears once a project has research questions or any
data point). The projects list's "needs attention" filter also counts data points
and suggested themes awaiting a decision. On-going guidance is the Themes tab's
"Waiting for you" strip and a run in progress uses `BatchRunPanel`; there is no
persistent stepper across tabs. Tab and switch names are working names.

### 7.2 Phones

**Every screen in this document has a phone design** on the canvas: Sources, Themes,
Setup, source data points, theme page, suggested quotes, Pieces list, a new piece,
Draft with AI, the piece editor (with the insert picker, block menu, trim sheet and
the assistant as a full-screen sheet), and the Editors pages (prompt, try, piece
format). The rules are the existing phone layout's, applied to the new screens:

- Panes become tabs. The rail's Excerpts | Data points switch lives inside the
  existing Excerpts tab, and the tab's count pill shows how many items await review;
  tapping a card's time opens it in the Transcript tab. The player docks to the
  bottom, as now, and its mark strip follows the switch.
- Tables become stacked cards (`Table stack`): the Themes list is a card per theme
  with labelled Sources and Evidence lines and 44px Accept, Edit and Reject.
- The Themes tab's "Waiting for you" strip condenses to three lines; the project
  `TabNav` overflows into ⋯ with Setup kept at the right edge.
- Menus, the piece's insert picker and the trim panel are bottom sheets or full
  sheets. Reordering is Move up and Move down in the block menu, not drag. Insertion
  points stay visible at rest and are 44px tall.
- The assistant opens as a full-screen sheet from a bar at the bottom of the piece.
- Controls are at least 44px and text inputs 16px.
- **The Editors pages work on a phone too.** A slot picker replaces the side list,
  the text area is full width at 16px, and Publish and Try this draft sit in a fixed
  bottom bar. On the Try screen the Live and Draft texts stack inside each row
  instead of sitting in columns, and the pickers stack with a full-width Run both. A
  piece format's sections are cards reordered with Move up and Move down.

Where a desktop interaction has no touch equivalent (dragging a block), the same
action is reachable another way.

## 8. Prompts and who edits them

Slots (defined in code, each with a fixed output schema and variable list):

| Slot                            | Editors control                                                              | Code controls                           |
| ------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| `context`                       | what background to look for, and how                                         | search tool, note schema                |
| `extraction`                    | what counts as responsive and as each story element; how to phrase precision | output schema, categories, range format |
| `theme_assign` / `theme_review` | how a theme definition should read                                           | schema, stance values, statuses         |
| `quote_quality`                 | the definition of a good actuality                                           | range schema, tiers                     |
| piece formats                   | sections, length, style                                                      | block schema, excerpt placement by id   |

Rules, borrowed from prompt-management tools:

- Versions are immutable; "live" is a pointer; rollback is moving it.
- Saving checks that required variables are present and that nothing outside the
  allowed placeholders is referenced.
- **Try this draft** compares a draft with the live version before it is published
  (§8.1).
- Each run records the prompt version; the **accept rate per prompt version**
  (accepted ÷ reviewed) is the quality metric.

Access: a `tool_roles` grant carrying `editor` on the `transcription` tool (the
stacking-roles mechanism, `docs/broadcast-roles.md`) edits prompts and piece
formats. Everyone with tool access can run steps, review, accept, and make pieces.
See §12 for the one open access question.

### 8.1 Trying a draft: the full flow

Purpose: an editor changes wording and wants to see its effect before it reaches
every project. It is a preview, not a test suite; the real quality signal is the
accepted share per version that builds from actual reviews.

1. **Edit.** The editor changes the draft; it autosaves ("Draft saved 2:41 PM").
   There is one draft per slot per editor. The editor page itself holds only the
   text, **Publish…**, **Try this draft**, and a line with the live version, its
   accepted share, and History. What the model is given and returns is a link, not a
   panel.
2. **Pick a sample.** _Try this draft_ opens its own screen. The sample is chosen
   for the slot: a _project and source_ for the extraction guide (the project
   supplies the questions and background), a _theme_ for the quote quality guide, a
   _project_ for theme wording, review, and piece formats. It defaults to the last
   sample used, and the screen says what it will cost ("two extraction runs").
3. **Run both.** The live version and the draft run on identical inputs, in
   parallel, as ordinary runs flagged as trials, with a `BusyPanel` while they work.
   Results are stored in `sw_prompt_trials` so leaving or reloading loses nothing;
   they expire after 14 days. A trial writes nothing to any project: no data points,
   themes, excerpts or pieces. A failure shows the error and can be retried at no
   cost.
4. **Compare.** Rows are aligned by the transcript they point at (spans that overlap
   by at least half match). Groups are _In both_, _Only in draft_, _Only in live_,
   with counts for each side and a filter. For the quote guide, the two ranked clip
   lists sit side by side with each clip playable.
5. **Decide.** _Back to editing_ returns to the draft untouched; the trial stays
   under Recent trials. _Publish…_ asks for a one-line note about what changed,
   moves the live pointer, and keeps the previous version available for rollback.

It ships for the extraction guide first and the quote quality guide with Phase C;
the other slots follow. Editors only.

## 9. Operations and constraints

- **No job queue.** Every step is a click. Extraction across several sources uses
  the existing batch pattern (`useTaskQueue` / `BatchRunPanel`, three at a time).
- **`OPENAI_API_KEY` is required** for the AI steps; an unset key fails the run
  clearly, as the program-log import does. Embeddings stay optional elsewhere
  and are not made mandatory for existing search. Building a piece by hand needs no
  key.
- **Model**: structured outputs on the model `editorial-inquiry/ai.ts` and the
  program-log importer pin; reasoning mode on, since the self-review of claims
  against spans depends on it.
- **Cost** is bounded by being per-source and on demand; each run row records
  model and counts.
- Interview audio and text go to a third party. That is already true of ASR; the
  design records it so it is not a surprise.

## 10. Phasing

Each phase ships usable value and its own migration, applied through
`APPLIED.md` as usual, with Resources release notes and guides per CLAUDE.md.

Pieces built by hand depend only on excerpts, which exist today, so **Phase D can
ship first, or at any point, independently of the analysis phases.** The
recommended order is D, then A, B, C, then E.

| Phase                                         | Ships                                                                                                                                                                                                                                                                                            | Notes                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Questions, context, data points**        | Setup tab (questions, background notes, status); extraction run per source; extraction status on source cards; Excerpts \| Data points switch and review in the source workspace; spans playable in the transcript and PDF viewer; the Editors page for the extraction guide with Try this draft | `sw_research_questions`, `sw_context_notes`, `sw_data_points`, `sw_data_point_spans`, `sw_analysis_runs`, `sw_prompt_versions`/`sw_prompt_live`, `sw_prompt_trials`, editor role |
| **B. Themes**                                 | Assignment, Review themes, Themes tab with "Waiting for you", theme page with breadth numbers, memos                                                                                                                                                                                             | `sw_themes`, `sw_data_point_themes`, embeddings                                                                                                                                  |
| **C. Suggested quotes**                       | Quote selection per theme; suggested excerpts with a why-line; review; the quote quality guide and its Try                                                                                                                                                                                       | `sw_data_point_excerpts`, two excerpt columns, `quote_quality` slot                                                                                                              |
| **D. Pieces by hand**                         | Pieces tab, new blank piece, the block editor (insertion points, reorder, trim in place), versions and History, length, copy and export. No AI, no analysis                                                                                                                                      | `sw_pieces`, `sw_piece_versions`                                                                                                                                                 |
| **E. Formats, AI drafting and the assistant** | Piece formats (editor-managed) with Try; Draft with AI; assistant page context, piece capabilities and the refresh after a write                                                                                                                                                                 | `sw_piece_formats`, format versions, piece capabilities (§6.4)                                                                                                                   |

Not scheduled: meta-themes (the `parent_theme_id` column exists), cross-project
themes, a keyword-in-context view over all sources (the hybrid search already
exists and can back one), a pairwise "which quote is better" picker, a theme
change log table, member-checking or "shared with source" statuses.

## 11. Prior art and what was taken

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
- **Block editors and prompt tools** (product conventions) — insertion points,
  drag handles, versioned prompts with a movable live label. Taken: the On Air
  rundown's own insertion point and the app's version-pointer pattern, rather than
  a new editor library.

## 12. Open questions

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
5. **"Update the excerpt everywhere"** in the trim panel currently changes the
   excerpt with the usage count shown, and no confirmation. Add a confirmation when
   other pieces use it?
6. **Themes tab visibility**: shown once a project has research questions or any
   data point, so existing projects look unchanged. Confirm.
7. **Similarity threshold and candidate count** for assignment are tuned on real
   transcripts, not designed here. Phase B includes a short calibration pass on
   a real project.
8. **ASR confidence and audio-quality inputs** to quote selection depend on what
   the transcription provider returns; Phase C scopes what is actually
   available before promising it.
9. **Phone Try comparison**: Live above Draft within each row, or one Live | Draft
   toggle for the whole list?

## 13. What review changed

Decisions taken in review on 2026-10-09 that shaped this version, for anyone who
read an earlier draft:

- The unit is a **piece** made from a **format**; "deliverable" and "template" are
  retired as names.
- A piece is **written by hand by default**; AI drafting from a format is optional,
  offered once from an empty piece, and starting over goes through the assistant.
  There is no "Redraft" action.
- Pieces are a block editor with visible insertion points, reorder, per-piece trim in
  place, and versions; AI help is the existing assistant with page context and piece
  capabilities, not a new surface.
- Data points and excerpts share the source workspace through a switch at the top of
  the rail, one layer at a time. There is no separate Data points tab, and no
  "Suggested" pills where Accept and Reject buttons are present.
- **Research questions and background notes moved to a Setup tab**; guidance is a
  status inside Setup, not a persistent stepper. Extraction is a status on source
  cards. A **Themes** tab is the cross-source place to work.
- Editors maintain prompts and formats on one page; **Try this draft** is a full
  flow with its own screen; formats have their own editor.
- **Everything works on a phone.**
- The screens use the app's existing components and tokens; excerpts stay gold and
  evidence is lime.

## 14. Phase A as built (2026-10-12)

Where the build departed from, or settled, the design above:

- **Background is gathered lazily, not on a trigger.** There is no job queue and no hook on "first source
  ready", so `lib/sourcework/context-run.ts` gathers when the Setup tab finds it missing or stale (the
  questions' fingerprint differs from the last good run's), after a question is added or edited, before an
  extraction, and on Refresh. A run adds notes, never removes one, and never re-adds a dismissed one.
- **Spans are sentences, not segments.** The model is shown numbered units (a transcript's sentences, a
  document's blocks) and returns unit ranges; `extraction-units.ts` derives the time ranges or page and block
  ids. Long sources are read in overlapping windows and de-duplicated by passage overlap.
- **Extraction runs in a route handler** (`/api/sourcework/extract`, NDJSON progress), three at a time from the
  Sources tab; closing the tab ends the request and a dead run is recovered as stale.
- **Re-running** replaces only still-suggested points; a fresh suggestion that lands on a passage already
  accepted or rejected (same bearing) is not made again.
- **The Editors page** (`/sourcework/editors`, role `editor`, a stacking role on the `transcription` tool) ships
  Background and Extraction guide only; "Try this draft" exists for the extraction guide. Prompt text is plain
  language appended to a fixed framing; a slot with no published version runs its built-in text
  (`lib/sourcework/prompts.ts`, run rows record a null version for it).
- **Not built in A:** the `embedding` columns (Phase B), the "Theme:" and "Excerpt:" lines on accepted cards
  (they need Phases B and C), and the Themes tab. The Projects list's "needs attention" filter counts data
  points awaiting review (`sw_project_overview.review_count`).
- **Legacy tables.** Both hosted projects carried five empty tables from an earlier sketch of this phase
  (`sw_research_questions` with different columns, `sw_data_points`, `sw_data_point_excerpts`, `sw_themes`,
  `sw_theme_data_points`); the migration drops them (the tool is still in testing, so their contents are not kept).
- **Detached sources.** Removing a source from a project deletes only the link, so its data points stay (and return
  if the source is re-attached) but stop counting anywhere: the three count views go through the project's
  current `sw_project_sources` rows (`20261012140000`).

## 15. Phase B as built (2026-10-13)

Where the build departed from, or settled, the design above:

- **Assignment runs after an accept, in `after()`.** Accepting or editing a data point files it into the accepted themes
  (`theme_assign`, `lib/sourcework/theme-run.ts`'s `assignDataPoints`): best effort, silent without `OPENAI_API_KEY` or any accepted
  theme, and a point that fits nothing is simply not filed. A point is looked at again only when a theme has been accepted since
  (`sw_data_points.theme_checked_at`), by `assignPool`, which runs when a theme is accepted or created and at the start of Review
  themes. So the pool is not re-asked about on every click, and Review themes only proposes from points no accepted theme claims.
- **Embeddings narrow candidates only when there are many themes.** With five or fewer accepted themes every one is a candidate and
  nothing is embedded. Above that, data points and themes are embedded on demand (`sw_nearest_themes`, pgvector), and a failure
  falls back to the first twelve themes by breadth. Threshold and candidate count (§12.7) are constants in `theme-prompt.ts`, not
  yet calibrated on a real project.
- **Review themes** is a route handler (`/api/sourcework/themes/review`) returning one JSON result, with a `BusyPanel`. It reads at
  most 250 unfiled points per click and says so. New themes and their members are written by `sw_add_proposed_themes()` in one
  transaction; a title already on file, accepted, proposed, rejected or merged away, is never proposed again.
- **Merges, not splits.** Merge suggestions are built (`sw_theme_merge_suggestions`, `sw_merge_themes()`: the data points move with
  their stance, the folded theme keeps its row with `merged_into_id`, the target's memo records why). Split suggestions are not:
  the canvas has no split row, and a split needs the model to partition an existing theme's evidence, which deserves its own pass.
- **Themes tab visibility** follows §12.6: shown once a project has an active research question or any data point; the badge
  counts suggested themes plus merges between live themes (`sw_theme_decision_counts`). The Projects list's "needs attention"
  count includes both.
- **Edit is a decision.** Saving an edit of a suggested theme accepts it, as it does for a data point; Edit from the list opens the
  theme page's form (`?edit=1`). A person can also write a theme by hand (+ New theme) and add data points to it from its page.
- **Removing is recorded.** Taking a data point out of a theme sets `removed_at`, so assignment never puts it straight back; there
  is no delete on any Phase B table.
- **History is derived**, not a change-log table: how the theme began, who accepted it, and later arrivals by day and source.
- **Not built in B:** the theme page's Excerpts panel and Suggest quotes (Phase C), `parent_theme_id` and `color` (no screen uses
  them), a Try this draft for the two new prompt slots (the Editors page edits and publishes them; accept rate per version is
  measured for Review themes), and splits.
- **Speakers** in the breadth numbers are distinct `tw_speakers` rows, so one person interviewed in two sources counts as two.

## 16. Phase C as built (2026-10-14)

Where the build departed from, or settled, the design above:

- **A suggestion is not an excerpt row.** §4.6 put `origin` and `review_status` on `sw_source_excerpts`. Nine places read
  that table (the rail, the library, `clips.zip`, the piece editor's picker, the search index, `tw_search`, the
  Projects list's counts, project deletion) and one missed filter would put unreviewed model output into a finished
  piece or an export. Suggestions live in `sw_quote_suggestions` (theme, source, start/end, the words, the why-line,
  tier, status) with their data points in `sw_quote_suggestion_points`, and the excerpt row is written only on accept
  by `sw_accept_quote_suggestion()` (excerpt, `sw_data_point_excerpts` links and the decision in one transaction).
  The excerpt keeps what §4.6 wanted recorded in three columns nothing filters on: `origin`, `suggestion_reason`,
  `quality_tier` (3 strong, 2 good, 1 usable). A theme's representative quotes are still derived (the excerpts linked
  to its data points); there is no theme-to-excerpt table.
- **The model returns sentence numbers, never text or times.** Same data shape as extraction: the clip is a range of the
  sentence units `extraction-units.ts` already builds, in sources it names by number, and code derives the start, the
  end and the words (`quote-prompt.ts`). A clip is dropped if it names a sentence the model was not shown, jumps over a
  gap in what was shown, crosses speakers, or is outside 1.5–60 seconds. The model is shown only the transcript around
  the theme's supporting data points (four sentences either side, merged, 360 per source, 60 data points per run), not
  whole interviews. Documents are skipped: a quote is a clip.
- **Complicating evidence is not offered.** The input is the theme's accepted _supporting_ data points from recordings.
- **A run replaces only the suggestions still waiting** (`sw_quote_suggestions_delete_waiting` is the only delete, and
  only of `status = 'suggested'`), and never proposes a stretch that overlaps half of one already accepted or rejected.
  Runs are keyed per theme (`sw_analysis_runs.theme_id`, kind `quote_suggest`, one running per theme).
- **Trim happens on the card before accept.** The chips move the in or out point by −250/−50/+50/+250 ms and Play plays
  the trimmed range. The range is checked again on the server and the excerpt's words and title are re-derived from the
  transcript for it, so an accepted excerpt never carries words the audio does not.
- **Screens.** The theme page's Excerpts panel (side column on a desktop, above the evidence on a phone, one run shared
  between the two) lists the excerpts that exemplify the theme and starts the run; with clips waiting it links to
  review them. `/sourcework/[id]/themes/[themeId]/quotes` is the suggested-quotes screen, the live quote quality guide
  beside it. A data point's card in the source workspace gained the "Excerpt:" line that §14 deferred.
- **The quote quality guide** is the fifth prompt slot (`quote_quality`). Editors edit and publish it on the Editors
  page and its accept rate per version is measured (`sw_quote_accept_rates()`).
- **Not built in C:** Try this draft for the quote quality guide (§8.1 wanted it here: its sample is a theme and its
  comparison is two ranked, playable clip lists, which the extraction trial's project-and-source sample and data-point
  matcher do not fit, so it is a piece of work of its own); ASR confidence and audio-quality flags as inputs to
  selection (open question 8: the transcription provider's word confidences are not kept on `tw_segments.words`, so the
  guide asks the model to say what it can hear in the words and nothing more).
