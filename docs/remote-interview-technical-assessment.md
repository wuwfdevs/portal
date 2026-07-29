# Remote Interview — Existing-System & Technical-Options Assessment

Status: **Phases 1, 2, and the local-capture half of Phase 3 are done.**
Phases 1–2 (below) are the existing-system inventory and building-block
evaluation. Phase 3's throwaway prototype (`prototype/remote-interview-poc/`)
validated the two riskiest assumptions — chunked WAV assembly and OPFS
durability across a crash — with a real, runnable test; see "Phase 3 results"
near the end of this document for what was and wasn't covered. **Phase 4
(product implementation) is explicitly authorized and is the next step** —
start with the Foundation slice in `docs/remote-interview-design.md` §7.

Companion to `docs/remote-interview-design.md`, which describes the product.
Where the two disagree, this one is newer.

---

## Part 1 — Existing-system assessment

### Summary

The portal is small, coherent, and deliberately lean: **eight runtime
dependencies**, nineteen tables, two API route handlers. Its authentication,
authorization, audit, and UI conventions are directly reusable and should be
reused without modification. Its _media_ infrastructure, however, is much
thinner than it looks from the design documents, and four findings below
change what this tool has to build.

### What can be reused unchanged

| Capability                           | Where                                                                                                                                        | Notes                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff authentication                 | Supabase Auth, magic link; `src/lib/supabase/server.ts`                                                                                      | No change needed.                                                                                                                                  |
| Authorization                        | `src/lib/auth/authz.ts` — `requireActiveProfile`, `requireAdministrator`, `requireToolAccess(key)`, `hasToolAccess`                          | `requireToolAccess("remote-interview")` is the gate, exactly as the Transcription Workspace uses it.                                               |
| RLS predicate pattern                | `private.has_transcription_access` (`20260725000000_transcription_workspace_schema.sql:135-155`)                                             | Copy its shape for `private.has_remote_interview_access`: `security definer`, in `private`, `execute` to `authenticated`, no administrator bypass. |
| Staff/user records                   | `profiles`, `tool_access`, `tools`                                                                                                           | Host is a `profiles` row. Guests deliberately are not (Part 3).                                                                                    |
| Audit logging                        | `logAuditEvent()` (`src/lib/audit.ts`)                                                                                                       | Already the convention for privileged actions; session creation, link revocation, and deletion should use it.                                      |
| Portal navigation & tool registry    | `tools` table, `src/components/portal-nav.tsx`, `tool-card.tsx`, `tool-icon.tsx`                                                             | A `remote-interview` icon already exists (`tool-icon.tsx:8`).                                                                                      |
| UI primitives                        | `src/components/ui/` — Button, Badge, Input, Card, Alert, Table                                                                              | Sufficient for the staff-facing screens. The studio needs new components, but they are tool-specific, not design-system additions.                 |
| Read/write error conventions         | `unwrapRead()` (`src/lib/read-result.ts`), `failIfError()` / `failWith()` (`src/lib/editorial/action-result.ts`)                             | Non-negotiable per `CLAUDE.md` — a swallowed error renders as a healthy screen.                                                                    |
| ffmpeg in a route handler            | `src/lib/transcription/export.ts` + `src/app/api/transcription/projects/[id]/clips.zip/route.ts` (`runtime = "nodejs"`, `maxDuration = 300`) | Real, working precedent for server-side media processing on Vercel. Assembly follows it.                                                           |
| Private storage bucket + RLS pattern | `transcription-media` bucket and `tw_media_*` policies (`…transcription_workspace_schema.sql:217-262`)                                       | The bucket/policy shape is directly copyable.                                                                                                      |
| Signed URL access                    | `src/lib/transcription/storage.ts`                                                                                                           | `createSignedUrl` with TTL and `download` filename — reusable as-is for track downloads.                                                           |

### Four findings that change the plan

**1. There is no canonical audio-file table. The brief's premise does not hold.**

The brief says "the system already has a table or canonical model for audio
files" and warns against creating a parallel media model. Inspected: the
database has nineteen tables — `profiles`, `tools`, `tool_access`,
`access_requests`, `audit_events`, nine `ep_*`, and five `tw_*`. **None of them
is a media or audio-file table.**

Media metadata is _columns on a project row_:

```
tw_projects.media_storage_path / media_content_type
           / media_size_bytes  / media_duration_ms
```

This was a deliberate decision, not an omission —
`docs/transcription-workspace-design.md` §6 states that a `tw_media_assets`
table was considered and cut, and that it is what gets built "if
MXF-from-a-field-kit ever shows up."

The consequence is that the brief's instruction ("recording-specific tables may
reference those canonical audio records rather than duplicating file metadata")
has nothing to reference. Recommendation in Part 3: do **not** invent a generic
media abstraction now — that would be building the very thing the existing
design deliberately declined, on behalf of a second tool that doesn't need it
either. `ri_*` tables own the recording domain; `tw_projects` remains the
canonical representation of _a completed asset being worked on_, created at
handoff. If a third media consumer ever appears, extracting a shared media table
is a mechanical migration and a much better-informed decision than it is today.

**2. There is no resumable or chunked upload infrastructure. This correction
matters.**

`docs/transcription-workspace-design.md` §6 "Upload" says uploads are
"resumable/TUS via supabase-js." The shipped code is not:

```ts
// src/app/(portal)/transcription/new/new-project-form.tsx:84-86
const { error: uploadError } = await supabase.storage
  .from(...)
  .upload(storagePath, file, { contentType: file.type, upsert: false });
```

A single-request upload. No TUS, no `tus-js-client` in `package.json`, no
progress events, no resume. The doc describes an intention that was never
implemented.

So this tool cannot "reuse the existing resumable upload path" — there isn't
one. Everything about progressive, resumable, recoverable upload is new
construction. (This also corrects a claim made earlier in this project's
planning: Supabase Storage _supports_ TUS, but this repo does not use it.)

**3. There is no background job system, notification system, or error
reporting.**

`package.json` runtime dependencies in full: `@supabase/ssr`,
`@supabase/supabase-js`, `assemblyai`, `ffmpeg-static`, `next`, `react`,
`react-dom`, `server-only`. There is no queue, no worker, no cron, no Sentry, no
email/notification layer. Error handling is `console.error` plus the
`error.tsx` boundary; the one async pipeline (ASR) is handled with a provider
webhook and status columns, explicitly to avoid introducing orchestration.

Media assembly and upload-recovery sweeps must therefore be designed to run as
request-scoped work (a server action or route handler, ≤300 s) with status
columns and retry, or the tool must introduce the first job system in the repo.
Part 3 recommends the former.

**4. The migration history has a gap — characterized, not blocking, but worth
knowing before adding new migrations.**

Both hosted Supabase projects (`wuwf-tools-portal` and `wuwf-tools-portal-preview`)
have a migration named `harden_functions` applied, right after `rls_policies`,
in both — confirmed via `list_migrations` and its exact SQL pulled from
`supabase_migrations.schema_migrations`:

```sql
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_sign_in() from public, anon, authenticated;
revoke execute on function public.is_administrator(uuid) from public, anon;
grant execute on function public.is_administrator(uuid) to authenticated;
```

**No file in `supabase/migrations/` corresponds to this migration.** But its
content is not actually missing from the repo — it's already baked directly
into the committed `20260722120000_platform_schema.sql` (`set search_path =
public` on `set_updated_at` at line 100; the identical revoke/grant block at
lines 188-191). The most likely explanation: `platform_schema.sql` was edited
_after_ being applied to both hosted projects, to fold in a fix that had
already shipped live as its own separate `harden_functions` migration —
exactly the practice `CLAUDE.md`/`README.md` forbid ("never edit an
already-applied migration file; add a new one").

**Confirmed non-issues, so this isn't a live problem to fix under pressure:**
`get_advisors(type: security)` on the preview project shows nothing related
(only an unrelated, pre-existing "leaked password protection disabled" auth
toggle) — both hosted databases are correctly hardened. And because the fix
is baked into `platform_schema.sql`, a fresh `supabase db reset` locally
reproduces the same hardened end state, just via a different (and, per the
file's current content, more accurate) path than what actually happened on
hosted infrastructure historically.

**What's actually wrong is narrower than it first looks: an audit-trail gap,
not a functional or security one.** Both hosted projects' migration history
now contains a step (`harden_functions`) that no longer corresponds to
anything in git, and replaying `supabase/migrations/*.sql` from scratch would
never reproduce that exact two-step history — though it reproduces the same
final schema. **Deliberately not fixed here**: reconciling it (e.g. reverting
the edit and adding a proper `harden_functions.sql`) is pure churn with no
functional benefit given both live databases are already correct, and it's a
call worth making on purpose rather than as a drive-by fix while building an
unrelated tool. Flagging it here means whoever writes the `ri_*` migration
knows the history has this quirk, doesn't need to re-discover it, and doesn't
accidentally re-apply `harden_functions` believing it's missing.

### Gaps this tool must fill

Nothing existing covers: real-time communication, signaling, browser media
capture, progressive/resumable upload, durable client-side buffering, chunk
integrity verification, server-side assembly of many parts, cloud-side
recording, guest (account-less) identity, or per-participant operational status.
That is the entire surface of this tool, and it means "reuse the existing
infrastructure" applies to the portal shell and its security model — genuinely
valuable — but not to the recording stack.

---

## Part 2 — Building-block assessment

Evaluated against the brief's criteria: license, maintenance, browser support,
true isolated local recording, cloud backup, progressive upload, recovery, audio
quality, integration difficulty, deployment burden, and whether components can
be used without adopting a whole application.

### Real-time communication and cloud backup recording

The cloud backup requirement is the single biggest architectural constraint in
the brief, and it is worth stating why plainly: **you cannot record a call
server-side if the media never reaches a server.** Peer-to-peer WebRTC sends
audio directly between browsers. Adding a cloud backup therefore requires
putting a media server in the path — an SFU. This reverses the recommendation in
the existing design document, which chose plain P2P and explicitly rejected an
SFU.

| Option                            | License / model                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Daily**                         | Proprietary SaaS                 | **Recommended.** `raw-tracks` captures each participant's track separately to a customer-owned S3 bucket — exactly the backup this tool needs, not a composited mix — and emits an event JSON alongside the media carrying the timing data. They publish `daily-co/raw-tracks-tools` for alignment and compositing. Recording is billed per wall-clock minute rather than per track-minute. Managed, so no SFU to operate, and TURN is included. |
| **LiveKit Cloud** (SFU + Egress)  | Apache-2.0 core, managed service | Runner-up, and the fallback if Daily disappoints in trials. Track Egress also produces per-participant files and writes to any S3-compatible endpoint. Lost on alignment (see below), which is the dimension that matters most here.                                                                                                                                                                                                             |
| **LiveKit self-hosted**           | Apache-2.0                       | Rejected for now, retained as the no-vendor option. Adds a Go service, Redis, a TURN deployment, and an egress worker to operate — disproportionate for a small newsroom, per the brief's own constraint. Worth reviving only if procurement blocks a SaaS vendor outright.                                                                                                                                                                      |
| **mediasoup / Janus / ion-sfu**   | Various OSS                      | Rejected. All are SFU libraries requiring you to build and operate the surrounding service, plus a separate recording pipeline. This is the "large platform-engineering team" the brief warns against.                                                                                                                                                                                                                                           |
| **Plain P2P `RTCPeerConnection`** | Browser-native                   | Rejected _for this brief_, though it remains the simplest call layer. It cannot satisfy the cloud-backup requirement, and a separate "recorder peer" that joins each call to record is an SFU built badly.                                                                                                                                                                                                                                       |

### Why Daily over LiveKit — a recorded reversal

An earlier revision of this document recommended LiveKit Cloud, on the strength
of one argument: its core is Apache-2.0, the client code is identical
self-hosted, so you can leave without a rewrite. That argument does not survive
scrutiny, and a second consideration actively favours Daily.

**The lock-in argument was overstated.** The call layer in this design is small
— mint a token, publish the microphone, subscribe to peers, render tiles and
levels, handle connection events, start and stop the server-side recording. The
hard, genuinely novel work (lossless local capture, OPFS buffering, chunked
upload, resume, assembly, verification) is vendor-agnostic and untouched by a
swap. A switching cost that low should not drive the decision.

**Alignment favours Daily, and this is the deciding factor.** `livekit/egress`
issue #1139 — closed, with no documented workaround — reports that Track Egress
files are _not_ mutually aligned: `FileInfo.started_at` deviates, and the
deviation grows under poor network conditions. That is precisely the condition
this tool is built for. Daily's raw-tracks event JSON carries the timing data
needed to align its tracks, and the alignment tooling is published. Given that
§"Track synchronization" in the design document proposes using the backup as an
alignment anchor for the local masters, mutually-aligned backups are not a
nicety — they are load-bearing.

Cost did not decide it, and shouldn't: at the volume assumed below both vendors
are within a few dollars a month of each other and of zero.

Adopting Daily means adopting `@daily-co/daily-js` plus server-side REST calls
for room and recording control. That is a real addition to an eight-dependency
project and should be justified in the commit that introduces it, per
`CLAUDE.md`.

### Cost

Assume ~20 interviews per month, ~45 minutes, two participants: roughly 1,800
participant-minutes and 900 wall-clock recorded minutes. That sits inside
Daily's free allowance of 10,000 participant-minutes, with audio-only recording
at ~$0.005/min putting the recurring cost near **$5/month**. LiveKit's free tier
(5,000 WebRTC minutes, 50 GB egress) would likewise cover it.

Two caveats worth carrying: **do not run production on a free tier** — hard caps
stop rather than bill, and that failure would land mid-interview — and **carrying
video is what threatens an egress allowance**, not audio, which is one more
reason recorded video stays out of v1. These figures come from secondary sources;
both vendors' pricing pages return 403 to automated fetches, so confirm them
against the vendor before committing.

### Lossless local capture

The brief requires WAV or another lossless professional format, minimal
processing, and clean Audition import. The native `MediaRecorder` cannot do
this: it produces WebM/Opus in Chromium and Firefox, MP4/AAC in Safari — both
lossy, neither ideal for a master.

| Option                                                                    | License / status                                                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`extendable-media-recorder` + `extendable-media-recorder-wav-encoder`** | MIT, actively maintained (~100k weekly downloads, released within the last two months) | **Recommended.** A drop-in `MediaRecorder` replacement that emits real WAV. In Chromium it uses the native recorder in PCM mode and reparses; elsewhere it takes PCM from the Web Audio API. Keeps the familiar `timeslice` chunking model while producing lossless output. One maintainer — a genuine bus-factor concern, mitigated by MIT license and a small, forkable surface. |
| **Raw `AudioWorklet` → PCM → hand-written WAV/FLAC**                      | Custom                                                                                 | The fallback, and not a large amount of code. More control (and the honest path to FLAC), but more to get wrong at exactly the layer where bugs are silent. Worth prototyping alongside the library in Phase 3.                                                                                                                                                                    |
| **`libflac.js` / FLAC encoding in a worker**                              | Mixed OSS                                                                              | Worth having as an option rather than the default: FLAC is lossless and Audition imports it, at roughly half the bytes of WAV. Relevant to the bandwidth problem below. Defer unless the WAV bitrate proves impractical.                                                                                                                                                           |
| **`opus-recorder`**                                                       | Rejected                                                                               | Lossy. Fine for the cloud backup (which is Opus anyway) but not for the master.                                                                                                                                                                                                                                                                                                    |

**The bandwidth arithmetic has to be on the record**, because it is the main
cost of the lossless requirement. 48 kHz / 16-bit mono PCM is 96 KB/s — about
5.8 MB per minute, **~345 MB per participant-hour**, and ~0.77 Mbps of sustained
upstream _on top of_ the WebRTC call. On a guest's weak connection that is
precisely the situation the brief worries about. The resolution is in the
recovery model below: the local buffer decouples recording from upload, so the
upload is allowed to fall behind and catch up, including after the call has
ended. FLAC halves the figure if trials show it is needed.

### Durable local buffering

The brief requires that buffered data survive connection loss, refresh,
navigation, and tab closure, and that a guest be able to reopen the link on the
same device to resume.

| Option                                                                          | Support                                     | Verdict                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OPFS (Origin Private File System)** with `createSyncAccessHandle` in a Worker | Chrome/Edge 86+, Firefox 111+, Safari 15.2+ | **Recommended.** A real file system in the browser, built for exactly this: large binary files, high-performance writes from a worker, survives reload and tab close. Writing recorded chunks here first, then uploading from the same store, is what makes "your upload was interrupted, reopen this link" a real feature rather than a hope. |
| **IndexedDB**                                                                   | Universal                                   | The compatibility fallback. Workable for blob storage but slower and clumsier for large sequential writes. Keep as a fallback path for browsers where OPFS is unavailable, and treat unavailability of both as a preflight failure.                                                                                                            |
| **In-memory only**                                                              | —                                           | Explicitly rejected by the brief, and correctly: it is the single largest data-loss risk in this class of tool.                                                                                                                                                                                                                                |

Neither store is unlimited — both are subject to origin quota and eviction. The
preflight check must estimate available space against the expected session
length (`navigator.storage.estimate()`) and warn before the interview, per the
brief.

### Upload, resumability, and assembly

| Concern                         | Recommendation                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progressive upload              | **Independent per-part objects**, one Supabase Storage object per chunk under the participant's prefix, rather than one long-lived TUS upload. A stream being produced as it uploads has different failure modes from a file that already exists: per-part objects have no shared session state to lose when a tab dies, tolerate out-of-order arrival, and can be retried individually. |
| Resumable/multipart libraries   | `tus-js-client` / Uppy evaluated and **not adopted**. They solve resuming _one large known file_; here the file does not exist yet. Per-part objects plus the OPFS ledger give resumability without the dependency.                                                                                                                                                                      |
| Duplicate / out-of-order chunks | Handled by the schema, not by the transport: `unique (participant_id, sequence)` makes a duplicate submission an idempotent no-op, and ordering is a `order by sequence` at assembly.                                                                                                                                                                                                    |
| Integrity                       | A content hash per part, recorded on upload and verified at assembly; expected-part-count reconciliation before any track is labelled complete.                                                                                                                                                                                                                                          |
| Assembly                        | `ffmpeg-static`, already a dependency, in a `runtime = "nodejs"` route handler with `maxDuration = 300`, following the existing clip-export precedent. Concatenate parts in order, then rewrite the container — WAV parts need a corrected RIFF header for the same reason WebM parts need a remux.                                                                                      |

### Not adopted, and why

Adopting a whole application was rejected in the previous design document and
that conclusion survives the new brief: Ennuicastr (ISC) is a second application
plus its own protocol server, Opencast Studio (MIT) is single-user with no call
layer, `omshdev/Riverside` is GPL-2.0 and abandoned. Ennuicastr's _technique_ —
continuous clock sync, timestamped frames, silence inserted at assembly — is
still the right model for alignment and is adopted in scaled-down form. Opencast
Studio remains the best reference for browser capture handling.

The brief's caution against inheriting creator-platform features applies
directly to Daily: adopt `@daily-co/daily-js`, room and recording control, and
raw-tracks. Do not adopt Daily Prebuilt, its drop-in call UI — it is a
video-conferencing product's interface and would fight the calm,
operationally-explicit interface this tool needs, where recording health is the
primary information and the video grid is incidental.

---

## Part 3 — Proposed architecture

### Local recording path (the master)

Guest's browser → `getUserMedia` with echo cancellation, noise suppression, and
AGC **explicitly disabled** for the recorded stream (the brief is right that
browser defaults are wrong for production capture; the _call_ stream may keep
them) → `extendable-media-recorder` with a WAV encoder and a ~5 s `timeslice` →
each chunk written to OPFS first → an uploader reads from OPFS and pushes each
part as its own storage object → part row recorded with sequence, offset, size,
and hash → part deleted from OPFS only after the server confirms it.

That ordering is the whole data-loss story: **nothing leaves the local store
until the server has acknowledged it.**

### Cloud backup path

Daily `raw-tracks`, started with the recording, writing one file per participant
plus an event JSON carrying the timing data. Lower fidelity by nature — it is the
transmitted call — and never presented as anything else.

**Open question for the prototype:** raw-tracks writes to a customer-owned S3
bucket, and it is unverified whether Supabase Storage's S3-compatible endpoint is
an accepted destination. If it is not, backups need their own bucket on a real
S3 provider, which splits storage across two systems and adds credentials,
lifecycle, and access-control surface. That is a genuine architectural
consequence, not a configuration detail, and it should be settled early rather
than discovered late.

### Provenance, which must never be fudged

Every delivered file carries an explicit source and integrity status, and the UI
shows it: `local_master_complete`, `local_master_recovered`, `local_partial`,
`cloud_backup_complete`, `cloud_backup_partial`, `missing`. Where both a partial
local master and a cloud backup exist, **both are retained**, with timing
metadata preserved so an editor can splice them later. The system never
silently substitutes the backup for the master. No track is labelled complete
until its expected parts are all present, its hashes check out, and the assembled
file has been probed and found readable.

### Smallest coherent schema change

Five new tables, no changes to any existing table, no generic media abstraction:

- `ri_sessions` — title, notes, scheduled_at, status, reference clock instant, `created_by`
- `ri_participants` — session, display name, role, join token + revocation, guest auth binding, live/recording state, measured clock offset, storage prefix
- `ri_tracks` — one per participant per recording run (a session stopped and restarted, or a guest who rejoins, yields more than one), with source (`local` | `cloud`), provenance/integrity status, assembled path, duration, size, format
- `ri_track_parts` — sequence, storage path, byte size, hash, start offset, uploaded_at; `unique (participant_id, sequence)`
- `ri_session_events` — an append-only operational log (joined, recording started, disconnected, upload stalled, assembly failed) that makes the post-session status view truthful rather than reconstructed

`ri_tracks` as a separate table from `ri_participants` is the one change from
the earlier design, and it is forced by the brief: multiple start/stop cycles
and rejoins mean participant:track is not 1:1.

Handoff to the Transcription Workspace creates a `tw_projects` row from a chosen
track. That is the integration boundary, and it stays one-directional — the
transcription tool is never a dependency for downloading a recording.

### Deployment implications

| Runs where          | What                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Vercel (existing)   | All staff UI, server actions, room/token and recording control, assembly route handler, guest pages  |
| Supabase (existing) | Postgres, Auth, Storage (masters and parts; cloud backups too, if raw-tracks accepts it as a target) |
| **New: Daily**      | SFU, TURN, raw-tracks recording → S3                                                                 |

One new external service, no new servers to operate. New environment variables:
Daily API key, and S3 credentials for the raw-tracks destination — scoped to
Supabase Storage if it works as a target, otherwise to a dedicated bucket per the
open question above.

### Principal technical risks

1. **Chunked WAV assembly is unproven here.** WAV parts are not
   self-describing the way the first WebM part is; header rewriting on
   concatenation must be validated against Audition, not just against ffprobe.
   _First thing the Phase 3 prototype should prove._
2. **Sustained lossless upload on a weak guest connection** (~0.77 Mbps
   alongside the call). Mitigated by the OPFS buffer, but the failure mode is a
   guest who must keep a tab open long after the interview. Must be measured,
   with FLAC as the ready mitigation.
3. **Mobile browsers suspending recording** on lock or backgrounding. Partly
   unfixable; the honest answer is detection and a preflight warning, not a
   promise.
4. **OPFS quota and eviction** under long sessions.
5. **Recording start failure** leaving no backup at the moment it is most needed
   — raw-tracks status must be surfaced live, not assumed.
6. **The raw-tracks S3 destination**, per the open question above: whether
   Supabase Storage works as a target decides whether storage stays in one system
   or splits into two.
7. **Clock alignment across machines**, per the existing design document — and
   note that the backup-as-anchor technique proposed there inherits whatever
   alignment the vendor's own tracks have, so Daily's event-JSON timing data
   needs verifying in practice rather than trusting.
8. **`extendable-media-recorder`'s single maintainer** — mitigated by MIT
   licensing and a small surface, with the AudioWorklet path as the exit.

### Phase 3 results: what was proven, and what's still open

The local-capture half of Phase 3 ran as a real, executable prototype —
`prototype/remote-interview-poc/` (throwaway, not product code; see its
README) — not a paper design. Chromium's fake-audio-device flags let a
headless browser record a real synthesized tone with no hardware, so this
validated actual behavior against concrete, numeric pass/fail criteria rather
than assumption:

- **Chunked WAV assembly holds.** An open upstream issue claims only the first
  chunk from `extendable-media-recorder` carries a WAV header — confirmed
  true against the exact pinned version by dumping the actual bytes emitted,
  rather than trusted on faith. Assembly detects this per-part instead of
  hardcoding it. A 25s recording assembled to a file ffprobe validated as
  correct format, correct duration (within tens of milliseconds), and
  genuinely non-silent audio.
- **OPFS survives a crash, and nothing is lost or duplicated.** A reload
  triggered right after recording stopped, before uploads had acked, with the
  server's _response_ (not the write) deliberately delayed — reproducing the
  real failure mode where the server already durably has a part but the
  client's view of the ack was aborted by navigation. Confirmed: the
  not-yet-acked parts were still in OPFS immediately post-reload, the
  resume-on-load drain found and re-uploaded them, the server's idempotent
  dedupe absorbed the resend cleanly, and the final assembled duration
  matched the original recording to within 24ms.

**Still open, deliberately deferred, and not yet touched by any code:** Daily's
raw-tracks integration itself, the S3-destination question (risk #6 above), a
live two-person call, real network flakiness (the reload test is a
deterministic stand-in for a crash, not a flaky-network simulation), and
cross-machine clock alignment (risk #7 — this one specifically needs two
physical machines on different networks and cannot be validated in a sandboxed
single-machine environment regardless of how much of this pass was spent on
it). Opening an assembled file in Adobe Audition was also out of reach here —
nothing in this environment can perform that check; the prototype's driver
prints the file paths for a human to do so.

**Phase 4 (product implementation) is authorized and is the next step**,
starting with the Foundation slice from `docs/remote-interview-design.md` §7:
the `ri_*` migration + RLS + `private.has_remote_interview_access` (mirroring
`private.has_transcription_access`), the storage bucket and policies, the
registry row narrowed per that doc's §2, the route segment gated by
`requireToolAccess("remote-interview")`, and the session list / create-session
/ join-link screens. Read Finding 4 above (the migration-history gap) before
writing that migration — it's non-blocking but worth knowing going in. Build
the call layer behind a thin interface in the following slice — not to hedge
the vendor decision, which is made, but because the seam falls out of the
work anyway and keeps a LiveKit fallback cheap if Daily trials go badly.

---

_Nothing in `prototype/remote-interview-poc/` ships; it is validation
evidence, not product code. This document supersedes
`docs/remote-interview-design.md` §6 where the two conflict — chiefly the SFU
and lossless-capture decisions, both reversed by the cloud-backup and WAV
requirements in the product brief._
