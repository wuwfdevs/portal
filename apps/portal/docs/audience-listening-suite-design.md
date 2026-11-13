# Audience Listening suite — campaigns, events, tables, and the site's signed API

Status: **Design, 2026-11-07. Phase A is built (2026-11-07 and 2026-11-09), phase B is built on the site (2026-11-09 and 2026-11-10) and
phase C is built on the Portal side (2026-11-10, applied to both projects); phase D is half built in the Portal (2026-11-11: campaigns,
events, tables and seats, with their staff screens and table cards; then the table session: single-use link, agreement, recording in segments, the
consent wording; then the conversation side: speakers, highlights, contact cards, the organizer's room, Tonight, the Sourcework handoff and the purge).
**Phase D is built on the Portal and its site screens (phase E) are built on the site (2026-11-13); phase F is not.** The build order and where each phase stands are in §10.

Read alongside `docs/audience-listening-design.md` (Milestone 1: queries, questions, submissions,
answers — built) and `apps/site/ROADMAP.md` → *Listening*. The screens are the WUWF.org Home Redesign
canvas, **boards 5, 5b to 5i and 6** (components A to I). This document is the Portal half of that
design: the records, the rules, and the signed API the site renders over.

Decided by the owner, 2026-11-04 and 2026-11-07 (do not reopen):

- **The Portal is the system, the site is the screen.** The site stores no submission, consent record,
  audio file, transcript or speaker. It calls the Portal's signed API from its server.
- **Everything on the boards is in scope for this phase**, including events and tables.
- **Group consent is accepted.** At a hosted session the facilitator's tap, after the consent is read
  aloud, is recorded as the table's agreement (boards 5d, 5f, 5g).

## 1. Ruling: how a person who is not staff is identified

The boards say public people (participants, facilitators, organizers) are **site accounts** or site
visitors, and that the Portal "authenticates staff only and records an opaque subject per row."
Milestone 1 identifies a participant by an anonymous Supabase auth user (`al_submissions.participant_user_id`
references `auth.users`). A site visitor is not an auth user. The ruling:

1. **Add `participant_subject text`; do not change `participant_user_id`.** Rows made by the Portal's own
   page (`/listen/[publicId]`, the station-without-a-CMS fallback) keep using the auth user. Rows made
   over the site's API carry a subject. Both columns are nullable; a row has at most one.
2. **A subject is namespaced text**, `site:visitor:<id>` or `site:account:<id>`, built by the Portal from the
   contract's `{ kind, id }`. The namespace prevents a site id from colliding with anything else the Portal
   may later record. The id is opaque and never an email address, a name, a donor id or a membership id.
3. **Limits key on the subject.** The partial unique index "one `in_progress` submission per (query,
   participant)" gains a twin on `(query_id, participant_subject)`, and the three-in-total cap counts by
   subject. Anything a subject cannot do, the function refuses with the same codes Milestone 1 uses.
4. **Same function names, `al_site_` prefix, taking `p_subject` first.** They apply the same rules as the
   `al_*` originals. The numbers that could drift (size and duration caps) live in one helper,
   `private.al_answer_limit_error()`; the originals are applied migrations and are not edited, so the two sets
   are twins kept in step by comments in both, and a rule changed in one is changed in the other.
5. **Only `service_role` can execute `al_site_*`.** The Portal's route handlers call them with the admin
   client *after* verifying the request signature. This is the one place the admin client touches listening
   data, and it touches it only through these functions, never a table (the same reasoning as
   `audience-listening-design.md` §6: the function list is the API, and it is reviewable on one screen).
   Anonymous and `authenticated` roles get no grant on them, so a leaked anon key reaches nothing new.
6. **A subject can only reach its own rows.** Every function that takes a submission, answer, conversation
   or contact-card id checks `participant_subject = p_subject` and answers `not_found` otherwise, with the
   same response for "not yours" and "does not exist".
7. **The site may erase.** A signed `forget-subject` request deletes the subject's in-progress submissions
   and unsubmitted audio, and nulls the subject on submitted rows (they are editorial records and stay,
   as the auth-user version does on `on delete set null`). Used when a site account is deleted.

Why not the alternatives: subject-keyed copies of the *tables* would fork the review screens; making the site
mint Supabase anonymous users per visitor would put a Portal credential in the site's hands and tie
participation to a Supabase session cookie that, per `public-client.ts`, already proved unreliable across
origins.

## 2. The records

Names follow `al_*`. Every table has RLS enabled with a **staff-only** policy
(`private.has_audience_listening_access(auth.uid())`), as in Milestone 1; the public surface is functions.
Public ids are the existing short random ids (`public-id.ts`), never a sequence.

```
Campaign (a season: one question, prompts, tag vocabulary, a span)
├── Query            (optional; the same questions answered alone — an existing al_queries row)
├── Event            (optional; a session in a place at a time, inside the campaign's span)
│   └── Table        (a number, a facilitator, a single-use link)
│       └── Conversation   (one recording; a kitchen table is an Event with one Table)
│           ├── Segments   (the audio, in parts, so a dropped connection resumes)
│           ├── Speakers   (voices found in the transcript, named afterwards by the facilitator)
│           ├── Highlights (lines the facilitator marked, with a tag)
│           └── Contact cards (per person, optional; never per table)
├── Report           (published when the campaign closes: what we heard, what we changed)
Standing inboxes (belong to no campaign)
├── Inbox item       (Ask WUWF: a question or a story idea)
├── Host request     (board 5c's form)
└── Seat             (saving a seat at a public event)
Outcome              (links a query, a campaign, an inbox item to what came of it: a story, an episode, a report)
```

### Campaign — `al_campaigns`

`id`, `public_id`, `slug`, `title`, `question`, `intro`, `owner_id` (staff profile; the desk or Audience &
Engagement), `owner_label` ("from WUWF"/"from the WUWF News desk"), `status` (`draft | open | closed | archived`),
`opens_at`, `closes_at`, `query_id` (nullable, unique), `sourcework_project_id` (nullable), plus
`al_campaign_prompts` (`campaign_id`, `position`, `kind` = `intro | question | prompt`, `text`, `hint`,
`suggested_seconds`) and `al_campaign_tags` (the tag vocabulary a facilitator picks from when marking a line).

Rules: an event's date must fall within the campaign's span (trigger). **Closing a campaign closes its
query** (trigger) and, if a report is ready, makes it public. The hub shows one band per `open` campaign.
The word "campaign" is never shown to the public.

### Event — `al_events`

`campaign_id`, `public_id`, `title`, `starts_at`, `ends_at`, `place_name`, `address`, `city`, `visibility`
(`private | public`), `listing_state` (`not_listed | pending_review | listed | declined`), `organizer_kind`
(`wuwf | partner | person`), `organizer_label`, `organizer_subject` (a site account; owns only its own events),
`seats` (null for private), `status` (`draft | scheduled | live | done | cancelled`), `current_prompt_position`
(the room's prompt, set by the console), `last_call_at` (null until the organizer calls the last five minutes),
`wuwf_journalist_joining` (bool).

Rules: **a public event is listed only after a staff member approves it** (`pending_review → listed`); a
private event is never listed and is shared by the organizer. A private event with one table is the
"kitchen table".

### Table — `al_tables`

`event_id`, `number`, `join_token_hash` (the table's single-use link: we store a SHA-256 of a 256-bit random
token, never the token), `join_token_used_at`, `facilitator_subject` (nullable: **no account is needed that
night**), `facilitator_first_name`, `state` (`waiting | agreed | recording | paused | ended | sent`),
`agreed_at` (the **group-consent record**: when the facilitator tapped, plus `consent_text_version`),
`help_requested_at`, `prompt_position`, `elapsed_seconds`.

The link opens the recorder already bound to the table. Redeeming it sets `join_token_used_at` and issues a
**table session** (a signed, expiring value held by the site for that phone). A second redemption from a
different phone is refused. If a phone is lost or can't scan, **staff re-issue a link** from the console, which
replaces the hash and invalidates the old session. There is no texting: a phone that cannot scan gets the re-issued link from
staff, who read it out, show its QR code on the console or copy it for the person to send themselves.

### Conversation, segments, speakers, highlights

- `al_conversations` (`table_id` unique, `event_id`, `status` `recording | uploading | complete | transcribing | ready | named | sent`,
  `duration_ms`, `transcription_project_id`, `sourcework_source_id`).
- `al_conversation_segments` (`conversation_id`, `seq`, `storage_path`, `content_type`, `size_bytes`,
  `duration_ms`, `status`): the phone records in **segments of at most five minutes** and uploads each by its
  own signed URL, so "if the Wi-Fi drops it picks up where it left off" is true: the recorder asks the
  Portal which segments it has and sends the rest. A conversation is `complete` when the table is ended and
  every segment up to `last_seq` is `uploaded`. The original segments are never replaced.
- `al_speakers` (`conversation_id`, `label` "Voice 1", `name`, `is_facilitator`, `first_heard_ms`,
  `share_percent`, `merged_into`): the voices the transcript found; the facilitator names them by first name.
  "That's me" sets `is_facilitator`. Leaving one blank is allowed.
- `al_highlights` (`conversation_id`, `start_ms`, `end_ms`, `text` (snapshot of the transcript line), `tag`
  (from the campaign's vocabulary), `speaker_id`): lines the facilitator marked "what mattered". **Text is
  snapshotted**, as answers snapshot their question, so a re-transcription never changes what was marked.
- **Transcript.** There is no second ASR pipeline. After `complete`, the Portal builds one source per table with
  the existing `createProjectWithSource` / `startTranscriptionForProject` (`lib/transcription/ingest.ts`) —
  the segments concatenated into one media file by the existing media path — and the transcript lines
  the after-page shows are read from the Transcription Workspace's own records through a Portal function that
  returns only that conversation's lines to its facilitator. The site never receives a transcript it can store;
  it renders the response and drops it.

### Contact cards — `al_contact_cards`

Per person, never per table (board 5i). `conversation_id`, `first_name`, `contact` (email or phone),
`may_contact`, `may_name`, `keep_anonymous`, `speaker_id` (null until the facilitator links it, if ever).
**Three separate choices, all off by default; "may name me" and "keep me anonymous" are mutually exclusive**
(a check constraint). **Naming requires having been contacted first** (a reviewer's action sets
`contacted_at`; the review screen refuses "use with name" until it is set). The facilitator's after-page
learns only a **count** of cards left, never their content ("only that a speaker left one"). The participant
reaches the card from the table's second QR, which carries a **separate single-use-per-person token** tied
to the table, not the facilitator's.

### Inboxes — `al_inbox`, `al_host_requests`, `al_seats`

- `al_inbox` (Ask WUWF): `kind` (`question | story_idea`), `body` (≤2,000 chars), `email` (optional, "so we can
  tell you what came of it"), `state` (`new | read | answered | declined`), staff notes. **Built without `subject`** (decided while building C: nothing
  a staff member does needs it, and a row that cannot be tied to a visitor id cannot be tied back to one; the rate limit counts the subject
  without keeping it) **and without `outcome_id`** (joins with outcomes, phase F). **No
  account, no checkbox**, per the board. A person reads every one; nothing promises a reply or date.
- `al_host_requests` (board 5c): name, email, `kind` (`invite | public`), organization, seats (12/30/60),
  address, `expected` (`6-8 | 9-12 | 12+`), `when_text`, `invitees_text` (optional), `journalist_requested`,
  `state` (`new | contacted | scheduled | declined`), `event_id` once scheduled. The site says "someone will
  write back within a week", so the staff list surfaces requests older than five days.
- `al_seats` (**moved to phase D**: a seat belongs to an event, and events do not exist until D): `event_id`, `name`, `email`, `subject`, unique `(event_id, email)`, capped by `seats`. Saving a
  seat collects name and email *as a side effect of the seat*; the email is used for that event only.

### Outcomes and reports — `al_outcomes`, `al_reports`

- `al_outcomes` (`query_id | campaign_id | inbox_id`, `kind` `story | episode | report`, `title`, `url`,
  `published_at`, `summary`). The Portal is CMS-agnostic, so this is **a title and an address staff paste**, not a
  reference to a Payload record. The hub's "You asked. Here's what came of it." and components E and F read it.
- `al_reports` (`campaign_id`, `title`, `published_at`, `summary`, `themes` (tag, count), `changes` (the list
  under "So we:"), `url`). Written by staff; the themes can be filled from Sourcework's Synthesis but are
  edited by a person.

**Counts.** The boards show "Asked by 41 people" (F) and monthly response counts (G). Per the rule *no public
tallies on open questions*, the API returns a count **only for a question that has an outcome or a closed
campaign**; an open query's response count never leaves the Portal, and nothing returns a poll-like
distribution of answers.

## 3. What staff do in the Portal

New screens under `/audience-listening` (the tool's existing route segment and access grant; no second
permission vocabulary):

- **Campaigns** — list, create, edit prompts and tags, open/close, attach the query, link the Sourcework project.
- **Events** — list by campaign, approve a public listing, edit, **print table cards** (board 5h, 7×5 in, from
  the console), re-issue a table link, view **Tonight** (board 5g: each table's state, suggested times, "Call
  last five minutes", "Table 7 asked for a hand") and **After** (named/marked per table, reminder state).
- **Conversations** — the transcript with speakers and highlights, contact-card review (the only place a card's
  contents are shown, and only to staff), "Open in Sourcework".
- **Inboxes** — Ask WUWF, host requests (with the five-day flag), seats.
- **Outcomes and reports** — link an outcome; write and publish a report.

The existing query screens are unchanged.

## 4. The signed API

One channel, `listening`, with its own secret (`LISTENING_SIGNING_SECRET` in the Portal, the same value as the
site's `PORTAL_LISTENING_SECRET`; ≥32 characters; a distinct secret per channel and direction, as the site's
CLAUDE.md requires). Requests are POST with a JSON body, signed with `signRequest` over the exact body.

Receiver (`src/lib/audience-listening/site-api.ts`): read the raw body, `verifyRequestSignature`, refuse an
unsupported contract version, parse and validate the body, check the **tool is enabled**
(`private.tool_is_enabled('audience-listening')`, the registry rule), apply a per-subject and per-address rate
limit, call one `al_site_*` function through the admin client, and map its `{ error }` to the contract's code.
It **never logs a body** (answers carry names, emails and phone numbers) — only the path, the code and the
subject's namespace.

The v1 contract's seven messages stand. Added, grouped by surface (the screens in brackets):

| Surface | Messages |
| --- | --- |
| Query flow (6-H, B, C, D, 5b) | `query`, `start`, `progress`, `reserve-answer` (audio **or** written text), `complete-answer`, `save-details`, `finalize` |
| Hub (5, E, F, G) | `hub` (open campaigns, standalone queries, answered questions with outcomes, closed reports) · `report` |
| Inboxes (5, I, 5c) | `inbox-send` · `host-request` · `event` (a public event's page) · `seat-save` |
| Events and tables (5d to 5i) | `table-open` (redeem the single-use link → table session + prompts) · `table-agree` · `table-state` (prompt position, pause, help, ended) · `table-segment` (reserve/complete a segment) · `table-end` · `room` (the organizer console: tables, prompt, last call, polled) · `room-call` · `conversation` (after-page: transcript lines, speakers, highlights) · `speakers-save` · `highlights-save` · `conversation-send` · `contact-card-open` · `contact-card-save` · `forget-subject` |

Table messages are authorised by a **table session**, not a subject: a signed value the Portal issues when the
link is redeemed, bound to the table, expiring with the event day. Organizer messages (`room`, `room-call`)
need a `account` subject that owns the event. The Portal never learns who the account is.

**Audio.** `reserve-answer` and `table-segment` return a Supabase Storage **signed upload URL** for the exact
object key, `PUT` with a raw body and the content type pinned. Storage fixes a signed upload URL's life at two
hours and it cannot be shortened; what bounds it is that the key belongs to a row that is still open and can
only ever overwrite that one object. The row exists before the bytes (the
Milestone 1 rule); a key with no row cannot be written. The bucket stays `audience-listening-media`
(private; segments live under `<event id>/<table id>/<seq>`).

## 5. Rules the Portal enforces so the site does not have to

Open/close dates on every write; at most one in-progress submission per subject and three in total; duration and
size caps at completion; the question snapshot (prompt, position, required); consent required to submit; a
required question answered; contact permission cannot be recorded without a way to reach the person
(**warn on the page, accept in the database** — the board shows a warning, not a block, because some people
want only to be named); a table's agreement before its first segment; a table's link redeemed once; a seat
within `seats`; an event's date within its campaign's span; a closed campaign accepts nothing.

## 6. Privacy

- The Portal sees a subject, the asserted fields, and audio. It does not see the site's cookie, IP or user
  agent. The rate limiter keys on the **site-supplied** subject and the **site server's** forwarded client
  address, which the site passes as a hash (`clientHash`) so the Portal never stores an IP.
- `internal_notes`, review state, reviewer identity, a contact card's contents, and every other participant's
  anything never leave the Portal.
- The IT-04 notice is on every public page that collects information (the site's job; each screen below has
  it). Recordings are kept under the University's policy; that sentence is the board's wording.
- Nothing is published automatically. Using a name requires the three choices above and a staff contact.
- Analytics never receive answer text, names or audio, or the subject.

## 7. Site accounts

Organizers and (optionally) facilitators who want a history are **site accounts**: the site's own Supabase Auth
project (`@supabase/ssr`, passwordless), keyed to an audience profile, as `apps/site/CLAUDE.md` already plans.
The account's id is the `account` subject. **No one needs an account to answer a question, join a session as
a participant, or facilitate a table.** An organizer needs one only to manage their own events. This is a site
dependency of Phase E, not the Portal's.

## 8. Transcription handoff and Sourcework

An event becomes **one Sourcework project with one source per table** (board 5g, "In Sourcework now"). A
campaign is one Sourcework project and its events' tables are sources in it. The Portal creates these with
the existing ingest helpers, as the logged-in staff member who ended the event or by the Portal's own job for
a conversation sent by a facilitator (a service function, scoped to this one purpose and listed in §9).
Names and highlights flow into the source's metadata; Analyze and Synthesis run from Sourcework, unchanged.
A table nobody finishes is still read whole.

## 9. Security register

| Surface | Boundary | Notes |
| --- | --- | --- |
| `/api/site/listening/*` | HMAC signature, 5-minute window, contract version, tool enabled, rate limit | Admin client only to call `al_site_*`; no table access |
| `al_site_*` functions | `execute` for `service_role` only; every row check is on the subject or table session | Reviewed as one list |
| Table link | 256-bit token, hash stored, single use, staff re-issue | Rate-limited redemption |
| Conversation transcript | Returned only to the table session that owns it, not stored by the site | No transcript is cached on the site |
| Contact card | Staff-only read; facilitator sees a count | Separate token per person |
| Storage | Signed upload URL per object; no listing; staff-only select | As Milestone 1 |
| Staff screens | `requireToolAccess("audience-listening")`, RLS | As Milestone 1 |

## 10. Build order

Each step ships with tests for its pure logic, a migration through the ledger (§Database workflow), a guide
update and release note, and works before the next begins.

- **A. The subject-keyed query flow.** `participant_subject`; `al_site_*` for the seven functions; the receiver;
  written answers; display fields on the query (asked by, linked story, campaign); the signed upload URL;
  contract v2; `hub` read minus campaigns. *Unlocks boards 6-H, B, C, D and 5b.*
- **B. Site screens for A**, then the hub (board 5, E, F).
- **C. Inboxes**, Ask WUWF and host requests. Seats and the `event` read move to D, with events.
- **D. Campaigns, events, tables, conversations** in the Portal, with staff screens and table cards.
- **E. Site screens for D** (5c to 5i) and site accounts for organizers.
- **F. Reports and outcomes polish**, the monthly report (board G), follow-through components E and F.

Where it stands (2026-11-09):

- **A is built.** The subject-keyed functions, the receiver and the written answers (`20261107120000`, applied to both projects); the hub
  read, `al_outcomes`, `al_queries.listed_on_hub` and the staff Outcomes tab (`20261109120000`, with its Resources content in
  `20261109130000`). The hub returns open and answered questions only: campaigns and closed-campaign reports do not exist until D, and
  join the message as additive fields. A query is on the hub only when a staff member turns on "List on the website's listening page"
  (off by default, so nothing is published automatically). A count of answers is returned only beside an outcome.
- **B is built on the site** (`apps/site`, `ROADMAP.md` -> *Listening: where it stands*): the full set, the inline asks B, C and D, the
  invitation A and the hub. Still to do for B: an editor block to place the inline asks in a story, a topic page and an episode.

- **C is built on the Portal** (`20261110120000`, with its Resources content in `20261110130000`; applied to both projects the same day, with the table privileges of `anon` and `authenticated` revoked first so the column grant for staff actually limits what they can edit): `al_inbox` and `al_host_requests` (staff-only RLS, staff may change only state, notes and
  who and when), `al_site_inbox_send` and `al_site_host_request` (service_role only), the contract's `inbox-send` and `host-request`
  messages, hourly rate limits (5 messages and 3 requests per subject, 30 and 15 per client address), and the staff pages Questions and ideas (the site calls it Ask WUWF; the Portal never names a station) and
  Host requests at `/audience-listening/inbox` and `/audience-listening/host-requests` with a count in the section navigation. Host
  requests list oldest first and flag any still new after five days. **Not built:** the host-request email and the daily Ask WUWF digest
  (they need the Resend wiring; until then the counts are the signal), and the site's Ask WUWF box and host-request form (board 5c).

- **D, first half, is built on the Portal** (`20261111120000`, with its Resources content in `20261111130000`): `al_campaigns`, `al_campaign_prompts`,
  `al_campaign_tags`, `al_events`, `al_tables` and `al_seats` (staff-only RLS; staff write only a table's number and link, never its
  recording state), the `coordinator` tool role and the guard on listing (§11 item 4, as the working default), the span, seat-capacity and
  close-the-query rules, and the staff screens Campaigns, Events, tables, seats and printable table cards at `/audience-listening/campaigns`
  and `/audience-listening/events`. A table link is a hash of a 256-bit token; the card carries `WEBSITE_ORIGIN` + the contract's table path.
- **D, second half (first part), is built on the Portal** (`20261111140000`, with its Resources content in `20261111150000`): the table session
  (`al_site_table_open/state/agree/update/segment/segment_complete/end`, authorised by a session whose hash is stored, ended by re-issuing the
  link), the group agreement recorded with the wording version shown, `al_consent_texts` (insert-only numbered versions, a coordinator adds them),
  `al_conversations` and `al_conversation_segments` (staff read), the signed segment upload, `al_site_event` and `al_site_seat_save`, their
  contract messages, and the Consent wording page.
- **D, the rest, is built on the Portal** (`20261111160000`, with its Resources content in `20261111170000`): `al_speakers`, `al_highlights` and
  `al_contact_cards`; the messages `conversation`, `speakers-save`, `highlights-save`, `conversation-send`, `contact-card-open`, `contact-card-save`,
  `room` and `room-call`; the table's second QR token; `al_events.console_seen_at` ("help is coming" only while a console is watching); the staff
  screens Tonight, Table (transcript with names and marks, contact-card review, Send to Sourcework) and Purge; and one email to a shared mailbox per
  host request. A campaign is one Sourcework project and each table a source in it (§8's two statements are reconciled this way).
  **Decided while building:** the card's second QR is made only with a whole printed card; once the facilitator sends, the conversation reads but
  does not change; retention for contact cards and raw audio waits for a report date (phase F) and is not guessed. **Not built:** the daily Ask
  digest (no scheduler), the website's pages for all of the above (E), and reports and outcome links (F).

- **E is built on the site** (`apps/site`, 2026-11-13; `apps/site/ROADMAP.md` -> *Listening: where it stands*): the table card's page
  `/listens/table/<token>` (redeemed by a press, never on load, so a link previewer cannot use up a card), the table's phone `/listens/session`
  (the agreement, recording in segments of under five minutes put straight to the signed address, prompts, pause, help, end), the contact card
  `/listens/card/<token>` (board 5i), a public event's page and seat form `/listens/events/<publicId>`, the facilitator's after-page
  `/listens/session/after` (name and merge voices, mark lines, send) and the organizer's console `/listens/room/<publicId>` (needs a site
  account that owns the event). Nothing here stores a transcript, a card or audio. **Known gaps, not hidden:** (1) no code sets
  `al_events.organizer_subject`, so no organizer account can own an event until a staff screen or a claim step sets it to `site:account:<id>`;
  (2) the table session ends 12 hours after the event, so the after-page must be used on the recording phone within that window, and nothing
  emails the facilitator a link (the boards promise one); (3) ~~a segment not yet sent is held in memory~~ fixed 2026-11-13: unsent segments, and the one being recorded, are copied to the browser's
  IndexedDB until the Portal confirms them, and a page reloaded after the table ended asks the Portal what it holds before saying the recording is in; (4) the hub does not yet link to events, because the
  hub message carries none. **Not built:** reports and outcome links (F).

## 11. Open items for the owner

**Dropped (2026-11-09): everything that sends a text message.** The board's "Can't scan? The welcome table can text you the link"
(table join, 5d) and "Text or leave a voice message any time: [Listener line]" (the hub footer) are left out when those screens are
built, and no SMS provider is chosen. Staff re-issue a link and hand it over (above). Revisit if the station later picks a provider.

**Adopted as the working defaults (owner, 2026-11-09): every recommendation below, for now.** They are what the Portal and the site
are built toward, and each is revisited before the first real session: the consent wording and the purge schedule with UWF counsel and
the records officer, the notification and approval choices with whoever will do the work. Nothing in code assumes them yet; each lands
with the phase that needs it (consent and retention with D, notifications and approval with C and D).

1. **Group-consent wording.** Stored as `consent_text_version` on the table; a change is a new version, never an edit. Before the first
   session, with whoever holds the IT-04 policy and UWF counsel:
   - *The board's promise and the board's model disagree.* The text says "Nothing anyone says goes on air or online without WUWF
     asking that person first." The canvas model says someone WUWF cannot reach "still counts and can be quoted without identifying
     detail". Both cannot be kept. Either narrow the sentence to what the Portal enforces ("Nothing you say is broadcast or published
     with your name without asking you first") or make people who left no contact card unusable. Recommended: narrow the sentence.
   - *Put the agreement on the tape.* Florida requires every party's consent to record a private conversation (Fla. Stat. 934.03; counsel
     should confirm). The facilitator's tap is a record, but the table's recording starts after it. Add to the first prompt, "say your
     first name, where you live, and that you're okay being recorded", so each voice agrees on the recording itself.
   - *Say what the text now leaves out:* that the recording is transcribed by software, that the University keeps it under its records
     policy, and that anyone under 18 needs a parent or guardian to say yes.
2. **Retention.** Software cannot purge on its own (there is no job queue), so each rule below is a staff-run "Purge what is due" screen
   with a visible due list, not a background job.
   - Unsubmitted answers, segments and unsent cards: delete after 30 days (as proposed; the site's visitor cookie also lasts 30 days).
   - Contact cards: keep until the campaign's report is published plus 12 months, then delete unless the person was named in published
     work (keep the consent record for as long as that work is up).
   - Raw audio and transcripts of material never used: delete 24 months after the campaign's report, unless the station's records
     officer sets a different schedule. Excerpts used in published work follow the station's archive rules.
   - Ask the transcription vendor to keep nothing beyond processing, and record that setting.
3. **Staff notification.**
   - Host requests: one email to a shared Audience & Engagement mailbox (not a person), through the Portal's existing Resend sender;
     the staff list flags any request older than five days because the site promises a week.
   - "Table asked for a hand": the console only, with a visible and audible alert, because it must reach someone in the room. Show the
     table "Help is coming" only while a console has polled in the last minute; otherwise say "We've flagged this. If it's urgent, ask the
     front", so the page never promises help nobody can see the request for.
   - Ask WUWF items: no per-item email; one daily digest to editors, sent only when something is new.
4. **Who may approve a public event for listing.** A named role, not any grant: a `coordinator` tool role (the Audience & Engagement lead
   and one backup), as Academic Partnerships does. Listing puts a stranger's event on WUWF's name, so the approval screen is a checklist:
   a public place, an identified organizer with a verified email, a date inside the campaign, accessibility details, nothing that is a
   fundraiser or campaign event, and the consent reading acknowledged. Approving and declining are audited, and a decline sends the
   organizer a reason. Every public event is reviewed, including a returning organizer's.
