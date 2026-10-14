<!-- Status (2026-10-25): slices 1 (Analyze), 2 (project synthesis), 3 (outline as beats, Write from outline) and 4
(retire the old runners, design doc §23) are built; the §7 evaluation harness is not. Slice 3's design is design doc §22.
Section 5.2's "Questions tab" became a Synthesis tab (docs/sourcework-analysis-design.md §21). The sections below are the
plan as agreed, kept so a later session has the reasoning; where the design doc's §20/§21 differ, the design doc describes
what was built. -->

# Sourcework: assessment of the AI research workflow, and the recommended direction

## Context

Sourcework's analysis layer (Phases A–E, built 2026-10-09 to 10-15) works mechanically but does not reproduce the
editorial workflow it was meant to systematize. This is the grounded assessment the request asked for, revised after
discussion: what the code does, what the two production projects show, where each problem comes from, and a coherent
set of refinements organised around what a reporter is trying to do rather than around pipeline stages.

Decisions already taken in discussion: **themes are replaced by a project-wide synthesis written per research question**;
**a piece is the story** (no separate story object; the outline is beats inside the existing piece editor, and drafting
expands them); **evaluation is side-by-side reading, no gold set**; **the tool must serve both the full AI-assisted flow
and manual, fragmentary use** (a reporter inside one transcript asking for findings and good excerpts in one click).

Nothing has been changed and nothing in production has been touched. One limit on this session: no `OPENAI_API_KEY`
and no route to `api.openai.com`, so no comparative model run was possible here; §7 is a harness to run, not results.

---

## 1. What is built today (as the code is, not as the design doc says)

- **Background** (`context-run.ts`, `context-ai.ts`): a separate `web_search` call before every extraction and whenever
  questions change, driven by the 40 most-used capitalized terms. ≤8 `{title, summary, url}` notes, URL-validated against
  what search returned. Sent **only** to extraction, as text; never to themes, quotes or drafting; URLs never shown.
- **Extraction** (`extraction-run.ts`, `extraction-prompt.ts`): per source, per 9,000-word window (every production run
  was one window). Sees the questions, the notes and **this source alone**; prior data points are never shown, only used
  afterwards to dedupe against reviewed passages. Fails outright with no research question. No quota anywhere.
- **Themes** (`theme-run.ts`): assignment in `after()` on every accept (70 runs); Review themes proposes project-wide
  claims from unfiled points. No `question_id` on a theme. No answer artifact anywhere.
- **Quotes** (`quote-run.ts`): per theme; the model sees four sentences either side of each data point; ≤8 clips per run.
  Speaker is hard-coded `null` in the point list. The live guide (v1, 600 words) argues for inclusion.
- **Draft with AI** (`piece-draft-run.ts`): one call from accepted themes + points + up to 80 excerpts (arbitrary 30-point
  cap per theme); "never the transcript". No outline; `direction` is the only angle.
- **Assistant in a piece** (`piece-capabilities.ts`): edits blocks, substring-searches excerpts. Cannot read findings,
  themes or any transcript. `sourcework.project.search` only filters project titles.
- **Editor slots and trials** (`prompts.ts`, `trial-run.ts`, `quote-trial-run.ts`): five guides on five fixed framings;
  pairwise trials by span overlap for extraction and quotes; accept rate per version is the metric.

Sound, and kept throughout: unit numbers not text for every span; strict schemas with code-side validation and drop
counts; suggested/accepted/rejected with reject-hides; a run replaces only still-suggested rows; insert-only versions;
actualities placed by id; `sw_analysis_runs` as audit; the trial pattern; the Excerpts | Data points layer.

---

## 2. What production shows

**Hurricane Isaias** (24 sources, 8 questions, 186 data points, 15 themes, 107 quote suggestions, 3 pieces)

| Finding                                             | Evidence                                                                                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing was ever rejected                           | 186 accepted / 0 rejected; 97 of 107 quote suggestions accepted, 1 rejected                                                                                                                                                                        |
| Extraction paraphrases the briefing                 | Tom Lloyd 177 words → 7 points; Hoffberger 366 → 8; Lagard 742 → 14; Okaloosa 1,677 → 24; 133 of 186 are `factual`                                                                                                                                 |
| Redundancy across sources is invisible to the model | water: 26 points / 7 sources; downed lines: 15 / 7; generators: 12 / 6; fatalities: 8 / 5                                                                                                                                                          |
| The "story" bucket went unused                      | 1 of 186 points is `relevance = story`                                                                                                                                                                                                             |
| Quotes cut up whole briefings                       | Okaloosa: 24 points → 20 suggested excerpts; DeSantis 10-11: 13; Reeves: 13                                                                                                                                                                        |
| The pipeline fed none of the real stories           | Both NPR wraps were written by hand/assistant. "Neighbors Helping Neighbors" uses two hand-cut excerpts from Rosado 2 and Laritz 2, sources with **zero** data points. 13 of 24 sources (the resident interviews added 10-12) were never extracted |
| Draft with AI recited themes                        | "Hurricane Isaias Update" v1: 14 blocks, 4 actualities, 4:02, then 12 assistant edits                                                                                                                                                              |
| Background is a glossary                            | 15 notes: FPL, FDOT District Three (twice), two airports, CHELCO, SAIL                                                                                                                                                                             |

The eight questions are topic areas that together cover a whole hurricane. Against them, nearly every sentence of an
official briefing "bears on" a question, which is the prompt's only test.

**Tunnel Visions** (2 sources, 5 questions, 19 data points, 3 themes, 0 quotes)

| Finding                                | Evidence                                                                                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The interpretive question got nothing  | Q5 (collective memory, civic identity): 0 data points                                                                                                                                                             |
| Interviewer statements became findings | 2 of 19 are "Strickland says…"; both rejected                                                                                                                                                                     |
| Stance is unreliable                   | Teal's 8-foot saltwater pipelines filed as **supporting** "the Fort Pickens tunnel circulated as Civil War lore"                                                                                                  |
| Character and moment were lost         | "I was born in 1950 at the Navy Yard Hospital… I can tell you the ones that are true"; "my daddy told me, don't you go out there no more, boy, that thing will cave in on you" — neither a finding nor an excerpt |
| Background helped here                 | "Fort Redoubt terminology", "Braxton Bragg / 'Fort Bragg'", the Advanced Redoubt's countermining gallery resolved real ASR ambiguities ("Fort Riddle", "Fort Brancus")                                            |

---

## 3. Diagnosis by layer

| Problem                        | Root cause                                                                                                                                                                                                                                        | Layer                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A. Too many, too flat findings | Objective is "paraphrase what bears on a question", one source at a time, with no view of what the project already knows and no notion of significance. Broad questions make everything bear. Windowing is not the cause; per-source isolation is | Prompt + context + question design |
| B. Research disconnected       | A pre-pass that produces glossary notes from term counts; the reader of a transcript cannot search when it hits a gap; notes never surface as citations                                                                                           | Architecture                       |
| C. Question peripheral         | `question_id` stops at the data point; themes are project-wide QDA codes; no answer artifact; stance assigned per click from paraphrases                                                                                                          | Data model + architecture          |
| D. Mediocre actualities        | Per-theme, over 4-sentence neighbourhoods: local, never comparative, never story-aware; the live guide leans toward inclusion                                                                                                                     | Prompt + architecture              |
| E. Narrative richness lost     | Drafting and the assistant never see a transcript by design; the only route for a detail is a "story" data point, which news material never produces                                                                                              | Architecture                       |
| F. No outline                  | Missing artifact                                                                                                                                                                                                                                  | Data model                         |
| G. Fragmentation               | Six single-shot JSON calls with no tools and no shared working memory                                                                                                                                                                             | Architecture                       |
| Metric                         | Accept rate cannot see quality (186/186)                                                                                                                                                                                                          | Evaluation                         |

The prompts are individually reasonable. Cumulatively (framing + guide per step, about 2,500 words) they describe
procedures; none states the editorial objective, which is _answer this question and tell me what matters_.

---

## 4. The flows the tool has to serve

Designing from these, not from stages. Each flow names the operations it needs; §5 defines the operations.

| Flow                                                                                                                      | What the reporter has and wants                                                                                                                          | Operations used                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Deadline news** (Isaias): many short briefings and a few vox interviews in one day, a 0:53 wrap by evening              | "What's new in this briefing against what I already have", the few facts with attribution, two good cuts, a draft                                        | Analyze source (per briefing, batched); Outline → Draft on the piece; assistant with transcript search |
| **Investigation** (Tunnel Visions): long interviews over weeks, documents, explicit questions, understanding that evolves | Findings per question with certainty and conflict, a defensible synthesis, comparative actualities, an outline that can be revised when new tape arrives | Analyze source as each lands; Synthesize per question; Outline on a piece; Draft                       |
| **Manual, inside one transcript**: no project setup, a reporter cutting tape                                              | "Analyze this source" from the transcript toolbar: findings + candidate excerpts in one run, excerpts then available in the piece picker                 | Analyze source without a question (see §5.1), nothing else required                                    |
| **Piece-first**: a few hand-cut excerpts, wants a draft                                                                   | Draft from material with the model able to reach back into the transcripts; outline optional                                                             | Outline (optional) → Draft; assistant                                                                  |
| **Late source**: a project with findings gets a new interview                                                             | The new source read against what is already established; synthesis offered a revision, never overwritten                                                 | Analyze source (against accepted findings); Synthesize proposes a new version                          |

Principles that fall out: every operation works on its own; none is a gate for another; each says what it would benefit
from ("this project has no research question; add one, or analyze against the project description") and offers to get
it; a run never alters an accepted or edited artifact, it proposes a new version or new suggestions.

---

## 5. The operations (what replaces what)

### 5.1 Analyze source — one run, replaces Extract + per-theme Suggest quotes + the Background pre-pass

- **Where**: a button in the source workspace (transcript and PDF), and the existing batch on the Sources tab
  (`extraction-controls.tsx`, `useTaskQueue`). The route handler and NDJSON progress stay (`/api/sourcework/extract`,
  renamed or kept).
- **Input**: the source as numbered units (unchanged); the project's questions **and its accepted findings per question**
  as "already established" (claims, numbered); the project description; the interviewer named as a speaker to skip. If
  the project has no question, the objective is the project description plus "what in this source is newsworthy, and
  what would a reporter need to verify"; the UI says a question would sharpen it and offers to add one, without blocking
  (`extraction-run.ts:171` today refuses). This is the "IDK" fork, resolved as: prompt, don't block.
- **Tools**: `web_search`, `tool_choice: auto`, on the same Responses call (the mechanism `context-ai.ts` already uses
  with a strict schema). Per the request, the model decides when; nothing prescribes subjects.
- **Output** (one schema): `findings[]` (claim, `significance` one line, question number or null, kind, spans) · `excerpts[]`
  (sentence ranges with a one-line why, speaker-continuous, 1.5–60 s, the checks `parseQuoteOutput` already does; the
  framing says few or none is normal; each names the finding it serves **or** `narrative` for a character or moment
  line that serves none; no floor, and a hard ceiling in code of **5 per source**, down from 8 per theme) · `consulted[]` (title, summary, url, the
  finding numbers it informed; URL-validated against `web_search_call.action.sources` with the existing
  `collectSeenUrls` / `parseContextOutput` logic). `story` / `story_element` are no longer produced; columns and old rows
  stay valid.
- **Writes**: `sw_data_points` (+ `significance`, `relevance = 'general'` when no question); `sw_quote_suggestions` keyed
  to the run and source (`theme_id` nullable); `sw_context_notes` as consulted notes linked to the findings they
  informed (new link table), retrieved-but-unused URLs only on `sw_analysis_runs.queries`. Re-running replaces only this
  source's still-suggested findings and clips (today's rule), never a decided one.
- **Review**: the existing Excerpts | Data points layer; a data point card shows its significance and, when a consulted
  note informed it, a small "consulted" line with the link. Candidate clips review on the existing suggested-quotes
  card (`sw_accept_quote_suggestion` unchanged).
- **Honest limit**: per-source clip candidates are still chosen locally. The comparative, story-aware narrowing happens
  in Outline (§5.3), where there is a story to narrow for. That is the compromise that serves both the manual flow
  (clips appear as soon as a transcript is analyzed) and the ideal flow (the outline picks the few).
- **Interviewer**: `tw_speakers.role` (`interviewer` | `subject`, nullable), set from the speakers menu; Analyze skips
  interviewer units for findings and clips. Until set, the prompt names the reporter's own profile name as the likely
  interviewer.
- Files: `extraction-prompt.ts` (framing rewrite + merged schema), `extraction-run.ts` (`loadExtractionContext` adds
  accepted findings; writes clips and notes), `extraction-ai.ts` (tools + sources), `quote-run.ts` (`proposeQuotes`
  body reused for parsing; the per-theme entry point goes), `context-run.ts` (shrinks to the dismiss action),
  `prompts.ts` (one `analyze` guide replaces `extraction` + `quote_quality` + `context`), the source workspace toolbar,
  Setup tab (notes list stays, auto-gather and Refresh go).

### 5.2 Synthesize — one project-wide run, written per question; replaces Themes

- **Grain** (revised in review): one run over **every** accepted finding in the project, not one per question. Eight
  topic-area questions would otherwise be eight siloed answers, and the tensions a reporter most wants (the governor's
  "no confirmed fatalities" against the county's confirmed death) span questions. The output is a section per question
  plus cross-cutting tensions and gaps; a single section can be revised alone (the run is told which section to redo
  and shown the rest as fixed).
- **Where**: the Setup tab's question list becomes a **Questions** tab with a **Synthesize** button; each question's
  page shows its section, every cited finding expandable to its passage; History shows versions.
- **Model**: `sw_project_syntheses (project_id pk, current_version)` + `sw_project_synthesis_versions` (insert-only,
  `body jsonb`, `saved_via person | model`), the pieces pattern with one SQL writer that checks the base version. Body:
  `sections[]` keyed by question id, each with `findings[]` (statement, certainty `established | contested |
uncertain`, cites data point ids), `gaps[]`; then project-level `tensions[]` (statement, the ids on each side) and
  `narrative[]` (details worth keeping, with spans). The model cites data points by number; code maps to ids; a
  statement citing nothing is dropped. `general` findings (no question) get their own section.
- **Input**: every accepted finding with its question label, the current synthesis as the base to revise (never
  overwrite), and a transcript-search + read-passage tool so it can check a claim against the tape. Run kind
  `synthesis`; progress streamed as NDJSON like extract, since tool rounds can run long.
- **Themes**: Review themes and assign-on-accept are removed; `theme_assign` / `theme_review` slots retire; the Themes
  tab and theme pages stay read-only where themes exist (Isaias), hidden where none do. Nothing is deleted.

### 5.3 Outline inside the piece editor, as blocks — no new chrome, no new tables

- **Shape** (revised in review): a third block type, `beat`, in the existing piece body (`pieces.ts`'s `PieceBlock`,
  `parsePieceBody`): `{ id, type: "beat", text, cites: dataPointId[], verify: boolean, tape?: { sourceId, startMs,
endMs } }`. A beat is narration not yet written; `text` says what the beat does ("Open on Rosado cutting the tree;
  establish Pace; two fatalities, attributed"). `tape` is a transcript passage worth considering that is not an excerpt
  yet, rendered as a playable range the reporter can cut by hand. Actualities the outline chooses are ordinary
  actuality blocks placed where the outline wants them. The first beat is the angle, labelled so by the editor; no
  `angle` column. A second piece from the same angle starts from "Copy outline from…", a version copy.
- **Length**: `computePieceLength` counts beats at zero (or an estimate the reporter types), so "0:12 of 0:53" reads
  honestly while outlining. The Pieces list says "Outlined", "Drafted", "Written by hand".
- **Run**: the empty-piece state offers **Outline** beside Draft with AI. Input = the current synthesis (or, with none,
  the accepted findings), every accepted excerpt in the project with words and length, the direction; tools =
  transcript search and read-passage; output = beats and actuality placements by number, excerpts chosen
  comparatively (a clip earns a place for what narration cannot do; few is normal; say what it adds). This is where
  "which of the 90 accepted clips serve this story" is answered.
- **Draft** expands beats in place: each beat becomes a narration block written from its cites, the actuality blocks
  stay, `[CHECK: …]` for a `verify` beat the material does not settle. The same tools are available. With no beats,
  today's draft-from-material path runs. The standards block in `DRAFT_FRAMING` stays; the rest shrinks. Versions, undo,
  History, the assistant's existing block capabilities and the derived "edited by the assistant" markers all work
  unchanged because an outline is just a version.

### 5.4 Assistant and retrieval

- New capabilities: `sourcework.project.searchTranscripts` (over `tw_search`, project-scoped, RLS-safe),
  `sourcework.source.readPassage` (units around a hit), `sourcework.project.readFindings` (accepted findings and
  syntheses). The same three are the function tools in §5.2 and §5.3. The assistant in a piece gets them.

### 5.5 Prompting

- Each operation: one framing of ~150 words (objective, three to five principles) plus one editor guide; structure
  stays in the schema and the parser. Slots become `analyze`, `synthesis`, `outline`; `draft` keeps its framing and
  the format guide. The live quote guide v1 is superseded by the `analyze` guide. Factual integrity, attribution,
  exact wording and the AP-style writing standards are kept verbatim where they already exist.
- Setup's four-step "standing" (`run-state.ts`) stops prescribing an order; it reports what exists.

### What stays, what is retired, what is incremental

- **Preserved**: everything listed at the end of §1; all existing rows (`story` points, themes, theme-scoped
  suggestions, context notes) stay readable.
- **Incremental** (no new artifact): 5.1, 5.4, 5.5.
- **Redesign** (new artifacts): 5.2, 5.3.
- **Retired**: the background pre-pass, per-theme quote runs, assign-on-accept, Review themes, three prompt slots.

---

## 6. Build order and migrations

Each slice is one PR, one migration applied to preview then production and recorded in `APPLIED.md`, a Resources
release note + guide updates via `private.rc_release_*`, a `docs/sourcework-analysis-design.md` §20 entry, and the
CLAUDE.md pointer; `npm run lint`, `typecheck`, `test`, `db:check` before each.

1. **Analyze source + interviewer + retrieval capabilities** (5.1, 5.4). Migration: `sw_data_points.significance`,
   bearing check admits `relevance = 'general'`; `sw_quote_suggestions.theme_id` nullable (+ FK/index change);
   `sw_context_note_points` link table; `tw_speakers.role`; `sw_analysis_runs.kind` gains `analyze`, `synthesis` and
   `outline` in one go, so slices 2–3 need as little schema as possible. New code: a shared function-tool loop for
   Responses calls that end in a strict schema (modelled on `lib/agent/chat.ts`'s loop; `context-ai.ts` already proves
   `web_search` + schema in one call).
2. **Project synthesis** (5.2). Migration: `sw_project_syntheses` + versions + writer function. Themes UI demoted the
   same slice.
3. **Outline as beats; Draft expands beats** (5.3). **No migration**: `beat` is a new block type in the jsonb body,
   validated by `parsePieceBody`; `computePieceLength` and the editor learn it.
4. **Retire** the pre-pass, assign loop and theme slots; remove dead code once slice 3 has run on a real project.

Reasoning effort stays `medium` by default; `high` for synthesis and outline is a dial to compare in §7, not a
decision made here.

Slice 1 is run against the two production projects (new runs only, never editing existing rows) before slice 2
starts, through §7.

---

## 7. Evaluation: side by side, against real material

- `scripts/sourcework-eval/` on the existing `vitest.eval.config.ts` pattern (`program-log-eval` is the model): reads
  production read-only with `SUPABASE_SECRET_KEY`, needs `OPENAI_API_KEY`, skips without them, not in `npm test`.
- **Fixtures** (by source id): Okaloosa County Storm Update (short briefing), 10-11 DeSantis Update (longest), Interview
  with James Teal (the real interview), Interview with Ivan Rosado 2 and Franklin Laritz 2 (never extracted, used in the
  real wrap).
- **Output**: for each fixture, `actual/<fixture>.current.md` (today's `extractCandidates` + per-theme quotes) and
  `actual/<fixture>.analyze.md` (slice 1), each listing findings with significance and spans, candidate clips with
  words, consulted URLs, and counts. Read blind side by side; nothing is scored automatically. Slice 2 writes each
  question's synthesis as markdown; slice 3 writes the outline. The existing trial screens remain the quick pairwise
  check for guide wording.
- What "better" looks like, stated in advance so the reading is honest: fewer findings per briefing, each one a claim a
  reporter would attribute on air; redundancy with other briefings noted rather than repeated; clips from Teal that
  include the character and moment lines above; a Rosado/Laritz analysis that surfaces the neighbour-helping lines the
  real wrap used; consulted URLs that explain something the transcript did not.

---

## 8. Assumptions carried into the plan

- No research question does not block Analyze; it prompts.
- Per-source clip candidates stay local (ceiling 5, no floor); comparative selection is the outline's job.
- A piece is the story; the outline is beats inside the piece body and can be copied to another piece.
- Synthesis is one project-wide artifact with a section per question, not one artifact per question.
- Existing data is never migrated or deleted; new behaviour applies to new runs.
- Each side-by-side read in §7 is recorded as a one-line verdict in the eval output directory, so judgments accumulate
  even without a gold set.
