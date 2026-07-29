# Remote Interview — Existing-System & Technical-Options Assessment

Phases 1 and 2 of the development process in the product brief: what already
exists and can be reused, what credible building blocks exist outside, and the
proposed architecture with its risks. **No code has been written.** This
document exists to be argued with before anything is built.

Companion to `docs/remote-interview-design.md`, which describes the product.
Where the two disagree, this one is newer.

---

## Part 1 — Existing-system assessment

### Summary

The portal is small, coherent, and deliberately lean: **eight runtime
dependencies**, nineteen tables, two API route handlers. Its authentication,
authorization, audit, and UI conventions are directly reusable and should be
reused without modification. Its _media_ infrastructure, however, is much
thinner than it looks from the design documents, and three findings below
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

### Three findings that change the plan

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

| Option                            | License / model                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LiveKit Cloud** (SFU + Egress)  | Apache-2.0 core, managed service | **Recommended.** Track Egress records each participant's audio to a separate file — exactly the backup this tool needs, not a composited mix. Writes to any S3-compatible endpoint with a custom endpoint URL, and Supabase Storage is S3-compatible, so backups land in the same bucket as the local masters with no second storage system. Managed, so no SFU to operate. TURN is included, which removes a separate infrastructure item. Track egress is ~$0.001/min, so a 60-minute two-person interview costs roughly $0.12 in egress plus participant minutes — negligible at WUWF's volume. |
| **LiveKit self-hosted**           | Apache-2.0                       | Same software, but adds a Go service, Redis, a TURN deployment, and an egress worker (which runs headless Chrome for compositing) to operate. Disproportionate for a small newsroom, per the brief's own constraint. Keep as the exit path if the managed service is ever unacceptable — the client code is identical.                                                                                                                                                                                                                                                                             |
| **Daily.co**                      | Proprietary SaaS                 | Genuinely strong fit: `raw-tracks` recording captures each participant's track separately to your own S3 bucket, and they publish `daily-co/raw-tracks-tools` for alignment and compositing. The main strike against it is that it is closed-source with no self-host path, where LiveKit's core is Apache-2.0 and the same client code runs against self-hosted infrastructure. Recommend as the fallback if LiveKit Cloud disappoints in trials.                                                                                                                                                 |
| **mediasoup / Janus / ion-sfu**   | Various OSS                      | Rejected. All are SFU libraries requiring you to build and operate the surrounding service, plus a separate recording pipeline. This is the "large platform-engineering team" the brief warns against.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Plain P2P `RTCPeerConnection`** | Browser-native                   | Rejected _for this brief_, though it remains the simplest call layer. It cannot satisfy the cloud-backup requirement, and a separate "recorder peer" that joins each call to record is an SFU built badly.                                                                                                                                                                                                                                                                                                                                                                                         |

Adopting LiveKit means adopting `livekit-client` (browser) and
`livekit-server-sdk` (token minting in a server action) — two dependencies, both
Apache-2.0. That is a real addition to an eight-dependency project and should be
justified in the commit that introduces it, per `CLAUDE.md`.

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
directly to LiveKit: adopt `livekit-client`, `livekit-server-sdk`, and Track
Egress. Do not adopt LiveKit Components' prebuilt conference UI, which is a
video-conferencing product's interface and would fight the calm,
operationally-explicit interface this tool needs.

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

LiveKit Track Egress, started with the recording, writing one OGG/Opus file per
participant to the same Supabase Storage bucket via its S3-compatible endpoint.
Lower fidelity by nature — it is the transmitted call — and never presented as
anything else.

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

| Runs where             | What                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Vercel (existing)      | All staff UI, server actions, token minting, assembly route handler, guest lobby and room pages |
| Supabase (existing)    | Postgres, Auth, Storage (masters, parts, and cloud backups in one bucket)                       |
| **New: LiveKit Cloud** | SFU, TURN, Track Egress → Supabase Storage over S3                                              |

One new external service, no new servers to operate. New environment variables:
LiveKit URL/key/secret, and Supabase S3 credentials scoped for egress.

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
5. **Egress start failure** leaving no backup at the moment it is most needed —
   backup status must be surfaced live, not assumed.
6. **Clock alignment across machines**, per the existing design document.
7. **`extendable-media-recorder`'s single maintainer** — mitigated by MIT
   licensing and a small surface, with the AudioWorklet path as the exit.

### What Phase 3 must prove before any UI work

The prototype in the brief, narrowed to the assertions that would invalidate
this architecture: a WAV master captured locally through a real call, uploaded
progressively while the network is deliberately interrupted, resumed from OPFS
after a refresh, assembled server-side, verified readable, **opened in Adobe
Audition**, and checked for alignment against a second machine's track — with a
LiveKit cloud backup present and correctly labelled throughout.

---

_Nothing in this document is built. It supersedes `docs/remote-interview-design.md`
§6 where the two conflict — chiefly the SFU and lossless-capture decisions,
both reversed by the cloud-backup and WAV requirements in the product brief._
