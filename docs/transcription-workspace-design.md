# Transcription Workspace — Product & Engineering Design

Status: **Phases 1–4 shipped. Phase 5 is the current milestone.**
Scope: the first substantive tool in the WUWF Tools Portal, at `/transcription`.

Revised 2026-07-28: §3F rewritten (search results and click-through), §3G added
(context on a recording), §5 extended, and Phase 5 split into 5A/5B. Everything
before §3F describes shipped behavior.

---

## 1. The problem we're solving

A reporter comes back from an interview with a 40-minute recording. Between that
recording and a finished radio piece sits a chain of tedious, error-prone work:

- Listening back in real time (or scrubbing blindly) to find the good quotes.
- Getting a transcript from a consumer tool, then losing the link between the
  transcript text and the audio timeline the moment it's exported.
- Cutting actualities in a DAW by ear, re-finding moments the reporter already
  found once in the transcript.
- Saving clips to a shared drive with filenames like `mayor_final_v2_USE_THIS.wav`,
  where their context (who said it, when, in what interview) evaporates.

The core insight: **the transcript and the audio are the same object viewed two
ways**, and every existing workflow severs that link at least once. The
Transcription Workspace keeps text and time bound together from ingest to
export, so that _reading_ the interview is also _navigating_ it, and _selecting
text_ is also _cutting audio_.

Secondary problem, longer-term: interviews are institutional memory that
currently decays on hard drives. If every interview flows through one workspace
with searchable transcripts and attributed clips, the archive builds itself as
a by-product of daily work — no separate archival workflow required.

What this tool is **not**: a DAW, a multitrack editor, a publishing system, or
a general media asset manager. It ends at "production-ready WAV in the
producer's hands."

## 2. Product model

**The project is the central object**, as suspected — one project per interview
or recording session. But three deliberate constraints keep the model simple:

1. **One source media file per project.** A session that produced three files
   is three projects. Multi-file projects force questions (cross-file clips?
   file ordering? merged transcripts?) whose answers add complexity that a
   small newsroom will almost never use. If a reporter truly needs files
   joined, that's a pre-concatenation job, not a data-model feature.

2. **Clips are non-destructive references, not audio files.** A clip is a
   contiguous `[start, end]` range on the project timeline plus a title and the
   transcript excerpt it covers. Audio is rendered only on export. This makes
   clips free to create, trivially editable, and always traceable to source.

3. **Speakers are per-project labels, not a global contacts table.** Diarization
   yields "Speaker 1/2"; the reporter renames them ("Mayor D.C. Reeves"). A
   global people/entity table is a real archival feature — but consistent
   naming plus full-text search gets 90% of the value ("find everything Reeves
   said") with none of the entity-resolution complexity. Revisit only if naming
   drift actually becomes a problem. (§3G considered and cut a role/title field
   on speakers: the project's background text already supplies "Reeves is
   mayor" without a second field to leave blank.)

The durable object hierarchy:

```
Project (one interview)
├── source media        (one file, uploaded, immutable)
├── transcript          (ordered segments, mutable text, timed)
│   └── segments        (speaker + start/end + text + word timings)
├── speakers            (diarization label → human name)
└── clips               (title + [start,end] + excerpt + exported WAV)
```

### Relationship to the existing tool registry

The seed registry lists **Remote Interview** ("Record, transcribe, and edit…")
and **Shared Clip Library** ("Search and reuse approved interview excerpts…").
This tool absorbs the _transcribe/edit_ half of the first and, over time, the
entirety of the second — the cross-project clip/search views in Phase 5 _are_
the clip library, grown organically rather than built as a separate app.
Recommendation: register this as a new tool (`transcription`), narrow the
Remote Interview description to recording/capture when that milestone starts,
and plan for Clip Library to be retired or pointed at this tool's search view.
(Decision for the product owner; nothing here blocks on it.) _Settled: the
`transcription` row shipped in Phase 1 and the Shared Clip Library row was
retired — Phase 5's Clips tab and search are what replaced it._

## 3. Primary user workflows

### A. Ingest → transcript (mostly automatic)

1. Reporter clicks **New project**, drags in a file, gives it a title (and
   optionally an interview date / notes). Upload runs with a progress bar;
   large files use resumable upload.
2. On upload completion, transcription + diarization start automatically as a
   single background step — there is no "now click transcribe" decision,
   because there is no scenario where you upload and don't want a transcript.
3. The project shows a calm processing state ("Transcribing — about 2 minutes
   for a 40-minute recording"). The reporter can leave; the project list shows
   status. No email/notification machinery in v1 — processing is minutes, not
   hours.

### B. Speaker identification (one minute of work, done once)

When the transcript arrives, the workspace shows each diarized speaker with a
couple of representative snippets ("play a moment where Speaker 2 talks").
The reporter types real names once; every segment updates. Individual segments
with wrong attribution can be reassigned inline (diarization _will_ make
errors at cross-talk). Speaker names feed search and clip attribution, so this
step is lightly encouraged (a subtle "2 unnamed speakers" nudge) but never a
gate.

### C. Review & correction (reading, with the audio following along)

The transcript is the primary surface — a readable, speaker-labeled document,
not a data grid.

- Click any word → playhead jumps there. Press play → the current segment
  highlights and follows along.
- Click into a segment's text to correct it inline (names, jargon, mishears).
  Edits save automatically. Segments can be split/merged for diarization
  cleanup.
- Keyboard-first where it counts: play/pause without leaving the text, jump
  back 5 seconds to re-hear a phrase.

We deliberately do **not** build a free-form document editor. Segment-scoped
editing preserves the text↔time binding that everything else depends on. (Most
corrections are spelling and names; word-level timing inside an edited segment
degrades gracefully to approximate, which is fine because clip boundaries are
audition-and-nudge anyway — see D.)

### D. Clip creation (select text → cut audio)

1. Reporter selects a span of transcript text → **Create clip**.
2. A clip panel opens: title (required — "what is this quote?"), the excerpt,
   and preview playback of exactly that range.
3. Boundaries snap to word timings, then fine-tune with nudge controls
   (±50 ms / ±250 ms on in/out points) while auditioning — the standard way
   radio cuts are tightened. No waveform editor in v1 (see §6, challenges).
4. Clips are contiguous ranges only. Internal edits — cutting an "um" out of
   the middle, assembling a Franken-quote — are DAW work (and editorially
   sensitive besides). If a producer needs two quotes, they make two clips.
5. **Clips are visible on the transcript, and the two panels point at each
   other.** Words that already belong to a clip are underlined, so scanning a
   transcript shows what's been used without cross-referencing the rail.
   Clicking clipped text opens that clip in the rail; hovering or focusing a
   card marks its words; selecting from either side tints the passage. Because
   clips are stored as time ranges, the marks are recovered by time
   (`resolveClipCoverage`) rather than stored — which means they follow a clip
   as it's trimmed, survive splits and merges, and are only as precise as the
   word timings under them: on an edited line, where timings are interpolated,
   the mark shows roughly the right passage. The clip's in/out points remain
   the truth about the audio. Underline and tint are separate channels on
   purpose: overlapping clips are normal (a tight pull taken from inside a
   longer answer), so "clipped" has to survive stacking, and a click on
   overlapping clips resolves to the shortest one covering the word.

### E. Export (the handoff)

**Export WAV** renders the clip server-side from the _original_ source media —
never from a lossy intermediate — as 48 kHz / 16-bit PCM WAV (channel layout
matching source), with a predictable filename
(`2026-07-22_reeves-interview_bridge-funding.wav`). The rendered file is kept
in storage so re-downloading doesn't re-render. No loudness normalization or
processing in v1 — producers master in their own chain; a clean, accurately
trimmed, full-resolution cut is the deliverable. (If WUWF later wants
−24 LUFS conformance on export, that's an additive flag, not a redesign.)

**Export all clips** hands the whole rail over at once, as a single zip
(`2026-07-22_reeves-interview_clips.zip`) containing every clip under its
usual export filename. Clips that were never exported individually are
rendered on the way past and kept in storage exactly as a single export is,
so nothing is rendered twice. It streams from an API route rather than a
Server Action — the result is a file, not data, and streaming keeps peak
memory at one clip's WAV however many clips a project holds. An
unreasonably large set is refused with an explanation rather than queued
(`MAX_CLIPS_ZIP_DURATION_MS`); the per-clip export is always still there.

**The transcript leaves as text.** "Copy transcript" and "Download .txt"
produce the same speaker-grouped, timestamped reading the workspace shows.
Both are built in the browser from the segments on screen, so a transcript
copied straight after a correction or a speaker rename carries it — and
there is no second, server-side formatter to drift out of step with the
rendering.

### F. Search & reuse (grows out of the same list)

There is no separate "archive." The project list _is_ the archive:

- **All projects are visible to all tool members by default.** This is the
  single most important decision for the institutional-memory goal — a private-
  by-default model would strangle the archive at birth. (Small trusted
  newsroom; the portal already gates who is a member.)
- The search box on the project list searches titles, notes, speaker names —
  and, in Phase 5, the full transcript text and clips via **hybrid search**:
  keyword full-text search _and_ semantic (vector) search over embeddings,
  merged into one ranked result list. Keyword search answers "find the name /
  the exact phrase"; semantic search answers "find where they talk about
  flood insurance" even when nobody said those words.
- One search box, no mode toggle — hybrid by default, keeping the interface
  calm.

Both halves run inside Postgres (FTS + pgvector, which Supabase ships
natively) — still no separate search service.

**One ranked list, not per-kind lists.** A search returns three kinds of
thing, and the badge on each result says which — in the reporter's words, not
ours:

| Badge             | What it is                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **Clip**          | Someone saved this passage and gave it a title.                                                |
| **In transcript** | Nobody clipped this — it's a stretch of transcript (one ~45s window) where the query comes up. |
| **Project**       | Nothing in the audio matched; the recording's own title or background did.                     |

They answer the same question ("where do we have someone saying this?"), so
they rank against each other in a single list rather than in three columns
the reporter has to check separately. Clips get a modest ranking boost: a
clip exists because a human already decided that passage was worth keeping,
which is a stronger relevance signal than any embedding.

A naming note, since this doc got it wrong first: the middle kind was called
a "moment" through two revisions. It read fine here, next to a paragraph
explaining it, and meant nothing at all as a bare one-word badge in the UI —
which is where it actually had to work. Label things the way someone who has
not read this document would.

**What a result has to show.** A search hit is the _only_ thing the finder
sees before deciding whether to chase a quote, so a result carries the
project's context (§3G), not just the matched text:

> **Clip** · "We can't keep patching that bridge"
> Reeves — 14:22 · _Escambia County Commission, March meeting_ · 14 Mar 2026
> Monthly commission meeting; bridge repair funding was the third agenda item.
> Reeves is the mayor, Ford the county administrator.

That third line is the project's background text, and it is the whole reason
the result is legible to someone who wasn't there.

**Everything deep-links back to the moment.** Every result — and every clip
anywhere in the tool — links to `/transcription/<project>?t=<ms>`, which opens
the workspace with the playhead at that timestamp, the segment scrolled into
view and highlighted. A clip result adds `&clip=<id>`, which additionally
opens that clip in the rail so it can be re-trimmed or re-exported on the
spot. A clip is never a dead end: the project it came from is always one click
away, because "what else did they say about this?" is the next question every
single time.

A **Clips** view (a tab on the tool home) lists every clip across every
project — filterable by project, speaker, and date — for the case where the
reporter is browsing rather than searching: "I know we have the mayor saying
something about this."

### G. Context (what a resurfaced quote has to carry)

Phases 1–4 optimized for the reporter who was _in the room_ — they remember
the interview, so a title and a speaker name are enough. Search inverts that.
The person who finds a quote from a county commission meeting eighteen months
later is usually not the person who recorded it, and a transcript that reads
perfectly to its author is close to unusable to a stranger. They need to know
what the recording _was_: whose meeting, what was on the agenda, who the
voices are, why WUWF was there.

**The field for that already exists.** `tw_projects.description` is free-form
text on the project, and since a project holds exactly one recording and one
transcript (§2), it is already "a description of the transcript." Phase 5 adds
no context columns at all. What it fixes is that the field is currently
inert:

1. **It is write-once.** `createProject()` is the only code that has ever
   written it, so the background gets typed at upload — before anyone has
   listened, when the reporter is watching a progress bar — or never. Phase 5
   adds `updateProjectDetails()` so title, date, and background are editable
   from the workspace, which is where a reporter is sitting when they actually
   learn what the recording was.
2. **It is never shown where a stranger needs it.** It appears on the project
   list and the project header, and nowhere else — not on a clip, not on a
   search result. Every result card in §3F carries it.
3. **It is not in the index.** It joins the keyword index alongside transcript
   text and clip titles, and it becomes the provenance header prepended to
   every chunk before embedding (§6) — so a passage reading "we can't keep
   patching it" is retrievable by "county commission bridge maintenance"
   because the _project_ said so even though the passage didn't.

That last point is the honest argument for filling the field in: background
text is not decoration, it is what makes everything recorded that day
findable.

**Deliberately not built**, having been proposed and cut:

- _Structured provenance_ (`recording_type`, `location`, `usage_terms`). An
  enum that defaults to "interview" is quietly wrong on every meeting someone
  forgets to change, and a confidently wrong label is worse than prose. Titles
  and background already carry this, and search reads prose fine.
- _Speaker roles_ (`role_title` on `tw_speakers`). Attribution genuinely needs
  "Mayor of Pensacola" — but a background that reads "Reeves is mayor, Ford is
  county administrator" supplies it without a second field to leave blank.
  Revisit if result cards feel anonymous in practice; it is one additive
  column.
- _Moment notes_ (`tw_notes`) and _per-clip notes_ (`tw_clips.context_note`).
  Context pinned to a time range is a table, an anchoring model, inline
  rendering, and overlap logic against search hits — for annotating moments
  that, in this tool, are one gesture away from simply being clips with
  titles. A required clip title is already an editorial summary of the moment.
- _Topic tags._ A tag vocabulary in a six-person newsroom decays into three
  people's private taxonomies within a year, and semantic search is precisely
  the feature that makes them unnecessary.

The through-line: **one free-text field, made live, shown everywhere, and
indexed** beats four structured ones that are mostly blank. If reuse later
proves that a specific field is being asked of the prose over and over, that
is the evidence to add it — additively, one column at a time.

## 4. Screens

Four screens, one of which is a panel:

1. **Project list** (`/transcription`) — tool home. New-project button, search
   box, rows showing title / date / duration / speakers / status / clip count.
   Doubles as the archive as it grows. Phase 5 gives it two tabs —
   **Projects** and **Clips** (every clip across every project) — and turns
   the search box into the hybrid search over both, rendering a ranked result
   list in place of the table when a query is present.
2. **Project workspace** (`/transcription/[id]`) — the heart of the tool, one
   screen, three zones:
   - a persistent, compact **player bar** (play/pause, time, seek, speed),
   - the **transcript pane** (main column — read, correct, select),
   - a **clips rail** (side column — this project's clips, create/preview/
     export).
     Not tabs — the whole point is that transcript, playback, and clips are one
     coupled surface.
3. **Clip panel** — a drawer within the workspace (not a page) for
   title/trim/preview/export of one clip.
4. **Processing / error states** — rendered inside the same two screens
   (status on the list row, a full-pane state in the workspace while
   transcribing or on failure with a retry button). Not separate screens.

Phase 5 adds no new screen for context either: the project's title, date, and
background become editable in place in the workspace header. Context gets
captured next to the work — while the reporter is listening and actually knows
what the recording was — not on a form someone has to remember to go back to.

Admin needs no new screens: membership is portal `tool_access`, and there's
deliberately no tool-level settings surface in v1.

## 5. Data model

New migration(s); tables prefixed `tw_` in the `public` schema (Supabase
client/type-generation ergonomics strongly favor prefixed-tables-in-public
over a separate Postgres schema; the prefix keeps the tool's tables visually
distinct, which is what the "own schema" convention is really after).

```sql
create type tw_project_status as enum ('uploading','processing','ready','failed');

tw_projects
  id uuid pk
  title text not null
  description text                 -- reporter's notes, searchable
  interview_date date
  status tw_project_status not null default 'uploading'
  -- source media (one per project, folded in rather than a separate table)
  media_storage_path text          -- private bucket object
  media_content_type text
  media_size_bytes bigint
  media_duration_ms integer        -- known after transcription
  -- transcription pipeline bookkeeping (no separate jobs table in v1)
  transcription_provider_job_id text
  transcription_error text
  transcribed_at timestamptz
  created_by uuid not null references profiles(id)
  created_at / updated_at

tw_speakers
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  diarization_label text not null      -- provider's "A"/"B"/…
  display_name text                    -- null until the reporter names them
  unique (project_id, diarization_label)

tw_segments
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  speaker_id uuid references tw_speakers on delete set null
  position integer not null            -- ordering
  start_ms / end_ms integer not null
  text text not null
  words jsonb not null default '[]'    -- [{w,s,e}] word timings from ASR
  text_edited boolean not null default false
  search tsvector generated always as (to_tsvector('english', text)) stored
  -- + GIN index on search; index (project_id, position)

tw_clips
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  title text not null
  start_ms / end_ms integer not null
  excerpt text not null                -- transcript text at creation (denormalized, searchable)
  embedding vector(1536)               -- of title + excerpt; null until embedded (Phase 5)
  export_storage_path text             -- rendered WAV, null until first export
  exported_at timestamptz
  created_by uuid not null references profiles(id)
  created_at / updated_at

-- Context (Phase 5A) adds no columns at all: tw_projects.description is
-- already the free-text field, it just needs a writer, a place to show, and
-- an index. See §3G, including the structured fields considered and cut.

-- Keyword-search surface for the project's own metadata (Phase 5A), so a
-- project can rank as a result on its title and background alone.
tw_projects  + search tsvector generated always as
                 (to_tsvector('english', title || ' ' || coalesce(description,''))) stored
             -- + GIN on search

-- Semantic search unit (Phase 5B). Segments are too granular to embed well
-- (a few seconds of speech is a noisy embedding), so transcripts are chunked
-- into overlapping ~45-second / ~250-token windows with speaker labels
-- inlined, each carrying its time range for deep-linking into the workspace.
tw_chunks
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  start_ms / end_ms integer not null
  text text not null                   -- "Reeves: … \n Dana: …" window, as displayed
  embedding vector(1536)               -- null until embedded
  stale boolean not null default false -- set when overlapping segments are edited
  search tsvector generated always as (to_tsvector('english', text)) stored
  -- + HNSW index on embedding (cosine); GIN on search; index (project_id)

tw_clips     + embedding vector(1536)  -- of title + excerpt; null until embedded
             + embedding_stale boolean not null default true
             + search tsvector generated always as
                 (to_tsvector('english', title || ' ' || excerpt)) stored
```

The `text` a chunk stores is what the search result displays; the string that
gets _embedded_ is that text with a provenance header prepended, built from
the project's title, date, and background (§3G). Storing the raw window and
embedding the enriched one keeps result snippets clean while letting a chunk
be retrieved by facts stated nowhere inside it — the standard
contextual-retrieval trade, and free here because the header is built from
columns we already have.

Notes and deliberate omissions:

- **No `tw_media_assets` table** — one immutable source file per project makes
  it columns on the project. If a proxy/derived-audio need appears later
  (see §6), that's the moment to introduce the table.
- **No transcript-versioning / revision history.** Mutable segments, undo is a
  client concern within a session. Version history is real complexity for a
  problem (collaborative edit conflicts) a six-person newsroom rarely has.
- **Word timings go stale on edited segments** (`text_edited` flags it). That's
  acceptable: timings are only _anchors_ for clip creation, and clip
  boundaries are always audition-and-nudge. No re-alignment machinery.
- **RLS** (same migration): helper `has_transcription_access(uid)` — an active,
  non-revoked `tool_access` row for the `transcription` tool, or
  `is_administrator(uid)`. Members get select/insert/update on all tool
  tables (shared-workspace model, per §3F); **delete** on projects restricted
  to `created_by` or administrator. Storage bucket (`transcription-media`,
  private) gets matching `storage.objects` policies; all media access via
  short-lived signed URLs. `tw_notes` and `tw_chunks` follow the same
  member-scoped policy as the other sub-resource tables, in the migration that
  creates them.
- **The hybrid-search function is `security invoker`, not `security
definer`** — the opposite of the `private.*` authz helpers, and deliberately
  so. Those exist to read past RLS; this one must be _subject_ to it, so the
  policies on `tw_chunks`/`tw_clips`/`tw_projects` stay the enforcement
  boundary for search exactly as they are for every other read. It lives in
  `public` because it is called as a PostgREST RPC, which is safe precisely
  because it carries no elevated rights.

## 6. Architecture

Everything below follows one rule: **no new standing infrastructure** — no
worker service, no queue, no cron, no search service. The pipeline is
webhook-driven and the heavy lifting is delegated.

### Transcription: managed ASR behind a thin adapter

Self-hosting Whisper+diarization (WhisperX et al.) is an ops project a small
newsroom shouldn't own. Use a managed speech-to-text API that natively
provides **diarization + word-level timestamps + webhooks + video ingestion**
— AssemblyAI and Deepgram both qualify (order of $0.25–0.40 per audio hour;
a busy month at WUWF is lunch money). Recommendation: pick **one** (slight
lean: AssemblyAI, for diarization quality and a dead-simple async API) and put
it behind a ~50-line `TranscriptionProvider` interface (`start(url, webhook)`,
`parseWebhook(payload) → segments/speakers/words`) so swapping later is a
contained change, not a rewrite. API key is server-only, alongside the
existing `SUPABASE_SECRET_KEY` discipline (the embeddings API key, added in
Phase 5, follows the same rule).

Flow: upload completes → Server Action gives the provider a **short-lived
signed URL** to the source object plus a webhook URL → provider calls back →
route handler (`/api/transcription/webhook`, verified via provider signature +
job-id match) writes speakers/segments in one transaction and flips the
project to `ready`. Failure paths land in `status='failed'` +
`transcription_error`, with a retry action. The workspace **polls** project
status every few seconds only while a project is processing — no realtime
subscription infrastructure for a state that changes once.

Because both providers ingest video directly, **no server-side transcode step
exists at all** in v1. Correspondingly, v1 constrains uploads to
browser-playable formats (WAV, MP3, M4A/AAC, MP4/MOV-h264, WebM) so the
`<audio>`/`<video>` element can play the source natively. That constraint
covers essentially everything reporters actually produce, and deleting the
transcode pipeline is the single biggest complexity win in this design. (If
MXF-from-a-field-kit ever shows up, _that's_ when a proxy step and the
`tw_media_assets` table get built.)

### Upload

Browser → Supabase Storage directly (resumable/TUS via supabase-js for
multi-hundred-MB video), never through a Next.js server function. Project row
is created first (`status='uploading'`), so an abandoned upload is visible and
cleanable rather than an orphaned object.

### Embeddings & hybrid search (Phase 5)

Vector search stays inside the existing stack: **pgvector** (a first-class
Supabase extension) holds embeddings, and one Postgres function performs
hybrid retrieval — full-text rank and cosine-similarity rank merged with
reciprocal rank fusion (the standard Supabase hybrid-search pattern) — called
via a single RPC from a Server Component. No search service, no sync job.

Embedding generation mirrors the ASR decision: a managed embeddings API behind
a thin `EmbeddingProvider` adapter (`embed(texts[]) → vectors`). Default:
OpenAI `text-embedding-3-small` — cheap (an hour-long interview embeds for a
fraction of a cent), well-understood, 1536 dims. The adapter makes the
provider swappable, with one caveat worth stating: the vector column's
dimension is fixed at migration time, so a model change means a re-embed
migration — acceptable, since re-embedding the entire archive of a small
newsroom is minutes and pennies.

What gets embedded, and when:

- **Chunks, not segments.** After the transcription webhook lands (and after
  Phase 5B ships, on a backfill action for existing projects), the transcript
  is sliced into overlapping ~45-second windows with speaker names inlined
  (`tw_chunks`). Chunk-level embeddings capture _topics_; segment-level ones
  would capture noise.
- **With a provenance header.** The embedded string is the window prefixed
  with the project's title, date, and background text (§3G); the stored `text`
  stays raw for display. This is what makes "county commission bridge
  maintenance" find a passage whose words are "we can't keep patching it" —
  and it means a project whose background is filled in is measurably more
  findable than one whose isn't. It also means editing the background marks
  that project's chunks `stale`, exactly as editing a segment does.
- **Clips** embed `title + excerpt` at creation/edit — a clip's title is
  exactly the kind of editorial summary ("mayor commits to bridge funding")
  that semantic search thrives on.
- **Projects are indexed, not embedded.** A project ranks as a result on its
  title and background via full-text search alone. Embedding a background blob
  as its own vector would have it compete with the passages it describes for
  the same query, which is backwards — its job is to make _those_ retrievable,
  which the chunk header already does.
- **Staleness over eagerness.** Editing a segment marks overlapping chunks
  `stale`; a debounced server action re-chunks and re-embeds the affected
  window after edits settle. Most corrections (spelling, names) barely move an
  embedding, so stale results in the interim are fine — this avoids an
  embed-per-keystroke pipeline.

### Clip preview and export

- **Preview** is just the existing player: seek to `start_ms`, play, stop at
  `end_ms`. Zero infrastructure, sample-accurate _enough_ for auditioning.
- **Export** runs ffmpeg (via `ffmpeg-static`, no system dependency) in a
  Node route handler / Server Action:
  `ffmpeg -ss <in> -i <signed-url> -t <dur> -ar 48000 -c:a pcm_s16le out.wav`.
  Input seeking over a signed URL uses HTTP range requests, so cutting 20
  seconds out of a 2 GB video reads megabytes, not gigabytes, and completes in
  seconds — comfortably inside serverless limits. Result is written to storage
  (`export_storage_path`) and handed back as a download.

### What's deliberately _not_ in the architecture (challenged assumptions)

| Implied/expected                             | Recommended instead                                      | Why                                                                                                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waveform editor                              | Transcript-first navigation; nudge-and-audition trimming | A real waveform needs full-file decode or a server peaks pipeline — heavy — and the transcript is the better navigation surface for _speech_. Revisit as a clip-panel-only mini-waveform if trimming feels blind in practice. |
| Multi-span clips / internal edits            | Contiguous clips only                                    | Assembly is DAW territory and editorially sensitive; contiguous quotes are what actualities overwhelmingly are.                                                                                                               |
| Transcode/proxy pipeline                     | Constrain upload formats; ASR ingests video natively     | Deletes an entire subsystem.                                                                                                                                                                                                  |
| Job queue / worker                           | Provider webhooks + status columns + polling             | One async step doesn't justify orchestration.                                                                                                                                                                                 |
| Dedicated search service for semantic search | Hybrid FTS + pgvector inside Postgres, one RPC           | Both retrieval modes live in the database we already run; embeddings are the only external call, and they're batched and cheap.                                                                                               |
| Private-by-default projects                  | Shared-by-default within the tool                        | The archive goal dies without it; portal membership is the trust boundary.                                                                                                                                                    |
| Loudness processing on export                | Clean full-res trim only                                 | Producers master downstream; add a normalize flag later if asked.                                                                                                                                                             |

### Fit with portal conventions

Route segment `src/app/(portal)/transcription/`, gated by
`requireActiveProfile()` + `hasToolAccess` (redirect to dashboard without a
grant). All mutations are Server Actions using the RLS server client; the
admin client is untouched. New env vars: ASR provider API key + webhook
secret, documented in `.env.example`. Tool registry gains a `transcription`
row (`status='in_development'`, `default_access='invite_only'`). Pure logic —
time formatting, filename generation, segment split/merge, clip-boundary
snapping, webhook payload parsing — gets colocated Vitest tests per the
existing pattern.

## 7. Phased implementation plan

Each phase ships something a reporter can actually use; each is roughly a
standalone PR-sized-to-a-few-PRs milestone.

1. **Foundation** — migration (tables + RLS + storage bucket/policies),
   registry row, route group with access gating, project list, new-project
   flow with resumable upload, project page with native media playback.
   _Usable as: a shared, permissioned interview locker._
2. **Transcription pipeline** — provider adapter, kickoff on upload
   completion, webhook handler, processing/failed/retry states, read-only
   transcript view with click-to-seek and follow-along highlighting.
   _Usable as: searchable-by-eye transcripts bound to audio._
3. **Speakers & correction** — speaker naming flow, per-segment reassignment,
   inline text editing with autosave, segment split/merge.
   _Usable as: production-quality transcripts._
4. **Clips & export** — text-selection → clip, clip rail, preview, nudge
   trimming, ffmpeg WAV export to storage, download.
   _This is the finish line for the core promise._
5. **Search & reuse** — split in two, because half of it needs no new
   external dependency and half of it does:

   **5A — Context & the clip library.** Context per §3G: an
   `updateProjectDetails()` action making title/date/background editable in
   the workspace, and that background carried onto every clip and every search
   result. Plus the cross-project **Clips** tab; deep-linking (`?t=`, `&clip=`)
   so every clip and every hit opens the workspace at that moment; and keyword
   (Postgres FTS) search across transcripts, clips, and project metadata,
   rendering the result list of §3F. _Usable as: the clip library — searchable
   by words, with every quote carrying the story of the recording it came from
   and a way back to it._

   **5B — Semantic search.** pgvector, `tw_chunks`, the embedding adapter and
   its API key, chunking on transcription-complete plus a backfill action for
   the existing archive, clip embeddings, staleness-based re-embedding, and
   the RRF hybrid RPC that merges vector hits into the ranking. The search box
   does not change; it gets better. _The archive emerges._

Phases 1–2 prove the riskiest integration (upload → provider → webhook) before
any editing UI exists. Phase 4 before 5 because clips must exist before a clip
library means anything. 5A before 5B for the same reason one more time: 5A is
where the result list, the deep-link, and the Clips view are designed and
proven against real use, so 5B only has to add a ranking signal rather than a
feature — and 5A's context fields are the input that makes 5B's embeddings
worth having.

---

_Phases 1–4 are shipped. Phase 5A starts with the context migration and the
Clips tab; 5B follows once an embeddings key is provisioned._
