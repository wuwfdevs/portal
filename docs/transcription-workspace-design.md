# Transcription Workspace — Product & Engineering Design

Status: **proposal for discussion** — no code implements this yet.
Scope: the first substantive tool in the WUWF Tools Portal, at `/transcription`.

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
export, so that *reading* the interview is also *navigating* it, and *selecting
text* is also *cutting audio*.

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
   drift actually becomes a problem.

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
This tool absorbs the *transcribe/edit* half of the first and, over time, the
entirety of the second — the cross-project clip/search views in Phase 5 *are*
the clip library, grown organically rather than built as a separate app.
Recommendation: register this as a new tool (`transcription`), narrow the
Remote Interview description to recording/capture when that milestone starts,
and plan for Clip Library to be retired or pointed at this tool's search view.
(Decision for the product owner; nothing here blocks on it.)

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
with wrong attribution can be reassigned inline (diarization *will* make
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

### E. Export (the handoff)

**Export WAV** renders the clip server-side from the *original* source media —
never from a lossy intermediate — as 48 kHz / 16-bit PCM WAV (channel layout
matching source), with a predictable filename
(`2026-07-22_reeves-interview_bridge-funding.wav`). The rendered file is kept
in storage so re-downloading doesn't re-render. No loudness normalization or
processing in v1 — producers master in their own chain; a clean, accurately
trimmed, full-resolution cut is the deliverable. (If WUWF later wants
−24 LUFS conformance on export, that's an additive flag, not a redesign.)

### F. Search & reuse (grows out of the same list)

There is no separate "archive." The project list *is* the archive:

- **All projects are visible to all tool members by default.** This is the
  single most important decision for the institutional-memory goal — a private-
  by-default model would strangle the archive at birth. (Small trusted
  newsroom; the portal already gates who is a member.)
- The search box on the project list searches titles, notes, speaker names —
  and, in Phase 5, the full transcript text and clips via **hybrid search**:
  keyword full-text search *and* semantic (vector) search over embeddings,
  merged into one ranked result list. Keyword search answers "find the name /
  the exact phrase"; semantic search answers "find where they talk about
  flood insurance" even when nobody said those words. A transcript hit
  deep-links into the project with the playhead at that moment.
- One search box, no mode toggle — hybrid by default, keeping the interface
  calm. Results show snippet, speaker, project, and timestamp.
- A **Clips** view lists every clip across projects (filterable by speaker,
  project, date) — reuse surface for "I know we have the mayor saying this."

Both halves run inside Postgres (FTS + pgvector, which Supabase ships
natively) — still no separate search service.

## 4. Screens

Four screens, one of which is a panel:

1. **Project list** (`/transcription`) — tool home. New-project button, search
   box, rows showing title / date / duration / speakers / status / clip count.
   Doubles as the archive as it grows. Later gains the Clips tab.
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

-- Semantic search unit (Phase 5). Segments are too granular to embed well
-- (a few seconds of speech is a noisy embedding), so transcripts are chunked
-- into overlapping ~45-second / ~250-token windows with speaker labels
-- inlined, each carrying its time range for deep-linking into the workspace.
tw_chunks
  id uuid pk
  project_id uuid not null references tw_projects on delete cascade
  start_ms / end_ms integer not null
  text text not null                   -- "Reeves: … \n Dana: …" window
  embedding vector(1536) not null
  stale boolean not null default false -- set when overlapping segments are edited
  -- + HNSW index on embedding (cosine); index (project_id)
```

Notes and deliberate omissions:

- **No `tw_media_assets` table** — one immutable source file per project makes
  it columns on the project. If a proxy/derived-audio need appears later
  (see §6), that's the moment to introduce the table.
- **No transcript-versioning / revision history.** Mutable segments, undo is a
  client concern within a session. Version history is real complexity for a
  problem (collaborative edit conflicts) a six-person newsroom rarely has.
- **Word timings go stale on edited segments** (`text_edited` flags it). That's
  acceptable: timings are only *anchors* for clip creation, and clip
  boundaries are always audition-and-nudge. No re-alignment machinery.
- **RLS** (same migration): helper `has_transcription_access(uid)` — an active,
  non-revoked `tool_access` row for the `transcription` tool, or
  `is_administrator(uid)`. Members get select/insert/update on all tool
  tables (shared-workspace model, per §3F); **delete** on projects restricted
  to `created_by` or administrator. Storage bucket (`transcription-media`,
  private) gets matching `storage.objects` policies; all media access via
  short-lived signed URLs.

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
MXF-from-a-field-kit ever shows up, *that's* when a proxy step and the
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
  Phase 5 ships, on a backfill action for existing projects), the transcript
  is sliced into overlapping ~45-second windows with speaker names inlined
  (`tw_chunks`). Chunk-level embeddings capture *topics*; segment-level ones
  would capture noise.
- **Clips** embed `title + excerpt` at creation/edit — a clip's title is
  exactly the kind of editorial summary ("mayor commits to bridge funding")
  that semantic search thrives on.
- **Staleness over eagerness.** Editing a segment marks overlapping chunks
  `stale`; a debounced server action re-chunks and re-embeds the affected
  window after edits settle. Most corrections (spelling, names) barely move an
  embedding, so stale results in the interim are fine — this avoids an
  embed-per-keystroke pipeline.

### Clip preview and export

- **Preview** is just the existing player: seek to `start_ms`, play, stop at
  `end_ms`. Zero infrastructure, sample-accurate *enough* for auditioning.
- **Export** runs ffmpeg (via `ffmpeg-static`, no system dependency) in a
  Node route handler / Server Action:
  `ffmpeg -ss <in> -i <signed-url> -t <dur> -ar 48000 -c:a pcm_s16le out.wav`.
  Input seeking over a signed URL uses HTTP range requests, so cutting 20
  seconds out of a 2 GB video reads megabytes, not gigabytes, and completes in
  seconds — comfortably inside serverless limits. Result is written to storage
  (`export_storage_path`) and handed back as a download.

### What's deliberately *not* in the architecture (challenged assumptions)

| Implied/expected | Recommended instead | Why |
|---|---|---|
| Waveform editor | Transcript-first navigation; nudge-and-audition trimming | A real waveform needs full-file decode or a server peaks pipeline — heavy — and the transcript is the better navigation surface for *speech*. Revisit as a clip-panel-only mini-waveform if trimming feels blind in practice. |
| Multi-span clips / internal edits | Contiguous clips only | Assembly is DAW territory and editorially sensitive; contiguous quotes are what actualities overwhelmingly are. |
| Transcode/proxy pipeline | Constrain upload formats; ASR ingests video natively | Deletes an entire subsystem. |
| Job queue / worker | Provider webhooks + status columns + polling | One async step doesn't justify orchestration. |
| Dedicated search service for semantic search | Hybrid FTS + pgvector inside Postgres, one RPC | Both retrieval modes live in the database we already run; embeddings are the only external call, and they're batched and cheap. |
| Private-by-default projects | Shared-by-default within the tool | The archive goal dies without it; portal membership is the trust boundary. |
| Loudness processing on export | Clean full-res trim only | Producers master downstream; add a normalize flag later if asked. |

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
   *Usable as: a shared, permissioned interview locker.*
2. **Transcription pipeline** — provider adapter, kickoff on upload
   completion, webhook handler, processing/failed/retry states, read-only
   transcript view with click-to-seek and follow-along highlighting.
   *Usable as: searchable-by-eye transcripts bound to audio.*
3. **Speakers & correction** — speaker naming flow, per-segment reassignment,
   inline text editing with autosave, segment split/merge.
   *Usable as: production-quality transcripts.*
4. **Clips & export** — text-selection → clip, clip rail, preview, nudge
   trimming, ffmpeg WAV export to storage, download.
   *This is the finish line for the core promise.*
5. **Search & reuse** — hybrid keyword + semantic search: pgvector migration
   (`tw_chunks`, clip embeddings, hybrid-search RPC), embedding adapter,
   chunking on transcription-complete plus a backfill for existing projects,
   staleness-based re-embedding on edit; one search box over
   transcripts/clips/titles/speakers with results deep-linking into the
   workspace at a timestamp; cross-project Clips view. *The archive emerges.*

Phases 1–2 prove the riskiest integration (upload → provider → webhook) before
any editing UI exists. Phase 4 before 5 because clips must exist before a clip
library means anything.

---

*Once direction is agreed, Phase 1 starts with the migration and route
scaffolding on this branch.*
