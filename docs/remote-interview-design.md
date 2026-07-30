# Remote Interview — Product & Engineering Design

Status: **Designed, not started.** No schema, no routes, no code yet.
Scope: the third tool in the WUWF Tools Portal, at `/remote-interview`.

Written 2026-07-29. Revised the same day against the full product brief, which
added a cloud backup recording, lossless masters, and a much more explicit
failure-and-recovery model. Those three changes reversed two decisions in the
first draft; §6 records the reversals rather than quietly overwriting them.

Read alongside `docs/remote-interview-technical-assessment.md`, which carries
the existing-system inventory, the building-block evaluation, and the
deployment and risk analysis. This document is the product; that one is the
engineering case behind it.

Until Phase 1 lands, `CLAUDE.md`'s guardrail against building the media
pipeline still applies to everything described here.

---

## 1. The problem we're solving

A reporter needs a remote guest on tape. Today that means a phone call, a Zoom
recording, or a Teams call — and all three hand back audio that has been
squeezed through a real-time codec tuned for conversation, not broadcast. It
arrives narrowband, dynamically compressed, and pockmarked with the artifacts
of whatever the guest's wifi was doing at the time: dropouts, robot voice, the
half-syllable that vanished exactly where the good quote was. Nothing
downstream can repair that. The audio was never captured at quality; it was
captured at whatever survived the trip.

The insight the commercial tools (Riverside.fm, Zencastr, SquadCast) are built
on is that **the call and the recording do not have to be the same signal**.
The call is a real-time problem and must degrade under bad network conditions —
that's what makes it a call. The recording is not a real-time problem at all.
So each participant's browser records _its own_ microphone locally, at full
quality, straight to disk, and uploads it in the background while everyone
talks. The network carries a lossy preview so people can have a conversation;
the network never carries the master. A guest on terrible wifi produces a
pristine track — their preview stutters, their recording doesn't.

This is the old radio "double-ender" — both ends roll tape locally, the
engineer syncs them afterward — with the tape and the syncing automated.

What makes it buildable here rather than bought: WUWF needs a host and one or
two guests, not a broadcast studio, and the portal already owns everything
downstream. The Transcription Workspace transcribes, corrects, clips, and
archives. This tool does not need to be a studio suite. It needs to end with
good files, correctly labelled.

What this tool is **not**: a transcription tool, a transcript editor, a clip
library, a multitrack editor, a mixing or mastering tool, a replacement for
Adobe Audition, a publishing system, or a video conferencing product. It ends
at "clean per-person tracks, in the portal, honestly labelled, ready to
produce."

## 2. Product model

**The session is the central object** — one session per interview. Around it,
five constraints:

1. **One track per participant per recording run, and that is the point.** Not
   a mixed recording: separate tracks are the deliverable, because separate
   tracks are what let a producer ride one voice without touching the other. A
   session that is stopped and restarted, or that a guest rejoins, produces more
   than one track per person — the model has to allow it rather than pretend
   interviews run start-to-finish in one take.

2. **Guests are not portal users.** A guest is a source, a mayor, a professor at
   another university — someone who will use this tool exactly once, from a
   link, on a machine we don't control. They do not get an account, do not
   install anything, do not appear in `profiles`, and do not see any part of the
   portal.

3. **There are two recordings, and they are never confused with each other.**
   The local master is the production source. A cloud-side backup of the
   transmitted call runs alongside it as insurance. The backup is lower fidelity
   by nature and is _never_ silently presented as the master — every file
   carries its provenance, and a session where only the backup survived says so
   in those words.

4. **Recording status is not connection status.** A participant can be happily
   connected to the call while their local recording has failed, and the
   interface must make that impossible to misread. This one distinction drives
   most of the UI design in §4.

5. **The tool ends at delivery.** A finished session produces downloadable
   source files and, on request, a Transcription Workspace project. Staff must
   be able to download the originals whether or not any downstream integration
   is working.

The durable object hierarchy:

```
Session (one interview)
├── reference clock       (the instant every track is aligned to)
├── participants          (host + guests; one per person in the room)
│   └── tracks            (one per recording run, per source)
│       ├── local master  (lossless, captured on their device)
│       │   └── parts     (uploaded chunks, ordered, hashed, time-stamped)
│       └── cloud backup  (Opus, captured server-side from the call)
├── event log             (what actually happened, append-only)
└── handoff               (optional tw_projects row created from a track)
```

### Relationship to the existing tool registry

`docs/transcription-workspace-design.md` §"Relationship to the existing tool
registry" settled the scope question from the other side: that tool absorbed the
_transcribe/edit_ half of Remote Interview's seeded description and recommended
narrowing this one to recording/capture "when that milestone starts." This is
that milestone, and this document takes the narrowing.

Phase 1 updates the registry row currently seeded at `supabase/seed.sql:73-88`:

|             | Now                                                               | After Phase 1                                                                   |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| description | "Record, transcribe, and edit remote audio and video interviews." | "Record remote interviews, capturing each participant locally at full quality." |
| route       | `/tools/remote-interview` (generic placeholder)                   | `/remote-interview`                                                             |
| status      | `in_development`                                                  | `in_development` until the vertical slice is proven, then `available`           |

It follows the Transcription Workspace's precedent of carrying the registry row
in the tool's own schema migration
(`20260725000000_transcription_workspace_schema.sql:270-281`) rather than seed
data, so the row exists wherever the migration has been applied. The row is
currently seed-only, so the migration must `update` the existing key rather than
assume an insert.

## 3. Primary user workflows

### A. Scheduling, and the link

The host clicks **New session**, gives it a title and optionally notes and a
scheduled time, and gets a guest link immediately — a long random token, not a
guessable id. They send it however they already talk to the source: email, text,
a calendar invite. There is no guest invitation system, no guest email field, no
reminder machinery. A link is the entire onboarding.

The link is per-participant, not per-session. Two guests get two links. This
costs a row and buys the thing that matters during a recording: the host's
screen says "Dr. Okafor's recording stopped" rather than "someone's recording
stopped," and one mis-shared link can be revoked without disturbing anyone else.
Links expire on a sensible default and can be revoked by the host at any time.

### B. Preflight (the most valuable screen in the tool)

The link opens a preflight screen, outside the portal shell, in plain language.
The guest can:

- enter or confirm their name,
- grant microphone access, with a plain sentence about why,
- pick a microphone if there is more than one,
- watch a live level meter — the single most useful control on the page,
  because it catches "you're on your laptop mic, not your headset" _before_ the
  interview instead of after it,
- make a short test recording and play it back,
- pick a camera, if video is enabled,
- and read that they should wear headphones, that a high-quality recording will
  be made on their own device, and that the tab must stay open until it
  finishes uploading.

It warns clearly, and refuses to be quiet about, any of: no microphone
detected; permission blocked; a selected device producing no signal; an
unsupported browser; a device that cannot record safely; insufficient local
storage for the expected session length; a browser likely to suspend recording;
a network too unstable for a workable conversation; and mobile configurations
likely to interrupt recording.

A guest can proceed past a warning — this is a newsroom, and sometimes the
mayor is on a phone in a car and that is the interview you're getting — but
never _without seeing it_. The host sees the same warnings on their side before
admitting anyone.

### C. Waiting room and admission

Guests who finish preflight land in a waiting state. The host sees who is
waiting, with their preflight results, and admits them deliberately. Nobody
joins an interview that has already started without the host knowing.

### D. The conversation

Host and guest hear and see each other through the call layer. The host sees,
per participant, a set of states that are deliberately kept distinct:

- **Connected / reconnecting / disconnected** — the live link.
- **Microphone active or muted**, with a live level.
- **Local recording: active, interrupted, or failed** — the one that matters.
- **Upload progress** — how much of that recording has reached the server.
- **Cloud backup: active or failed.**
- **Connection quality.**
- **Whether this participant's data is currently safe**, and **what action is
  required** if it isn't.

Separating these is the difference between a calm tool and a frightening one.
When the network wobbles, "Connected" flickers while "Recording" stays solid,
and the host learns quickly that the tape is not what's at risk. When recording
_has_ actually failed, that must be loud, immediate, and impossible to confuse
with a network blip.

The host starts and stops recording deliberately, sees elapsed recording time,
can mute themselves, can copy the invite link, can remove a participant, and
ends the session. Guests cannot start or stop recording — only leave.

Guests see a deliberately smaller version: whether recording is on, whether
their mic is live, whether their local recording is healthy, whether upload is
in progress, whether anything is required of them, and whether it is safe to
close the tab.

### E. Ending, and the completion state

When recording stops or the host ends the call, participants enter a dedicated
completion state. **A guest is not told they can leave until their recording has
either fully uploaded or been determined unrecoverable.** The messages are
direct and unhedged:

> "Your recording is still uploading. Keep this tab open."
> "Your upload was interrupted. Reconnecting."
> "Your recording is safely uploaded. You may close this tab."
> "Part of your recording hasn't uploaded. Reopen this link on the same device
> to continue."

The host sees which tracks are complete, which are still uploading, which need
recovery, whether the cloud backup completed, and whether anything is missing.
**A session is not "complete" because the call ended** — it is complete when the
data is verified present and readable.

### F. Recovery

Failure states are product states here, not edge cases. A guest who closes the
tab, refreshes, loses network, sleeps their laptop, or comes back an hour later
can reopen the original link on the same device and resume an incomplete upload
from what is still buffered locally. The host can retry a failed assembly. Where
full recovery is impossible, the tool reports precisely what was preserved and
what was lost — never a vague failure, and never an optimistic one.

### G. Handoff to the Transcription Workspace

From the session detail screen, **Send to Transcription Workspace** on any track
creates a `tw_projects` row pointing at that track's assembled file, carrying
the session title, date, participant names, provenance, and duration, then links
to it.

It is deliberately explicit rather than automatic, and per-track rather than
per-session: a two-guest interview yields three tracks, and which one gets
transcribed is an editorial choice made in about a second, where guessing wrong
would litter the archive with duplicate projects of one conversation. The
transcription tool is never a dependency for finishing or downloading a
recording.

## 4. Screens

1. **Session list** (`/remote-interview`) — tool home. New-session button, rows
   showing title, date, participants, duration, and a status that distinguishes
   "recording," "uploading," "needs recovery," and "ready."
2. **Session detail** (`/remote-interview/[id]`) — before the interview, the
   participant list and their join links with copy and revoke; after it, the
   tracks with per-track duration, size, format, **source and integrity
   status**, download, recovery actions where available, download-all, and the
   handoff button. This screen is also where failures live, in the open.
3. **The studio** (`/remote-interview/[id]/studio`) — the live screen. Per
   participant: video tile, level, and the status set from §3D. One large record
   control, elapsed time, and prominent recording-health warnings. Nothing
   decorative; anything that isn't the conversation or its health is a
   distraction from both.
4. **Guest preflight, room, and completion** (`/join/[token]`, outside the
   portal shell) — §3B, §3D, §3E. A guest should not be able to tell this is
   part of a larger internal tools site, because for them it isn't.

Admin needs no new screens: membership is portal `tool_access`, and there is no
tool-level settings surface in v1. Device selection lives in preflight, per
session, per person — not in a preferences page, since half the users have no
account to store preferences on.

The character throughout is calm, trustworthy, and operationally explicit. This
is a newsroom production tool, not a creator platform. At every moment the user
should know whether the call is connected, whether recording is active, whether
data is safe, what has gone wrong, what is required of them, and when it is safe
to close the browser. Use the existing WUWF design language and the primitives
in `src/components/ui/`; favor restraint over novelty.

## 5. Data model

Five new `ri_*` tables in `public`, following the `tw_*` conventions
(`20260725000000_transcription_workspace_schema.sql` is the template). **No
changes to any existing table, and no new generic media abstraction** — see the
technical assessment, Part 1, on why the "canonical audio-file table" the brief
assumes does not actually exist in this database, and why inventing one now
would be the wrong response.

```sql
create type ri_session_status as enum
  ('scheduled','live','recording','processing','ready','needs_recovery','failed');
create type ri_participant_role as enum ('host','guest');
create type ri_track_source as enum ('local','cloud');
create type ri_track_status as enum
  ('recording','uploading','assembling','complete','partial','missing','failed');

ri_sessions
  id uuid pk
  title text not null
  notes text
  scheduled_at timestamptz
  status ri_session_status not null default 'scheduled'
  recording_started_at timestamptz     -- THE reference instant; null until start
  recording_stopped_at timestamptz
  created_by uuid not null references profiles(id) on delete restrict
  created_at / updated_at

ri_participants
  id uuid pk
  session_id uuid not null references ri_sessions on delete cascade
  display_name text not null
  role ri_participant_role not null
  profile_id uuid references profiles(id)      -- host only
  guest_user_id uuid references auth.users(id) -- anonymous auth binding, guests only
  join_token text not null unique              -- 256-bit, base64url; the capability
  token_expires_at timestamptz
  revoked_at timestamptz
  admitted_at timestamptz
  clock_offset_ms integer                      -- measured client-vs-server skew
  storage_prefix text not null
  created_at / updated_at
  -- index (session_id); unique (session_id, role) where role = 'host'

ri_tracks                                       -- one per participant per run per source
  id uuid pk
  participant_id uuid not null references ri_participants on delete cascade
  source ri_track_source not null
  run_index integer not null default 0          -- stop/start cycles and rejoins
  status ri_track_status not null default 'recording'
  started_at_ms integer                         -- offset from session reference clock
  expected_part_count integer                   -- known at stop; reconciled at assembly
  storage_path text                             -- assembled file, null until assembled
  content_type text                             -- audio/wav (local), audio/ogg (cloud)
  size_bytes bigint
  duration_ms integer
  sample_rate integer
  checksum text
  verified_at timestamptz                       -- probed and found readable
  assembled_at timestamptz
  error_message text
  unique (participant_id, source, run_index)

ri_track_parts
  id uuid pk
  track_id uuid not null references ri_tracks on delete cascade
  sequence integer not null                     -- 0-based
  storage_path text not null
  size_bytes bigint not null
  checksum text not null
  started_at_ms integer not null                -- offset from the session reference
  duration_ms integer                           -- client-reported; advisory
  uploaded_at timestamptz not null default now()
  unique (track_id, sequence)                   -- makes duplicate submission idempotent

ri_session_events                               -- append-only operational history
  id uuid pk
  session_id uuid not null references ri_sessions on delete cascade
  participant_id uuid references ri_participants on delete cascade
  kind text not null                            -- joined, recording_started, disconnected,
                                                -- upload_stalled, assembly_failed, …
  detail jsonb not null default '{}'
  occurred_at timestamptz not null default now()
```

Four modeling notes, each with a rejected alternative:

- **`ri_tracks` is separate from `ri_participants`.** The first draft folded the
  track into the participant, 1:1, mirroring how `tw_projects` folds in its
  media. The brief's requirements for stop/start cycles, rejoins, and a cloud
  backup alongside the master break that: one participant can own four tracks in
  a session. This is the main schema change from the first draft.
- **Parts are a table, not a storage-prefix convention.** Listing a prefix tells
  you which parts arrived; a table tells you that _and_ their order, offsets, and
  hashes — which is what makes tracks alignable and integrity checkable at all —
  and makes an abandoned upload a visible, cleanable row rather than orphaned
  objects.
- **`unique (track_id, sequence)` is the duplicate-chunk defence.** Idempotency
  belongs in the schema, not in retry logic that has to be right everywhere.
- **`ri_session_events` exists so the completion view can be honest.** Without
  it, "what happened to Dr. Okafor's recording?" is reconstructed from final
  state, which is exactly when it's least trustworthy. It is also the audit
  trail for a tool where the interesting failures happen on someone else's
  laptop.

## 6. Architecture

The full engineering case — candidate evaluation, deployment, and risks — is in
`docs/remote-interview-technical-assessment.md`. This section states the
decisions and, where the brief overturned the first draft, says so.

### Two reversals from the first draft

**An SFU is now required, and the first draft was wrong to rule it out.** That
draft chose plain peer-to-peer WebRTC and rejected a media server outright. The
cloud backup requirement makes that untenable for a simple reason: _you cannot
record a call server-side if the media never reaches a server_. P2P sends audio
browser to browser, so there is no clever local-only version of this — any
"backup" that also runs in the guest's browser is correlated with the failures it
is meant to insure against (the browser dying, the device dying), and therefore
buys nothing.

The provider is **Daily**. Its `raw-tracks` recording captures each participant's
track separately to a customer-owned S3 bucket — not a composited mix — and emits
an event JSON carrying the timing data. It bundles TURN, which removes a separate
infrastructure item the first draft had to budget for. The deciding factor was
alignment: `livekit/egress` issue #1139 reports that LiveKit's Track Egress files
are not mutually aligned and that the deviation grows under poor network
conditions, which is exactly the condition this tool exists for. Since §"Track
synchronization" below uses the backup as an alignment anchor, mutually-aligned
backup tracks are load-bearing rather than a nicety. The technical assessment
carries the full reasoning, including why the Apache-2.0 lock-in argument that
originally favoured LiveKit did not survive scrutiny.

**Masters are lossless, and the first draft was wrong to argue for Opus.** It
claimed Opus was transparent for speech and rejected lossless capture. The brief
requires WAV or equivalent, minimal processing, and clean Audition import, and
that is the correct call for a production master regardless of transparency
arguments. Native `MediaRecorder` cannot produce it, so capture goes through
`extendable-media-recorder` with its WAV encoder (MIT, actively maintained).
The cost is bandwidth — 48 kHz/16-bit mono is ~345 MB per participant-hour and
~0.77 Mbps of sustained upstream on top of the call — which the buffering model
below is what makes survivable.

### Capture

`getUserMedia` with echo cancellation, noise suppression, and automatic gain
control **explicitly disabled on the recorded stream**. Browser defaults are
tuned for conference calls and are actively wrong for a production master —
AGC in particular will ride a level under a quiet answer. The _call_ stream may
keep them on, so people can hear each other comfortably; the two streams are
configured separately and deliberately.

No further processing is applied, ever: no noise reduction, gating, EQ,
compression, enhancement, or restoration. Producers master downstream.

Video may be carried for the conversation. **Locally-recorded video is out of
scope entirely** — not "deferred, maybe later" but a deliberately different
and much larger engineering problem than this tool's WAV pipeline (video-sized
OPFS storage, chunked upload, in-browser video encoding all scale far past the
audio bandwidth arithmetic above). If video is captured at all, it is captured
only through Daily's cloud-backup raw-tracks recording — see Phase 5 in §7 —
and it must never be allowed to compromise audio reliability. If it threatens
to, it is disabled.

### Local buffering, upload, and recovery

The chain that makes data loss unlikely, in order:

1. `MediaRecorder` (WAV-encoding) emits a part every ~5 seconds.
2. The part is written to **OPFS** — a real file system in the browser, in a
   worker, supported in Chrome/Edge 86+, Firefox 111+, Safari 15.2+ — with
   IndexedDB as the fallback and "neither available" as a preflight failure.
3. An uploader reads from OPFS and pushes each part as **its own storage
   object**, recording sequence, offset, size, and hash.
4. **A part is deleted locally only after the server confirms it.**

Step 4 is the whole story: nothing leaves the local store until it is
acknowledged, so a crash, refresh, sleep, or closed tab loses nothing that
hasn't already landed. Reopening the link on the same device finds the buffer
and resumes, which is what makes §3F's promise real rather than aspirational.

Per-part objects rather than one long resumable (TUS) upload, because a stream
being produced as it uploads has different failure modes from a file that
already exists: per-part objects hold no session state to lose when a tab dies,
tolerate out-of-order arrival, and can be retried individually. Out-of-order and
duplicate submissions are handled by `unique (track_id, sequence)` and an
`order by sequence` at assembly, not by the transport.

### Assembly and verification

`ffmpeg-static` — already a dependency — in a `runtime = "nodejs"` route handler
with `maxDuration = 300`, following the existing clip-export precedent
(`src/lib/transcription/export.ts`). Parts are concatenated in sequence order and
the container header rewritten, since concatenated WAV parts carry a stale RIFF
length exactly as concatenated WebM parts carry no duration.

**No track is marked complete until** its expected parts are all present, its
hashes verify, and the assembled file has been probed and found readable. A
failed assembly is retryable at leisure, because the parts are still in storage.

### Provenance, which is never fudged

Every file carries an explicit source and integrity status, surfaced in the UI:
`local_master_complete`, `local_master_recovered`, `local_partial`,
`cloud_backup_complete`, `cloud_backup_partial`, `missing`. Where both a partial
master and a cloud backup exist, **both are kept**, with timing metadata
preserved so an editor can splice them later; v1 does not attempt that repair
automatically. The system never substitutes the backup for the master silently.

### Track synchronization

Two people press record on two machines. Their recordings do not start at the
same instant, and their clocks drift over an hour. Concatenating parts gives two
individually correct tracks with an unknown, drifting offset — precisely the
manual sync work a double-ender is supposed to remove.

**Ennuicastr** (`ennuicastr/ennuicastr`, ISC) is the clearest prior art: the
client "synchronize[s] its time with the server _continuously_, and timestamp[s]
_every_ frame of audio data", and the server resolves those frames "into
continuous streams which are correctly in sync, by removing or adding silence as
necessary." Scaled to this design: one reference instant per session
(`recording_started_at`), a measured `clock_offset_ms` per participant from
periodic round-trips, and a `started_at_ms` per part; at assembly, leading
silence or a trim so sample zero of every track is the same real instant.

The target is stated plainly because it bounds the work: **alignment within a
few tens of milliseconds reads as synchronized for speech.** Sample accuracy is
a DAW problem and not the goal. That tolerance is what permits ordinary
round-trip clock estimation instead of Ennuicastr's per-frame timestamping and
dedicated protocol server. The offset arithmetic is pure logic and gets
colocated Vitest tests — the most valuable tests in the tool, because its
failure mode is silent.

**The backup is also an alignment anchor, not only insurance.** Each local master
and its own cloud backup contain the same voice saying the same words, differing
only in quality, so cross-correlating them recovers the offset by _measuring the
signal_ rather than estimating clock skew. This is the standard dual-system-sound
technique — how you sync a lavalier recorder to a camera by matching audio rather
than trusting timecode — and it is more robust than clock arithmetic because it
observes what actually happened instead of modelling it.

Two constraints on the technique, both worth stating so it isn't over-trusted:

- **It inherits the backups' own alignment.** Anchoring each master to its backup
  only aligns the masters to each other if the backups are mutually aligned. That
  is why the vendor's timing metadata matters, and why it needs verifying in
  practice rather than assuming.
- **It cannot be replaced by correlating the two masters directly.** That would
  rely on each participant's microphone picking up the other person, and preflight
  deliberately recommends headphones — doing the right thing acoustically removes
  the bleed such a correlation would need.

So correlation is a refinement layered on top, not a replacement. The clock
machinery stays primary, because it is what remains when a backup is missing or
partial — which is precisely the situation where the masters matter most.

### Guest identity

Guests have no portal account and the portal has no public self-signup, yet
their browsers must write hundreds of objects to Storage.

**Recommended: Supabase anonymous sign-in.** On opening a valid link the client
calls `signInAnonymously()`; a server action verifies the join token and binds
the resulting user id to `ri_participants.guest_user_id`. The guest then holds a
real JWT, `auth.uid()` exists, and every policy is ordinary RLS — storage writes
scoped to their own participant prefix, and Daily room tokens minted server-side
only for a bound, unrevoked participant.

The objection to answer is "doesn't this create public accounts?" No, and the
distinction is one the portal already draws: membership is a `profiles` row plus
`account_status='active'`. An anonymous user has no `profiles` row, so
`requireActiveProfile()` rejects them from every `(portal)` route,
`is_administrator()` is false, and `has_remote_interview_access()` is false.
What they get is a bare credential that RLS scopes to one participant's prefix.
"No public self-signup" governs who gets _into the portal_; this lets no one in.

Costs, stated honestly: anonymous sign-in must be enabled per Supabase project
in the dashboard (preview and production both), which puts it in the same
category as the one-time setup items in `README.md`; anyone can then mint an
anonymous JWT, which is why every policy keys on `guest_user_id` being _already
bound_ to a live participant row rather than on mere authentication; and
anonymous users accumulate in `auth.users`, making periodic cleanup a
maintenance item.

_Alternative considered:_ join token → route handler → per-part
`createSignedUploadUrl()` via the admin client, in the spirit of the ASR webhook
exception. Rejected as the default because it puts the admin client on a path
invoked hundreds of times per interview and moves the security boundary out of
RLS into hand-written handler code. It remains the fallback if enabling
anonymous sign-in is unacceptable; the schema is unchanged either way.

### Security and access

Staff authenticate through the existing portal. Guest links are 256-bit,
expiring, revocable, and admitted by the host. Recording controls are host-only.
Guests can reach their own upload prefix and nothing else — not other
participants' files, not the session list, not any other session. Completed
recordings are reachable only through short-lived signed URLs generated for
users who pass RLS. Sessions are not publicly discoverable. Session creation,
link revocation, and deletion are audited with `logAuditEvent()` per the portal
convention. Retention and deletion policy is a v1 decision to make explicitly
rather than inherit.

### Fit with portal conventions

Route segment `src/app/(portal)/remote-interview/`, gated by
`requireToolAccess("remote-interview")` (`src/lib/auth/authz.ts`). A
`private.has_remote_interview_access(uid)` mirrors
`private.has_transcription_access` — `security definer`, in `private` so it is
not a PostgREST endpoint, `execute` to `authenticated`, and deliberately not
bypassing for platform administrators. Mutations are Server Actions on the RLS
server client; reads go through `unwrapRead()` (`src/lib/read-result.ts`),
writes through `failIfError()` / `failWith()`
(`src/lib/editorial/action-result.ts`). Pure logic — clock-offset settling, part
ordering and silence math, integrity reconciliation, token generation, status
derivation — gets colocated Vitest tests.

**One deliberate exception to the directory conventions**, called out because it
is the first of its kind here: the guest routes (`/join/[token]`) live outside
both `(portal)` and `(auth)`. Every existing route is either public sign-in or
behind `requireActiveProfile()`; a guest has no profile and still needs a working
page. `CLAUDE.md`'s directory conventions should gain a line for it when Phase 1
lands.

New infrastructure, none of which exists today: a Daily account (API key in
`.env.example`), anonymous sign-in enabled per Supabase project, S3 credentials
for the raw-tracks destination, and a `remote-interview-media` bucket. Whether
that destination can be Supabase Storage or needs its own bucket is an open
question for the prototype — see the technical assessment.

### What's deliberately _not_ in the architecture

| Implied/expected                                                       | Recommended instead                                                   | Why                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-hosted SFU (mediasoup, Janus, self-hosted LiveKit)                | Daily                                                                 | Running one means a media service, Redis, TURN, and a recording worker. Disproportionate for a small newsroom; revive only if procurement blocks a SaaS vendor.                                                                                                |
| Cloud recording as the primary source                                  | Local master, cloud as backup only                                    | Recording what survived the network is the problem this tool exists to solve.                                                                                                                                                                                  |
| Lossy Opus masters                                                     | Lossless WAV                                                          | Reversed from the first draft; the brief is right that a production master should not be a lossy codec.                                                                                                                                                        |
| Any capture-time processing (NR, gating, EQ, compression, enhancement) | Nothing, and AGC/NS/AEC off on the recorded stream                    | Destructive and irreversible. Producers master downstream.                                                                                                                                                                                                     |
| In-memory buffering until the call ends                                | OPFS-first, delete-after-ack                                          | The largest data-loss risk in this class of tool.                                                                                                                                                                                                              |
| One resumable (TUS) upload per track                                   | Independent per-part objects                                          | A stream being produced as it uploads has no file to resume.                                                                                                                                                                                                   |
| A job queue for assembly                                               | Route handler with status columns and retry                           | One async step per session; the Transcription Workspace reached the same conclusion. Introducing the repo's first queue for this is not justified.                                                                                                             |
| A generic media/asset table                                            | `ri_*` owns recording; `tw_projects` stays the canonical worked asset | The canonical audio table the brief assumes does not exist (assessment, Part 1); inventing one for a second consumer would be speculative.                                                                                                                     |
| Transcode or normalize on assembly                                     | Concatenate and fix the header only                                   | Minimal, non-destructive, and fast.                                                                                                                                                                                                                            |
| Daily Prebuilt (the vendor's drop-in call UI)                          | Purpose-built studio UI on existing primitives                        | It is a video-conferencing product's interface; this tool needs calm operational status, where recording health is primary and the video grid is incidental.                                                                                                   |
| Guest accounts                                                         | Anonymous auth bound to a join token                                  | Any account a guest must create is a reason the interview doesn't happen.                                                                                                                                                                                      |
| Sample-accurate alignment                                              | Tens of milliseconds                                                  | Inaudible for speech; removes an entire class of machinery.                                                                                                                                                                                                    |
| Live mixing, switching, streaming, video layouts                       | Nothing — record and hand off                                         | That's a broadcast product.                                                                                                                                                                                                                                    |
| Locally-recorded video, full Riverside-style video parity              | Cloud-only video via Daily raw-tracks, if any (Phase 5)               | A different, much larger engineering problem than lossless local audio. Cloud video inherits ordinary real-time call quality and has none of the local pipeline's reliability guarantee — an explicit, permanent tradeoff, not a temporary gap to close later. |

## 7. Phased implementation plan

Following the brief's development process. Phases 1 and 2 are **done** — they
are `docs/remote-interview-technical-assessment.md`. What remains:

**Phase 3 — technical proof of concept.** Before any product UI, prove the
architecture end to end with a deliberately ugly prototype: host creates a
session, guest joins by link, they talk, each browser captures an isolated
lossless local track, parts upload progressively, Daily raw-tracks records the
cloud backup, the network is deliberately interrupted and the local recording
survives, upload resumes from OPFS after a refresh, the call ends, the server
assembles and verifies both masters, the backup is preserved and labelled, the
host downloads the files, and **they open correctly in Adobe Audition**. Test
under genuinely weak-network and interruption conditions, not just on a good desk
connection.

The prototype exists to invalidate assumptions cheaply. Three are most likely to
break: chunked-WAV assembly producing a file Audition dislikes, sustained
lossless upload on a weak connection, and whether raw-tracks will write to
Supabase Storage or forces a second bucket. All are better discovered now.

Build the call layer behind a thin interface. Not to hedge the vendor decision —
that is made — but because the seam falls out of the work anyway and keeps the
LiveKit fallback cheap if trials go badly.

**Phase 4 — product implementation**, only after Phase 3 holds, as a dependable
vertical slice before any breadth:

1. **Foundation** — migration (`ri_*` tables, RLS,
   `private.has_remote_interview_access`, bucket and policies, registry row
   narrowed per §2), route segment with gating, session list, create-session,
   participant rows, join links with copy/revoke.
2. **Preflight and guest join** — the §3B screen with all its warnings,
   anonymous auth binding, waiting room, host admission.
3. **The studio** — call, recording start/stop, per-participant status from
   §3D, cloud backup lifecycle, recording-health warnings.
4. **Completion, recovery, and delivery** — the completion states from §3E,
   resume-on-reopen, assembly retry, provenance and integrity on the detail
   screen, per-track and bulk download.
5. **Handoff** — `tw_projects` creation from a track.

Deliberately deferred until the above is dependable: decorative dashboards,
scheduling infrastructure, advanced administration, video layouts, recorded
video, and any further integration.

**Phase 5 — Cloud-backup video (optional, after Phase 4 is dependable, not
started without an explicit instruction — same guardrail as Audience
Listening).** Decided but not built: adds video to the call and, through that
same channel, to the cloud backup — deliberately **not** local video capture,
per the "Capture" section above and the architecture table's new row. The
shape of it:

- Publish a camera track in the Daily call, host and guest both, and render it
  in the existing studio/call tiles alongside the level meter already there —
  the same event model (`track-started`/`track-stopped`,
  `participant-updated`) the audio tiles already use.
- Add a camera permission/device check to preflight (§3B), mirroring the
  microphone one.
- Recording needs no new machinery **if** raw-tracks already captures whatever
  tracks are published — the existing `ri_tracks` source='cloud' rows and
  "cloud backup active/failed" status would simply cover a file that happens
  to carry video too. This is the working assumption, not a confirmed fact:
  verify it against a live Daily account before relying on it, same as the
  other Daily specifics slice 3 flagged as unverified (`docs.daily.co` blocks
  automated fetches; this repo still has no Daily account).

Two things to make explicit to users, not just to build honestly around:

- **Video is never rescued the way local audio is.** There is no local video
  capture, so cloud-video reliability is capped by the same "cloud backup
  active/failed" signal already surfacing recording health, and its quality is
  whatever Daily's SFU actually received from that participant in real time —
  a guest on bad wifi gets choppy, dropped-frame video _in the recording_, not
  just on the live call. The reliability guarantee this whole tool exists to
  provide for audio does not extend to video, ever, under this design.
- **Turning video on reintroduces a named cost risk.** The Cost section above
  is explicit that carrying video, not audio, is what threatens a recording
  egress/allowance cap — recheck actual Daily pricing and caps before enabling
  this broadly, not just at prototype scale.

Not this phase, still out of scope: locally-recorded video, multi-cam layouts,
live mixing/switching/streaming — see the architecture table above.

---

_Nothing here is built. Phase 3 is the next step, and it is a prototype, not a
product._
