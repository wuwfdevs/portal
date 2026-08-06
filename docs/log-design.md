# Log — Product & Engineering Design

Status: **Design, not yet authorized to build.** First of the three tools
`docs/broadcast-operations-strategy.md` splits the WUWF Unified Broadcast
Rundown and Traffic System spec into, and the one the strategy doc's build
order (§6) puts first, because it owns the operational spine — Program,
Clock, Content item, Rundown, Broadcast event — that Underwriting & Traffic
and FCC Reporting both read from once they exist.

Read `docs/broadcast-operations-strategy.md` first — it records why this is
three tools instead of one, and why this tool in particular owns the shared
tables rather than a new foundation layer. This document is the one-tool
depth pass the strategy doc's §8 calls for, at the level of
`docs/roadmap-design.md`/`docs/academic-partnerships-design.md`. Source
material throughout is the `WUWF Unified Broadcast Rundownand Traffic
System` spec (§ references below point there).

---

## 1. The problem we're solving

WUWF's daily broadcast planning is split across tools that don't talk to
each other: RadioTraffic's log, the NPR Rundowns App, a weather source
checked separately, and whatever a host has printed or scribbled for local
content. None of them know about the others' timing. A host building a
local break has to hold the network clock, the underwriting obligations, and
the available local content in their head simultaneously, live, on air.

Log is the answer to four questions the source document poses (Executive
summary): **What must air? What can air? What did the host choose? What
actually aired?** Those are four different moments — the clock's structural
requirement, the content library's eligible material, the host's assembled
plan, and the as-aired record — and Log is the one place all four live
together, in that order, for every program.

It is not a general newsroom CMS and not a scheduling algorithm that removes
the host from the loop. §1.2's "human control during live radio" is load-
bearing: Log calculates, warns, and surfaces options; a host decides.

---

## 2. Product model

Nine objects, three of them (Contract, Placement obligation, Affidavit) explicitly out of scope here — see `docs/broadcast-operations-strategy.md` §4.

### Program
A recurring or special broadcast program (§3, §4.1) — *Morning Edition*,
*Ranger Rick's Radio Hour*, a pledge-drive special. Identifies scheduled air
periods; doesn't itself carry timing structure.

### Clock template / Clock version
A **clock template** is the named, editable clock staff maintain — "Weekday
Morning Drive," "Weekend Classical." A **clock version** is an immutable,
dated snapshot of that template's slots. This split exists for the same
reason Audience Listening's answers snapshot their question rather than
referencing a live `al_questions` row: a completed rundown must forever
point at the exact clock that generated it (§4.3, "preserve the schedule and
clock version used for completed broadcasts"), and a template that keeps
changing underneath it would silently rewrite history. Editing a template
creates a new version; old rundowns keep referencing the old one.

### Clock slot
A position within a clock version (§4.2): start offset, duration, permitted
content types, and — the part that drives everything downstream — whether
it's required, optional, or host-fillable; whether it's filled
automatically, pre-assigned, or host-selected; whether it can be moved,
replaced, shortened, or left empty; whether timing is fixed or floats with
the network.

### Content item / Content component
A **content item** is reusable or one-time material (§7): news, a station
promo, a membership message, a university announcement, a PSA, legal ID, an
interview or feature, or a host-created one-off. A **content component** is
a timed part of it — live intro, recorded audio, live outro, optional tag
(§7.3). Total occupied time is always the sum of required components; a
30-second promo with a required 8-second outro is a 38-second commitment,
never displayed as 30.

Underwriting credits are deliberately not a Log content type — see §6's
"Deferred: the Underwriting boundary" below.

### NPR rundown cache
The most recently retrieved network segment order, story info, and
forward-promo copy (§5) — an integration cache of an external source, never
edited locally, always labeled with when it was last successfully retrieved.

### Weather reading
One current live-read, not one row per slot (§8) — every weather slot in
every rundown references today's current version.

### Rundown / Rundown item
A **rundown** is the generated, editable plan for one program's air period or
host shift. A **rundown item** is a specific placement of a content item (or,
once Underwriting ships, an underwriting credit) into a clock slot.

### Broadcast event
The planned-versus-actual record of one rundown item's airing (§15). This is
the critical distinction the source document names explicitly: **a content
item is not the same as an airing.** One story can have many broadcast
events across many air dates, each independently outcome-tracked.

---

## 3. Primary user workflows

### A. Defining a clock (producer)
A producer builds or edits a clock template's slots — offsets, durations,
permitted content types, fill behavior. Saving creates a new clock version;
the template itself has no "current slots" a rundown can silently drift
onto. Existing rundowns keep citing whichever version was current when they
were generated.

### B. Scheduling programs (producer)
Maintains the recurring weekly grid, associates each program with a clock
template, and layers in date-bounded substitutions, holidays, and temporary
pledge-drive/breaking-coverage exceptions (§4.1, §4.3).

### C. Managing the content library (newsroom, promotions, any member)
Newsroom staff create news items with scripts, summaries, expected
durations, geography and subject tags, and eligible newscasts (§9).
Promotions staff create promos and institutional announcements with
campaign dates, eligible programs/slots, priority, and required/optional
tags (§10). Both browse, search, and retire their own stale content;
neither needs a producer role to do it — content authorship is open to any
tool member, matching §2.2/§2.3's framing of these as ordinary staff duties,
not privileged ones.

### D. Reading NPR and weather in context
The current NPR segment order and forward-promo copy render inline in
chronological position within the rundown (§5.2) — not a separate tab. Same
for the current weather live-read (§8.3): a host reads it from any weather
slot, sees when it was last updated, can refresh manually, and can make a
temporary edit for the current airing without overwriting the master copy
that every other slot references.

### E. Building the daily rundown (host, or a producer preparing ahead)
For each host-fillable slot, Log shows total available time, any required
material already occupying it, remaining time, and eligible existing
content with its full duration including intros and tags (§11.2). A host
searches, browses, and filters the content library; adds an existing item;
creates a new one-time item without leaving the rundown; reorders, replaces,
or removes; and previews recorded audio before committing. Every action
recalculates timing immediately (§11.3, §12).

### F. Running the console live (host)
During the broadcast, the host console (§13) shows current and next item,
readable copy at an adjustable size, network outcue/rejoin information, NPR
forward-promo copy, upcoming underwriting obligations, current weather, and
time remaining — one screen, minimal navigation. §12.4's live timing state
(on time / running long / running short / at risk of missing a required
item / at risk of missing rejoin) is computed continuously, not on request.

### G. Mid-broadcast host actions
When timing shifts, a host marks an item **aired**, **moved** to another
valid opening (§14.2 — Log evaluates program/daypart/duration/spacing/
inventory eligibility and shows valid destinations), or **missed** with a
brief reason and no lengthy narrative (§14.3). Every deviation is retained,
never silently dropped from the record (§1.2's "planned is not aired"). A
brief undo period follows any move.

### H. Completing and submitting a rundown (host)
At the end of a shift, the host reviews unresolved items and submits. That
freezes a reference version of the rundown while still allowing documented
management corrections afterward (§15.3) — submission is a checkpoint, not
a lock that erases the ability to fix a mistake.

---

## 4. Screens

```
/log                              Today's programs and their rundown status
/log/clocks                       Clock template list (producer)
/log/clocks/[id]                  Clock template editor — slots, versions (producer)
/log/programs                     Program schedule (producer)
/log/library                      Content library: browse/search/filter by type
/log/library/[id]                 Content item detail — components, air history
/log/library/new                  Create a content item
/log/weather                      Current weather live-read, manual refresh
/log/rundowns/[id]                Rundown builder: slots, timing, host actions
/log/rundowns/[id]/console        The live host console (§13)
```

**`/log`** — today's schedule, one row per program with its rundown's
status (not generated / generated / in progress / submitted) and a quick
link into the builder or, once a shift starts, the console.

**`/log/rundowns/[id]`** — the pre-air builder: clock slots down the left,
each host-fillable slot showing remaining time and an eligible-content
picker; NPR and weather render inline at their chronological position.

**`/log/rundowns/[id]/console`** — the live view (§13's requirements
verbatim): large controls, current/next item, adjustable text size, and the
three mid-broadcast actions (aired / move / missed) always one tap away for
whatever's currently live.

---

## 5. Data model

Ten tables, prefixed `log_` per CLAUDE.md's directory conventions.

### `log_programs`
`id`, `name`, `description`, `kind` (`recurring` | `special`), `created_at`,
`created_by`.

### `log_clock_templates`
`id`, `name`, `description`, `created_at`, `created_by`, `updated_at`.

### `log_clock_versions`
`id`, `clock_template_id`, `variant` (`weekday` | `weekend` |
`program_specific` | `holiday` | `special_event`), `effective_from`,
`effective_to` (nullable), `created_at`, `created_by`. Immutable once a
rundown references it — no update path on this table from the application
beyond the fields above at creation; a correction is a new version.

### `log_clock_slots`
`id`, `clock_version_id`, `position`, `start_offset_seconds` (nullable —
some slots float), `duration_seconds`, `permitted_content_types` (`text[]`),
`fill_mode` (`required` | `optional` | `host_fillable`), `assignment_mode`
(`automatic` | `preassigned` | `host_selected`), `replaceable` bool,
`shortenable` bool, `allow_empty` bool, `allow_multiple` bool, `timing_mode`
(`fixed` | `float`), `lock_on_air` bool, `label`.

### `log_schedule`
`id`, `program_id`, `clock_template_id`, `entry_type` (`recurring` |
`override` | `holiday`), `days_of_week` (`int[]`, for `recurring`),
`start_date`, `end_date` (nullable), `effective_from`, `notes`,
`created_by`.

### `log_content_items`
`id`, `content_type` (`news` | `station_promo` | `program_promo` |
`membership_message` | `university_announcement` | `psa` | `legal_id` |
`interview_feature` | `host_created`), `title`, `script` (nullable),
`audio_object_path` (nullable, in a `log-media` storage bucket), `summary`,
`expected_duration_seconds`, `effective_from`, `effective_to` (nullable),
`owner_id`, `approval_status` (`draft` | `approved` | `retired`),
`eligible_program_ids` (`uuid[]`), `priority`, `frequency_guidance`,
`reusable` bool, `geography_tags` (`text[]`), `subject_tags` (`text[]`),
`community_issue_tags` (`text[]` — free text in this milestone; becomes a
real reference once FCC Reporting's taxonomy exists, see §6),
`reporter_or_editor` (nullable, news-specific), `created_at`, `updated_at`,
`created_by`.

### `log_content_components`
`id`, `content_item_id`, `component_type` (`live_intro` | `recorded_audio` |
`live_outro` | `optional_tag`), `sequence`, `duration_seconds`, `required`
bool, `script` (nullable), `audio_object_path` (nullable).

### `log_npr_rundown_cache`
`id`, `program_id`, `segment_order` (`int`), `story_title`,
`story_description`, `forward_promo_copy`, `status` (`draft` | `edited` |
`revised` | `withdrawn`), `advisory_text` (nullable), `retrieved_at`. Rows
are replaced wholesale on each successful retrieval, not diffed — the point
is "what did we last successfully get," not a change history.

### `log_weather_reading`
`id`, `forecast_area`, `source`, `live_read_text`, `condensed_text`,
`high_temp`, `low_temp`, `conditions_summary`, `precipitation_notes`
(nullable), `hazards` (nullable), `last_updated_at`, `valid_through_at`,
`is_current` bool (exactly one row true at a time; prior rows are the
revision history §8.1 asks for).

### `log_rundowns`
`id`, `program_id`, `schedule_entry_id` (nullable), `clock_version_id`,
`air_date`, `shift_start_at`, `shift_end_at`, `status` (`draft` |
`generated` | `in_progress` | `submitted`), `generated_at`, `submitted_at`,
`submitted_by`.

### `log_rundown_items`
`id`, `rundown_id`, `clock_slot_id`, `content_item_id`, `position`,
`scheduled_at`, `planned_duration_seconds`, `requirement_level`
(`required` | `suggested` | `optional`, defaults from the slot but can be
overridden for a specific placement), `placement_status` (`locked` |
`movable` | `replaceable` | `editable`), `current_warning` (nullable —
`timing_conflict` | `stale_content` | `none`).

### `log_broadcast_events`
`id`, `rundown_item_id`, `outcome` (`scheduled` | `aired_as_scheduled` |
`aired_different_time` | `partially_aired` | `skipped` | `missed` |
`replaced` | `wrong_copy_aired` | `unconfirmed` | `pending_review` |
`makegood_scheduled` | `makegood_aired` | `waived` — the full §15.1
vocabulary), `actual_started_at` (nullable), `actual_duration_seconds`
(nullable), `confirmation_source` (`automation` | `host` |
`exception_report` | `management_correction`), `reason` (nullable —
`network_timing` | `breaking_news` | `segment_overrun` | `technical_problem`
| `host_error` | `unavailable_copy` | `other`, from §14.3), `notes`
(nullable), `recorded_by`, `recorded_at`.

This is the single source of as-aired truth. Underwriting's post-broadcast
exception queue and FCC Reporting's quarterly aggregation both read it
through scoped additive RLS — neither tool writes it.

---

## 6. Architecture

### RLS shape: member vs. producer, same pattern as curator/coordinator

Every `log_*` table is staff-only, gated by `private.has_log_access` — a
standard `tool_access` membership predicate, no `security definer` public
surface (Log has no unauthenticated participant the way Audience Listening
or Academic Partnerships do). Within that membership, two roles:

- **Member** — any granted user. Builds and executes rundowns, manages
  content library items, runs the console, records mid-broadcast outcomes.
- **Producer** — `tool_access.tool_role = 'producer'`. Additionally edits
  clock templates/versions and the program schedule.

This is the same shape Roadmap's curator and Academic Partnerships'
coordinator use: a `tool_access` grant is the ticket in, `tool_role` is the
elevation, and the portal itself still doesn't interpret the string —
`private.is_log_producer` is this tool's own predicate, same as
`private.is_roadmap_curator`.

### Deferred: the Underwriting boundary

`docs/broadcast-operations-strategy.md` §2 settles the eventual shape of an
underwriting credit occupying a rundown slot: `log_rundown_items` gets an
`item_kind` column and a second nullable reference
(`underwriting_copy_id`), mirroring `sw_source_excerpts`' locator pattern.

That shape is **not** built in this milestone. `uw_copy` doesn't exist yet,
and a nullable `uuid` column with no FK target — provisioned now against a
table that might change shape before it ships — is exactly the kind of
speculative schema this repo avoids elsewhere ("don't design for
hypothetical future requirements"). Instead, milestone 1 lists
`underwriting_credit` as an ordinary `log_content_items.content_type` (per
§7.1's own table, which lists it alongside news and promos), manually
managed within Log — no contracts, no automatic scheduling, no affidavits.
A host can still mark one aired, moved, or missed, so the mid-broadcast
workflow (§14) and the as-aired record (§15) both work end-to-end before
Underwriting exists.

When Underwriting ships, its migration adds `item_kind` and
`underwriting_copy_id` (with a real FK, since `uw_copy` will exist by then)
to `log_rundown_items`, and its own scheduler starts producing placements
instead of a traffic staffer manually creating `underwriting_credit`
content items. Existing manually-placed credits are unaffected — they stay
`item_kind = 'content'` — because milestone 1 never claimed they were
contract-driven.

### Deferred: the FCC Reporting boundary

Same reasoning, smaller: `log_content_items.community_issue_tags` is
`text[]` in this milestone, not a reference to a taxonomy table, because
`fcc_community_issues` doesn't exist yet. FCC Reporting's own migration is
where a real controlled vocabulary and a proper reference — or a mapping
step for whatever free text accumulated before then — gets built.

### No job queue: NPR and weather refresh lazily, not on a schedule

This repository still has no job queue (true as of every tool built so
far). NPR (§5) and weather (§8) both want to look continuously current, but
neither gets a cron job. Instead:

- **Weather** refreshes on a stale-check at read time: opening a rundown or
  the console checks `log_weather_reading.last_updated_at` against a
  threshold and triggers a refetch server-side if stale, plus a manual
  "Refresh" button per §8.3. The same lazy-refresh shape Sourcework's
  Mistral OCR uses via `after()` doesn't apply here — there's no long job to
  detach from a request, just an API call cheap enough to make inline.
- **NPR** works the same way: the console polls its own server (short
  client-side interval, matching Remote Interview's waiting-room poll
  pattern — there's still no notification layer in this repo to push
  updates instead), and each poll both returns current data and triggers a
  background refetch if the cache is older than the network's own update
  cadence.

Both paths keep the last successful version on a fetch failure and mark it
stale rather than blocking or clearing the display (§5.2, §8.2,
§22 — "operational resilience... a temporary API or network failure must
not make the current rundown unreadable").

### Timing is a pure, tested module — not stored state

§12's fit calculations (remaining time in a slot, remaining time in the
break, overage/underrun, time to rejoin, the effect of adding/removing/
moving an item) are never persisted as a computed column. They're derived
in `lib/log/timing.ts` from `log_rundown_items` + `log_clock_slots` +
wall-clock time, the same way `lib/remote-interview/call-status.ts` derives
participant status from events rather than storing it — pure functions, no
Supabase import, colocated tests, safe to recompute on every render.

### Host console resilience: queue actions locally, sync on reconnect

§22 requires the current rundown to survive a temporary connectivity loss
without becoming unreadable, and requires unsent host actions to be
preserved and synchronized when connectivity returns. The console caches
the active rundown in the browser (IndexedDB) on load and after each
successful sync, and queues mid-broadcast actions (aired/move/missed)
locally with a client-generated id, retrying with backoff until
acknowledged — the same write-then-sync-then-acknowledge shape Remote
Interview's local capture uses for audio chunks, applied here to small
action records instead of media. An action is never lost to a dropped
connection; it's replayed once the console is back online. External
updates (an NPR revision, a weather refresh) never silently overwrite copy
a host is actively reading (§5.2, §22) — a change is flagged, not applied,
until the host acknowledges it.

### Fit with portal conventions

`requireToolAccess("log")` gates the route segment; Server Actions in
`actions.ts` per screen area (`clock-actions.ts`, `library-actions.ts`,
`rundown-actions.ts`) assert access first and use `failIfError`/`failWith`
for the standard `?error=` bounce-back; reads live in `lib/log/queries.ts`
behind `unwrapRead()`; pure logic (timing, the mid-broadcast state machine,
content-eligibility filtering) sits in colocated `*.test.ts`-covered
modules with no Supabase import, following `lib/roadmap/posts.ts`'s
pattern.

Capabilities registered for the MCP/agent layer:
`log.rundown.buildItem` (add/replace a content item in a slot),
`log.rundownItem.recordOutcome` (the aired/move/missed action), and
`log.content.search` (mirroring `sourcework.project.search`) — the three
operations useful to drive from the in-portal agent without a live console
in front of you.

### What's deliberately not in the architecture (milestone 1)

- **No automation-system integration.** `confirmation_source = 'automation'`
  exists in the schema for when that integration is built, but nothing
  populates it yet — every milestone-1 outcome is host-confirmed. Which
  automation system and what export format it needs is still an open
  question in the strategy doc (§7).
- **No video.** Out of scope for this entire product area per the source
  document's silence on it; Remote Interview's own video deferral (Phase 5,
  not authorized) is unrelated but sets the same precedent — audio-first,
  video only when explicitly asked for.
- **No second concurrent host editing the same rundown.** Like Remote
  Interview's studio slice 3 ("no second staff member can join a session's
  Daily room"), one editor at a time keeps this milestone's concurrency
  story simple; multi-host handoff is a real scenario (a board-op and a
  host) but not one this milestone needs to solve.
- **No notification layer**, same as every tool before this one. A stale
  NPR/weather flag or an unresolved exception is visible when the relevant
  screen is open, not pushed.

---

## 7. Milestone 1, and what is left

**Milestone 1** ships: clock templates and versions, program scheduling,
the content library (all types from §7.1 except contract-driven
underwriting), NPR rundown display, the weather live-read, daily rundown
generation, the host console with continuous timing, the three mid-broadcast
actions writing directly to `log_broadcast_events`, and rundown submission.
A "missed underwriting credit" is fully recordable — it's just an
unresolved outcome on a broadcast event with nobody yet reading it into a
queue, because Underwriting doesn't exist yet.

**Deferred, matching the strategy doc's build order:**

1. **Underwriting integration** — the `item_kind`/`underwriting_copy_id`
   polymorphism and automatic scheduling, once Underwriting & Traffic ships
   (`docs/underwriting-design.md`, not yet written).
2. **FCC community-issue taxonomy as a real reference**, once FCC Reporting
   ships (`docs/fcc-reporting-design.md`, not yet written).
3. **Automation-system confirmation**, pending an answer to which system and
   what format (strategy doc §7).
4. **Multi-editor rundown concurrency**, if a real second-host scenario
   turns out to need it.

**Open questions specific to this tool, not yet answered:**

- What NPR API or feed is actually available to poll, and at what rate
  limit or update cadence? (Determines the console's poll interval and
  whether "lazily refresh on read" is fast enough in practice.)
- Which weather API/vendor, and what's in its contract terms about update
  frequency and forecast-area granularity?
- Do any of WUWF's current clocks have slot behavior not covered by
  `fill_mode`/`assignment_mode`/`timing_mode` as sketched in §5 above? The
  strategy doc flags this as unresolved (§7); it should be checked against
  real clock examples before `log_clock_slots`' columns are finalized in a
  migration.
