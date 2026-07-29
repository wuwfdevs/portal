# Remote Interview — Product & Engineering Design

Status: **Designed, not started.** No schema, no routes, no code yet.
Scope: the third tool in the WUWF Tools Portal, at `/remote-interview`.

Written 2026-07-29. This document is what a later implementation PR executes
against; until Phase 1 lands, `CLAUDE.md`'s guardrail against building the
media pipeline still applies to everything described here.

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
So each participant's browser records _its own_ microphone and camera locally,
at full quality, straight to disk, and uploads that file in the background
while everyone talks. The network carries a lossy preview so people can have a
conversation; the network never carries the recording. A guest on terrible
wifi produces a pristine track — their preview stutters, their recording
doesn't.

This is the old radio "double-ender" — both ends roll tape locally, the
engineer syncs them afterward — with the tape and the syncing automated.

Two things make it buildable here rather than bought:

- **The scale is small.** WUWF needs a host and one or two guests. Nearly all
  of the engineering weight in a product like Riverside is in scaling past that
  — selective forwarding, simulcast, bandwidth estimation across a dozen
  publishers. At three participants a browser can talk directly to each peer
  and none of that machinery is needed.
- **The portal already owns everything downstream.** The Transcription
  Workspace transcribes, corrects, clips, and archives. This tool does not need
  to be a studio suite. It needs to end with good files.

What this tool is **not**: a transcription tool, an editor, a live-streaming or
broadcast system, a webinar platform, or a video conferencing product for
meetings. It ends at "clean per-person tracks, in the portal, ready to
transcribe."

## 2. Product model

**The session is the central object** — one session per interview. Around it,
four constraints keep the model small:

1. **One track per participant, and that is the whole point.** Not a mixed
   recording with a mixed-down file as a bonus: separate tracks are the
   deliverable, because separate tracks are what let a producer ride one voice
   without touching the other. A mixdown, if it's ever wanted, is a render off
   these tracks and not a thing to store.

2. **Guests are not portal users.** A guest is a source, a mayor, a professor
   at another university — someone who will use this tool exactly once, from a
   link, on a machine we don't control. They do not get an account, do not get
   an invitation, do not appear in `profiles`, and do not see any part of the
   portal. This constraint drives more of the architecture than any other; §6
   takes it seriously rather than working around it.

3. **The recording is local and the call is disposable.** Everything about the
   design should follow from this. When the peer connection fails, the correct
   behavior is to keep recording and tell people the preview broke — never to
   stop the tape. This is also why plain peer-to-peer WebRTC is an acceptable
   call layer despite being the less robust choice (§6).

4. **The tool ends at the handoff.** A finished session produces files and,
   on request, a Transcription Workspace project. It does not transcribe, does
   not clip, does not publish. When a reporter wants words, they are one click
   into a tool that already does that well.

The durable object hierarchy:

```
Session (one interview)
├── reference clock       (the instant every track is aligned to)
├── participants          (host + guests; one per person in the room)
│   ├── track parts       (the uploaded chunks, in order, each time-stamped)
│   └── assembled track   (one file per participant, after assembly)
└── handoff               (optional tw_projects row created from a track)
```

### Relationship to the existing tool registry

`docs/transcription-workspace-design.md` §"Relationship to the existing tool
registry" already settled the scope question from the other side: the
Transcription Workspace absorbed the _transcribe/edit_ half of Remote
Interview's seeded description, and recommended narrowing this tool to
recording/capture "when that milestone starts." This is that milestone, and
this document takes the narrowing.

So Phase 1 updates the registry row seeded at `supabase/seed.sql:73-88` —

|             | Now                                                               | After Phase 1                                                                                       |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| description | "Record, transcribe, and edit remote audio and video interviews." | "Record remote audio and video interviews, with each participant recorded locally at full quality." |
| route       | `/tools/remote-interview` (generic placeholder)                   | `/remote-interview`                                                                                 |
| status      | `in_development`                                                  | `in_development` until Phase 3, then `available`                                                    |

— and follows the Transcription Workspace's precedent of carrying the registry
row in the tool's own schema migration (`20260725000000_transcription_workspace_schema.sql:270-281`)
rather than leaving it to seed data, so the row exists in every environment the
migration has been applied to. The row is currently seed-only, so the migration
must `update` the existing key rather than assume an insert.

## 3. Primary user workflows

### A. Scheduling, and the link

The host clicks **New session**, gives it a title and optionally a scheduled
time, and gets a guest link immediately — a long random token, not a guessable
id. They send it however they already talk to the source: email, text, in a
calendar invite. There is no guest invitation system, no guest email field, no
reminder machinery. A link is the entire onboarding.

The link is per-participant, not per-session. Two guests get two links. This
costs nothing (a row) and buys the thing that actually matters during a
recording: the host's screen can say "Dr. Okafor is connected and recording"
instead of "someone is connected", and a mis-shared link can be revoked
without disturbing anyone else.

### B. The guest arrives (no account, no install)

The link opens a lobby, outside the portal shell, that does four things and
nothing else:

1. Asks for camera/microphone permission, with a plain sentence about why.
2. Lets them pick a device, and shows a live level meter — the single most
   valuable thing on the screen, because it catches "you're on your laptop mic,
   not your headset" before the interview instead of after it.
3. Runs a readiness check: is `MediaRecorder` available with a codec we can
   use, is there disk space, is this a browser we support.
4. Asks their name, pre-filled from what the host typed.

Then a **Ready** button, and a waiting state until the host starts. No sign-in,
no download, no plugin. If the browser fails the readiness check, they are told
so here, in the lobby, where there is still time to switch browsers — never
mid-interview.

### C. The conversation

Host and guest see each other and hear each other over a peer-to-peer
connection. The host additionally sees, per participant, three pieces of state
that are deliberately distinct:

- **Connected** — the preview link is up. May drop and recover; not alarming.
- **Recording** — the local tape is rolling. This is the one that matters.
- **Uploaded** — how much of that tape has reached the server, as a percentage
  that trails the recording.

Separating these is the difference between a calm tool and a frightening one.
When the network wobbles, "Connected" flickers while "Recording" stays solid,
and the host learns quickly that the recording is not what's at risk. The host
controls start and stop for everyone; a guest cannot start or stop the
recording, only leave.

### D. Recording

`MediaRecorder` runs on each participant's own stream with a `timeslice`, so
it emits a blob every few seconds rather than one enormous blob at the end.
Each blob is uploaded as it appears, tagged with its sequence number and its
offset from the session's reference clock. By the time the host clicks stop,
almost everything is already on the server; what's left is the last few
seconds.

This is the design's main insurance policy. A browser that crashes forty
minutes in has already uploaded thirty-nine of those minutes, and the parts
table knows exactly what it has. Compare a single upload at the end, where a
crash means the interview is simply gone.

### E. Stopping and assembly

On stop, each client flushes its final part and marks itself complete. The
server then, per participant, concatenates the parts in sequence order and
remuxes the result into a proper container (§6). The session moves to `ready`,
and the detail screen offers each track for download.

Assembly is the one place a failure is recoverable at leisure: the parts are
all still in storage, so a failed assembly is a retry, not a lost interview.

### F. Handoff to the Transcription Workspace

From the session detail screen, **Send to Transcription Workspace** on any
track creates a `tw_projects` row pointing at that track's assembled file, with
the session's title and date carried across, and links to it. That's the whole
integration: a row and a storage path.

It's deliberately explicit rather than automatic, and deliberately per-track
rather than per-session. A two-guest interview yields three tracks; which one
gets transcribed (usually the guest's, sometimes each separately) is an
editorial choice the reporter makes in about a second, and guessing it wrong
would litter the archive with duplicate projects of the same conversation.

Two constraints inherited from that tool, which §6 must respect: the
Transcription Workspace assumes media a browser can play natively and that its
ASR provider can ingest, and it assumes one media file per project. Both hold
here as long as assembly produces a sane container.

## 4. Screens

Four screens, two of which a guest never sees and one of which a host never
sees:

1. **Session list** (`/remote-interview`) — tool home. New-session button,
   rows showing title / scheduled date / participants / duration / status.
2. **Session detail** (`/remote-interview/[id]`) — before the recording, the
   participant list and their join links, with copy buttons; after it, the
   tracks, with per-track download, duration, size, and the handoff button.
   The same screen also carries failure states: a participant whose parts never
   fully uploaded, an assembly that needs retrying.
3. **The studio** (`/remote-interview/[id]/studio`) — the live screen. Video
   tiles, the three-part status per participant from §3C, a level meter per
   participant, and one large record control. Nothing else; there is no
   configuration to do here and anything that isn't the conversation is a
   distraction from it.
4. **The guest lobby and room** (`/join/[token]`, outside the portal shell) —
   §3B, then the same room the host sees minus the record control and minus
   any portal navigation. A guest should not be able to tell that this is part
   of a larger internal tools site, because for them it isn't.

Admin needs no new screens: membership is portal `tool_access`, and there is no
tool-level settings surface in v1. Device selection lives in the lobby, per
session, per person — not in a preferences page, since half the users have no
account to store preferences on.

## 5. Data model

New migration; tables prefixed `ri_` in the `public` schema, following the
`tw_*` conventions exactly (`supabase/migrations/20260725000000_transcription_workspace_schema.sql`
is the template — an enum status type, `created_by` referencing `profiles(id)`
`on delete restrict`, `set_updated_at` triggers, and `comment on` for anything
whose reason isn't obvious from its name).

```sql
create type ri_session_status as enum
  ('scheduled','live','assembling','ready','failed');
create type ri_participant_role as enum ('host','guest');
create type ri_participant_state as enum
  ('invited','joined','recording','stopped','assembled','failed');

ri_sessions
  id uuid pk
  title text not null
  scheduled_at timestamptz                -- optional; a session can just start
  status ri_session_status not null default 'scheduled'
  recording_started_at timestamptz        -- THE reference instant (§6); null until start
  recording_stopped_at timestamptz
  created_by uuid not null references profiles(id) on delete restrict
  created_at / updated_at

ri_participants
  id uuid pk
  session_id uuid not null references ri_sessions on delete cascade
  display_name text not null
  role ri_participant_role not null
  profile_id uuid references profiles(id)    -- set for the host, null for guests
  guest_user_id uuid references auth.users(id) -- anonymous auth user, guests only (§6)
  join_token text not null unique            -- 256-bit, base64url; the capability
  revoked_at timestamptz                     -- a mis-shared link is revoked, not deleted
  state ri_participant_state not null default 'invited'
  clock_offset_ms integer                    -- measured client-vs-server skew (§6)
  storage_prefix text not null               -- <session_id>/<participant_id>/
  recording_mime text                        -- what MediaRecorder actually negotiated
  -- assembled result, folded in (participant:track is 1:1)
  track_storage_path text
  track_size_bytes bigint
  track_duration_ms integer
  assembled_at timestamptz
  error_message text
  created_at / updated_at
  -- index (session_id); unique (session_id, role) where role = 'host'

ri_track_parts
  id uuid pk
  participant_id uuid not null references ri_participants on delete cascade
  sequence integer not null                  -- 0-based; part 0 carries the container header
  storage_path text not null
  size_bytes bigint not null
  started_at_ms integer not null             -- offset from ri_sessions.recording_started_at
  duration_ms integer                        -- as reported by the client; advisory
  uploaded_at timestamptz not null default now()
  unique (participant_id, sequence)
```

Three modeling notes worth stating, since each had an alternative:

- **Parts are a table, not a storage-prefix convention.** Listing a bucket
  prefix would technically tell you which parts arrived. A table tells you that
  _and_ when each one started relative to everyone else, which is what makes
  the tracks alignable at all (§6), and it makes an abandoned upload a visible,
  cleanable row rather than orphaned objects — the same reasoning that gives
  `tw_projects` its `status='uploading'`.
- **The assembled track is folded into `ri_participants`** rather than given
  its own table, because participant:track is 1:1, exactly as `tw_projects`
  folds in its source media.
- **`clock_offset_ms` lives on the participant, not on each part.** The offset
  is measured repeatedly during the session but only its settled value matters
  at assembly time; storing a time series would be a research tool, not a
  recording tool.

## 6. Architecture

### Local recording

`MediaRecorder` over the participant's own `getUserMedia` stream, with a
`timeslice` on the order of five seconds — short enough that a crash costs
seconds, long enough that an hour-long interview is hundreds of parts rather
than tens of thousands.

Container and codec are negotiated at runtime with
`MediaRecorder.isTypeSupported()` and the result recorded in
`ri_participants.recording_mime`, because there is no single format every
browser will produce: Chromium and Firefox give WebM (VP8/VP9 + Opus), Safari
gives MP4 (H.264 + AAC). Trying to force one format across all of them is how
this goes wrong; recording what the browser is actually good at and normalizing
afterward is how it goes right.

Two properties of `timeslice` output are load-bearing and easy to get wrong:

- **The parts are not independent files.** Only part 0 carries the container
  header. Part 7 alone is unplayable garbage; parts 0..7 concatenated in order
  are a valid file. This is why `sequence` is a unique key and why assembly is
  ordered byte concatenation rather than a merge.
- **The output has no duration in its header.** A recording written by
  `MediaRecorder` reports duration `0` or `Infinity` to players and to ffprobe
  until it is remuxed. This is a notorious foot-gun and it would surface
  downstream as a Transcription Workspace project that won't seek.

Both are fixed by the same step: after concatenation, `ffmpeg -i in -c copy out`
rewrites the container without re-encoding. It is fast (no transcode, just a
remux), and `ffmpeg-static` is already a dependency used by
`src/lib/transcription/media.ts`, so assembly adds no new package. For Safari's
MP4 output the same remux also moves the `moov` atom to the front, which is
what makes the file streamable.

### Track synchronization

This is the part that is easy to underestimate, and getting it wrong produces
tracks that are individually perfect and collectively useless.

Two people press record on two machines. Their recordings do not begin at the
same instant (network latency to deliver the start signal, plus however long
each browser took to spin up its encoder), and their clocks do not run at
exactly the same rate over an hour. Concatenating parts gives you two correct
tracks with an unknown and drifting offset between them — which is precisely
the manual sync work a double-ender is supposed to eliminate.

**Ennuicastr** (`ennuicastr/ennuicastr`, ISC) is the clearest prior art here
and its approach is worth following: the client "synchronize[s] its time with
the server _continuously_, and timestamp[s] _every_ frame of audio data", and
the server then resolves those timestamped frames "into continuous streams
which are correctly in sync, by removing or adding silence as necessary."

Scaled to this design's needs, that means three things:

1. **One reference instant per session.** `ri_sessions.recording_started_at` is
   set server-side when the host starts, and every offset in the session is
   relative to it. Not "when each client started" — one clock, one origin.
2. **A measured clock offset per participant.** Periodically during the
   session the client round-trips a timestamp against the server and keeps the
   best (lowest round-trip) sample, in the ordinary NTP fashion; the settled
   value lands in `ri_participants.clock_offset_ms`. A laptop whose clock is
   forty seconds off no longer silently skews its whole track.
3. **A start offset per part.** `ri_track_parts.started_at_ms` records where
   that part sits on the session timeline, corrected by the participant's
   offset. At assembly, the participant's track gets leading silence (or a
   trim) so that sample zero of every assembled track corresponds to the same
   real instant.

The accuracy target should be stated plainly, because it determines how much of
this is worth building: **tracks that align within a few tens of milliseconds
read as synchronized for speech.** Sample-accurate alignment is a DAW problem
and explicitly not the goal. That tolerance is what lets the design use ordinary
round-trip clock estimation and per-part offsets rather than Ennuicastr's
per-frame timestamping and its dedicated protocol server.

The offset arithmetic — settling a clock offset from samples, turning parts
plus offsets into a leading-silence duration — is pure logic and gets a
colocated Vitest test per the repo's testing convention. It is also the single
most valuable thing in this tool to have tests for, because the failure mode is
silent: nothing errors, the tracks just don't line up.

### Chunked upload

Supabase Storage, private bucket `remote-interview-media`, with the bucket and
its `storage.objects` policies created in the same migration as the tables,
mirroring the `tw_media_*` policies at
`20260725000000_transcription_workspace_schema.sql:217-262`.

**Each part is its own object** under the participant's `storage_prefix`, a
plain upload per part. The obvious alternative — one long resumable (TUS)
upload held open for the length of the interview — is worse here despite TUS
being the tool the Transcription Workspace reaches for. A TUS upload URL is
valid for 24 hours but represents a single object being written by a single
client with one connection's worth of state; a browser tab that dies takes that
state with it. Independent per-part objects have no shared state to lose, can
be retried individually, arrive out of order harmlessly, and make "what do we
actually have?" a table query. TUS remains the right answer for the
Transcription Workspace, where the input is a file that already exists in full;
it is the wrong shape for a stream being produced as it's uploaded.

Sizing check, so the storage assumptions are on the record: 720p VP9 plus Opus
runs roughly 1.5–2.5 Mbps, so an hour-long two-person session is on the order
of 1.5–2 GB total across both tracks, in parts of a few megabytes each. Well
inside Storage's limits; worth a retention conversation eventually, not now.

### Guest identity, and why it is the hard problem

A guest has no portal account. The portal has no public self-signup — magic
link only, invitation-gated (`README.md` §"Authorization model"). And yet the
guest's browser must write a few hundred objects into Supabase Storage and
exchange signaling messages. Something has to authorize that, and `CLAUDE.md`
is unambiguous that RLS is the real boundary and the admin client is not a
convenience hatch.

**Recommended: Supabase anonymous sign-in for guests.**

When a guest opens a valid join link, the client calls
`signInAnonymously()`; the resulting user id is written to
`ri_participants.guest_user_id` by a server action that verifies the join token
first. From that point the guest holds a real JWT, `auth.uid()` is populated,
and every policy in this tool is expressible as ordinary RLS:

```sql
-- Storage: a guest may write only under their own participant's prefix.
create policy ri_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'remote-interview-media'
    and (
      private.has_remote_interview_access(auth.uid())
      or exists (
        select 1 from public.ri_participants p
        where p.guest_user_id = auth.uid()
          and p.revoked_at is null
          and name like p.storage_prefix || '%'
      )
    )
  );
```

The objection to answer is "doesn't this create accounts for the public?"
No — and the distinction is exactly the one the portal already draws.
Portal membership is a `profiles` row plus `account_status='active'`; an
anonymous auth user has no `profiles` row, so `requireActiveProfile()` rejects
them from every `(portal)` route, `is_administrator()` is false, and
`has_remote_interview_access()` is false because there is no `tool_access`
grant and no active profile. What they get is a bare credential that the RLS
policies above scope to one participant row's storage prefix. The "no public
self-signup" rule is about who can get _into the portal_, and this does not let
anyone in.

What it costs, stated honestly:

- Anonymous sign-ins must be enabled per Supabase project, in the dashboard —
  a one-time setup item in the same category as those already listed in
  `README.md` §"One-time setup still needed in each dashboard", and it must be
  done in preview and production both.
- Enabling it means anyone can mint an anonymous JWT, not just people holding a
  join link. That is why the policies above key on `guest_user_id` being
  _already bound_ to a participant row — a freshly minted anonymous user with
  no join token matches nothing and can do nothing. Rate limiting on
  anonymous sign-in should be left at Supabase's default, and the tool should
  never treat "is authenticated" as meaning anything by itself.
- Anonymous users accumulate in `auth.users`. A periodic cleanup of anonymous
  users older than the retention window is a maintenance item, not a
  correctness one.

**Alternative considered: join token → route handler → signed upload URLs.**
The guest stays fully unauthenticated; a route handler under `src/app/api/`
verifies the join token and returns a per-part `createSignedUploadUrl()`
minted with the admin client, in the same spirit as the ASR webhook exception
already documented in `CLAUDE.md`. This works, and it avoids the dashboard
change. It is not the recommendation because it puts the admin client on a hot
path invoked hundreds of times per interview rather than on a rare verified
webhook, and because it relocates the security boundary from RLS into
hand-written route-handler code — the exact inversion `CLAUDE.md` warns
against. It is a reasonable fallback if enabling anonymous sign-in is
unacceptable for policy reasons; the schema above does not change either way.

### Signaling

Supabase Realtime Broadcast, on a channel keyed to the session, carrying SDP
offers/answers and ICE candidates. No signaling server, no new dependency —
Realtime is already part of the stack.

This choice is coupled to the guest-identity decision above and the coupling
should be explicit: Realtime's authorization for a private channel is RLS on
`realtime.messages`, which needs an `auth.uid()`. With anonymous sign-in,
guests have one and the channel can be locked to the session's participants
with the same predicate shape as the storage policy. Without it, the fallback
is a channel named by an unguessable token, where the token is the capability —
weaker, and another reason to prefer the recommended path.

The clock-offset round trip (§"Track synchronization") rides the same channel,
with the server's timestamp as the reference.

### TURN is required infrastructure, not a footnote

Plain peer-to-peer WebRTC needs STUN to discover public addresses, and a TURN
relay for the connections STUN can't establish — symmetric NAT, restrictive
corporate and university firewalls, some mobile carriers. Public STUN is free
and adequate; TURN is a real service with real cost (Cloudflare Calls, Twilio's
Network Traversal Service, or self-hosted `coturn`), and it must be budgeted
before Phase 3 rather than discovered during the first real interview. Guests
at other institutions are exactly the population most likely to need it.

The mitigating fact is the one this whole design rests on: **because recording
is local, a failed peer connection costs the preview, not the recording.** A
guest whose video never connects can still be talked through the interview by
phone while both browsers record locally, and the tracks come out fine. That is
a genuinely graceful degradation, and it is the strongest argument for
accepting plain P2P instead of an SFU.

### Prior art evaluated

Recorded here so the "why not just fork an existing Riverside clone?" question
is answered once. Every candidate below is a **complete self-hosted
application**, not a library — adopting any of them means running a second app
alongside the portal and abandoning the modular-monolith rule in `CLAUDE.md`.
What transfers is technique.

| Project                                  | License    | What it is                                                                                                                                                                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ennuicastr** (`ennuicastr/ennuicastr`) | ISC        | The closest true peer to Riverside in open source. Per-participant local capture, optional lossless FLAC, host downloads separate synchronized tracks. Client and server are separate repos; the server is its own protocol server plus `nodejs-server-pages`. Audio-focused. | Not a base — a second application and a second protocol server. But its synchronization model is the right one and is adopted in scaled-down form above, with attribution.                                                                                                                                        |
| **Opencast Studio** (`opencast/studio`)  | MIT        | Browser-only `MediaRecorder` capture of webcam and screen; explicitly "no server is involved" in recording. Actively maintained. Single-user — no call, no multi-party.                                                                                                       | Not a base (no call layer), but the best permissively-licensed reference implementation of the browser-recording half: device selection, recorder lifecycle, browser quirks. Read it before writing Phase 2.                                                                                                      |
| **LiveKit**                              | Apache-2.0 | Distributed WebRTC SFU in Go. Its recording story is Egress — server-side capture of streams the SFU has already received and compressed.                                                                                                                                     | Rejected. Egress records the compressed signal, which defeats the entire premise of this tool; it would serve only as call transport, and for three participants that is a Go service, Redis, and a deployment target to avoid a few hundred lines of `RTCPeerConnection`. Revisit at 5+ simultaneous publishers. |
| **omshdev/Riverside**                    | GPL-2.0    | React + Express + `ws` + Mongo + Redis/BullMQ + S3; one-on-one only; ~16 stars.                                                                                                                                                                                               | Rejected. Shares no stack with Next.js/Supabase and is effectively unmaintained. On the license: GPL-2.0's copyleft triggers on distribution, and an internal deployment arguably never distributes — so this is an entanglement to avoid on principle rather than a hard bar. Not worth taking on either way.    |
| **msitarzewski/openstudio**              | —          | Self-hosted virtual broadcast studio: WebRTC mesh, per-track recording, Icecast. The closest _product_ concept found.                                                                                                                                                         | Not a base — again, a separate self-hosted stack.                                                                                                                                                                                                                                                                 |
| **webrtcHacks/jitsiLocalRecorder**       | —          | Browser-based local recording layered onto Jitsi Meet.                                                                                                                                                                                                                        | Not a base, but a useful existence proof that local recording bolted onto an independent call layer — this design's shape — works.                                                                                                                                                                                |

"Recast" was also checked and is a false lead: `recast.studio` is proprietary
SaaS for AI video repurposing (not recording), and `MustafaHi/Recast` is a
desktop podcast player.

### What's deliberately _not_ in the architecture

| Implied/expected                       | Recommended instead                                | Why                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An SFU (LiveKit, mediasoup, Janus)     | Plain peer-to-peer `RTCPeerConnection`             | At three participants a full mesh is three connections. An SFU is a service to deploy, monitor, and pay for, and its recording model records the wrong signal. Revisit at 5+ publishers. |
| Server-side recording of the call      | Local recording, always                            | Recording what arrived over the network is the problem this tool exists to solve.                                                                                                        |
| Lossless FLAC capture, à la Ennuicastr | Opus at a high bitrate, as the browser produces it | Opus is transparent for speech at a fraction of the size, and `MediaRecorder` produces it natively. FLAC would mean a custom capture path via Web Audio and roughly 10× the upload.      |
| Sample-accurate alignment              | Alignment within tens of milliseconds              | The looser target is inaudible for speech and removes the need for per-frame timestamping and a dedicated protocol server.                                                               |
| One resumable (TUS) upload per track   | Independent per-part objects                       | A stream being produced as it uploads has different failure modes than a file that already exists; per-part objects lose no state when a tab dies.                                       |
| A job queue for assembly               | A server action with status columns and retry      | One async step per session, taking seconds. The transcription doc reached the same conclusion for the same reason.                                                                       |
| Transcode / normalize on assembly      | Remux only (`-c copy`)                             | Producers master downstream. A remux is seconds; a transcode is minutes and lossy.                                                                                                       |
| A guest account system                 | Anonymous auth bound to a join token               | Guests use this once. Any account they must create is a reason for the interview not to happen.                                                                                          |
| Live mixing, switching, or streaming   | Nothing — record and hand off                      | That's a broadcast product. This one ends at files.                                                                                                                                      |
| Storing a mixdown alongside the tracks | Tracks only                                        | A mixdown is a render off the tracks, and separate tracks are the whole point.                                                                                                           |

### Fit with portal conventions

Route segment `src/app/(portal)/remote-interview/`, gated by
`requireToolAccess("remote-interview")` from `src/lib/auth/authz.ts`, exactly as
the Transcription Workspace's pages call `requireToolAccess("transcription")`.
A `private.has_remote_interview_access(uid)` function mirrors
`private.has_transcription_access` (`20260725000000_transcription_workspace_schema.sql:135-155`)
— `security definer`, in `private` so it isn't a PostgREST RPC endpoint,
`execute` granted to `authenticated`, and deliberately **not** bypassing for
platform administrators, keeping the portal's convention that tool access is
always an explicit grant.

All mutations are Server Actions on the RLS server client; the admin client is
untouched (see §"Guest identity" for why that's a design goal here and not just
a default). Reads go through `unwrapRead()` (`src/lib/read-result.ts`); writes
through `failIfError()` / `failWith()` from
`src/lib/editorial/action-result.ts`. Pure logic — clock
offset settling, part ordering and leading-silence math, MIME negotiation,
join-token generation, duration formatting — gets colocated Vitest tests.

**One deliberate exception to the directory conventions**, called out because
it is the first of its kind in this repo: the guest routes (`/join/[token]`)
live **outside** the `(portal)` route group and outside `(auth)`. Every existing
route is either public sign-in or behind `requireActiveProfile()`; a guest has
no profile and must still get a working page. They get their own top-level
segment with no portal shell, no navigation, and no access to anything but
their own participant row. `CLAUDE.md`'s directory conventions should gain a
line for it when Phase 1 lands.

New infrastructure this tool introduces, none of which exists today: a TURN
service (credentials as env vars, documented in `.env.example`), anonymous
sign-in enabled per Supabase project, and the `remote-interview-media` bucket.

## 7. Phased implementation plan

Each phase is a standalone milestone; the order front-loads the parts most
likely to invalidate the design.

1. **Foundation** — migration (`ri_*` tables, RLS,
   `private.has_remote_interview_access`, bucket and storage policies, registry
   row narrowed per §2), route segment with access gating, session list,
   create-session flow, participant rows and join-link generation with copy
   buttons. No media at all. _Usable as: a scheduling stub that produces links._

2. **Local recording, one participant, no call** — the device-check lobby,
   `MediaRecorder` with `timeslice`, per-part upload, the parts table filling
   up live, assembly by concatenation plus `ffmpeg -c copy` remux, and download.
   The host records themself; nobody else is in the room. _Proves the riskiest
   subsystem in isolation, where a bug is obvious rather than tangled up with
   connection problems._

3. **The call, and two-track alignment** — signaling over Realtime, peer
   connections, TURN provisioned, the guest lobby and join flow with anonymous
   auth, the studio screen with per-participant status, and the clock-offset
   machinery. Ends with a genuine two-machine recording whose tracks are checked
   for drift over a realistic duration. _Usable as: a real remote interview whose
   tracks line up. This is the finish line for the core promise._

4. **Handoff and resilience** — `tw_projects` creation from a track, resume of
   an interrupted upload after a reload, assembly retry, revoking a join link,
   abandoned-session cleanup, and the failure states on the detail screen.
   _Usable as: something that survives a bad day._

Phase 2 before 3 for the same reason the Transcription Workspace put
upload→ASR→webhook before any editing UI: prove the pipeline before building
the room around it. Alignment lands in 3 rather than 4 because it can only be
tested with two real machines on two real networks, and discovering drift after
the handoff is built would invalidate the track model that everything
downstream depends on.

---

_Nothing here is built. Phase 1 begins with the migration and the registry-row
narrowing described in §2._
