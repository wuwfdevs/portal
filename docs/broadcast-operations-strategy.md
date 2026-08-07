# Broadcast Rundown & Traffic — Strategy and Schema Plan

Status: **Pre-design. Not authorized to build.** This document records the
tool-boundary and schema decisions made before any of the three tools below
gets its own design doc, migration, or route. Nothing in this document has
been implemented.

Source: `WUWF Unified Broadcast Rundownand Traffic System` (functional
requirements, August 2026), supplied by WUWF. That document specifies one
system; this one splits it into three portal tools sharing one schema
lineage, and records why.

---

## 1. Why three tools, not one

The source document names five distinct user groups (§2): traffic/underwriting
staff, newsroom staff, promotions staff, on-air hosts, and management. Three of
those groups have workflows that don't just differ in content — they differ in
*operating mode*, the way this portal's existing tools differ from each other:

- **On-air hosts** need a live, low-latency console (§13) built for
  under-pressure use during a broadcast: large controls, minimal typing,
  continuous timing math, local resilience during a connectivity drop.
- **Traffic staff** need contract/copy administration, an automatic
  scheduler, a post-broadcast exception queue, and affidavit generation
  (§6, §16, §17) — ordinary CRUD-and-review work with no live-broadcast time
  pressure at all.
- **Newsroom, management, and a compliance officer** need a quarterly,
  low-frequency compliance workflow (§18) that aggregates months of
  broadcast history into an FCC filing — a completely different cadence and
  audience from the other two.

Building this as one tool would force at least one of those groups through a
UI shaped for a different one — most damagingly, cluttering the live console
with admin surface that has no business being on screen during a broadcast.
This portal's existing precedent is to split by user group and workflow, not
by data domain (Sourcework's Source Library and project workspace stay in
*one* tool because they're the same audience doing the same kind of work;
Remote Interview and Sourcework are separate tools despite both being
media-processing pipelines, because the people and moments of use differ).
The same logic applies here, more strongly, because the operating-mode gap
between "live broadcast" and "quarterly filing" is wider than anything else
in this portal today.

**The three tools:**

| Tool | Route | Tool key | Table prefix | Primary users |
|---|---|---|---|---|
| Log | `/log` | `log` | `log_` | Hosts (primary); newsroom and promotions staff as content contributors; management (read) |
| Underwriting & Traffic | `/underwriting` | `underwriting` | `uw_` | Traffic staff; management |
| FCC Reporting | `/fcc-reporting` | `fcc-reporting` | `fcc_` | Newsroom staff; management; compliance officer |

Each gets its own `requireToolAccess()` gate and its own migration(s), per the
portal's standard tool pattern — no portal-schema changes beyond narrowly
scoped additive RLS, same as every tool before it.

---

## 2. Schema ownership

The three tools share data more deeply than any two tools in this portal do
today: Underwriting's scheduler has to *write* into Log's rundown inventory,
not just read it, and FCC Reporting aggregates broadcast history that Log
produces. That's a real difference from existing cross-tool cases (Roadmap
reading `tools`, the MCP audit policy, Sourcework/Remote Interview's ASR
handoff) — but the *shape* of the answer is the same one this portal always
reaches for: **one tool owns each table outright; another tool gets a
narrowly scoped additive RLS policy and/or a capability, never a second
migration adding parallel tables for the same concept.**

**Log owns the operational spine** — Program, Clock, Content item, Rundown,
Broadcast event — because it's the tool that generates and executes the daily
rundown; every other table in the system exists to feed or consume that
spine. Underwriting and FCC Reporting are consumers with scoped write paths
in, not co-owners.

This also settles where an underwriting credit lives when it occupies a
rundown slot. Rather than mirroring underwriting copy into a shadow
`log_content_items` row (a sync problem waiting to happen), `log_rundown_items`
takes the same shape Sourcework's `sw_source_excerpts` already uses for
"exactly one of several possible references": an `item_kind` column
(`content` | `underwriting_credit`) with `content_item_id` and
`underwriting_copy_id` both nullable, and a check constraint requiring
exactly one to be set. Same pattern, not a new one.

---

## 3. Log — schema sketch

Owns the structural and operational core (source doc §4, §5, §7–§9, §11–§15).

- `log_programs` — recurring/special broadcast programs.
- `log_clock_templates` — versioned clocks (weekday/weekend/program-specific/
  holiday/special-event), each with an effective date and a pointer to which
  version generated a given rundown (§4.3).
- `log_clock_slots` — ordered positions within a template: offset, duration,
  permitted content types, required/optional/host-fillable, fill behavior,
  movable/replaceable/lockable, fixed vs. float timing (§4.2).
- `log_schedule` — maps programs to the calendar: the recurring weekly grid
  plus date-bounded substitutions and holiday overrides (§4.1).
- `log_content_items` — every non-underwriting content type from §7.1 (news,
  station/program promo, membership message, university announcement, PSA,
  legal ID, interview/feature, host-created item). Underwriting credits are
  explicitly out — see §2 above.
- `log_content_components` — live intro / recorded audio / live outro /
  optional tag rows under a content item, each independently timed, so total
  occupied time is always the sum of required components (§7.3).
- `log_npr_episodes` / `log_npr_episode_items` — the most recently retrieved
  dated NPR program-episode (NPR's Content Distribution Service model —
  see `docs/log-design.md` §5) for each mapped program, and its ordered
  story items, with a retrieved-at timestamp and a flag for staleness (§5)
  — a cache of an external source, not user-authored data.
- `log_weather_reading` — single current row plus revision history, not one
  row per clock slot (§8) — every weather slot references the current
  version.
- `log_rundowns` — one per program/host shift instance: generated, edited,
  and eventually submitted/frozen (§15.3).
- `log_rundown_items` — placements within a rundown: slot reference,
  `item_kind` (see §2), scheduled/planned time and duration, required/
  suggested/optional, locked/movable/replaceable, current air status.
- `log_broadcast_events` — the as-aired record: one row per rundown item with
  the full outcome vocabulary from §15.1 (aired as scheduled, aired at a
  different time, partially aired, skipped, missed, replaced, wrong copy
  aired, unconfirmed, pending review, makegood scheduled/aired, waived),
  actual duration, and confirmation source (§15.2). This is the single
  source of as-aired truth both other tools read.

Community-issue tagging on news items (§9's "subject and community-issue
tags") references a taxonomy — see §5 below for why that taxonomy lives in
FCC Reporting rather than here.

---

## 4. Underwriting & Traffic — schema sketch

Owns contract administration and everything downstream of it (source doc §6,
§16, §17).

- `uw_contracts` — underwriter, agreement, effective dates, status, notes.
- `uw_placement_obligations` — one or more per contract: quantity, date
  range, program, daypart, duration, frequency/distribution, position
  restrictions (§6.2).
- `uw_copy` — script/audio, duration, cart identifier, effective/expiration
  dates, approval and production status, linked to the contracts allowed to
  use it (§6.3).
- `uw_scheduled_placements` — the automatic scheduler's output: which
  obligation is slated into which `log_clock_slot` on which date, and its
  status (scheduled / locked / conflict) (§6.4). Log's rundown generation
  reads eligible rows here the same way it reads `log_content_items` — the
  scheduler doesn't write `log_rundown_items` directly; Log still owns
  turning an eligible placement into an actual rundown item.
- `uw_exceptions` — the post-broadcast queue (§16): rows created against
  `log_broadcast_events` where the outcome is moved/missed/disputed, carrying
  the applicable contract requirement, compliance judgment, and resolution
  (accept alternate airing / schedule makegood / reassign / waive / request
  clarification / note / close).
- `uw_makegoods` — scheduled and aired makegood tracking, linked to both the
  originating obligation and the exception that produced it.
- `uw_affidavits` — generated from confirmed or management-approved
  `log_broadcast_events` rows, never from the original schedule alone (§17)
  — retains a durable link to the underlying events for audit and
  regeneration.

**Cross-tool write path:** the scheduler and the mid-broadcast host actions
(§14 — aired/move/missed) both need to cross the Log/Underwriting boundary.
Per the capability-layer convention already in this repo (Phase A/B,
`src/lib/capabilities/`), that boundary should be a capability
(`underwriting.credit.schedule`, `underwriting.exception.resolve`, etc.), not
direct cross-tool table access from Server Actions — same shape as
`audience-listening.answer.sendToSourcework`.

---

## 5. FCC Reporting — schema sketch

Owns the compliance taxonomy and quarterly filing workflow (source doc §18).

- `fcc_community_issues` — the controlled taxonomy referenced by
  `log_content_items`' community-issue tags (§9, §18.1) — owned here because
  the taxonomy's shape and lifecycle are compliance decisions, not editorial
  ones, even though the tags themselves are set on Log's content.
- `fcc_issue_narratives` — draft narratives assembled per quarter per issue,
  aggregating `log_broadcast_events` (via the content items and programs they
  trace back to): total airtime, item count, programs, confirmed airings
  (§18.2).
- `fcc_filings` — the approved, generated filing document per quarter, with
  filing date and an archived copy of the approved narrative and supporting
  evidence (§18.2's "record the filing date and archive").

FCC Reporting never writes to Log or Underwriting — it's read-only against
`log_broadcast_events`/`log_content_items` (narrowly scoped additive RLS) and
owns everything it produces itself. §18.3's compliance boundary — the system
prepares, it never decides which issues are most significant or files
without review — is a product rule enforced by keeping every write here
staff-initiated, not a background job (this repo still has no job queue).

---

## 6. Suggested build order

Following the source document's own phasing (§23–24) and this portal's
"foundation before extension" pattern:

1. **Log, minimal**: program schedules, clock templates, content library
   (excluding underwriting), NPR display, weather, daily rundown + host
   console, continuous timing, host exception actions writing directly to
   `log_broadcast_events` (with no Underwriting integration yet — a "missed
   underwriting credit" is just an outcome on the event, unresolved).
2. **Underwriting & Traffic**: contracts, copy, manual (not yet automatic)
   placement into Log's clock inventory, the post-broadcast exception queue
   reading `log_broadcast_events`, basic affidavits.
3. **Automatic scheduling** as a follow-up slice on Underwriting, once manual
   placement has validated the eligibility rules against real WUWF contract
   patterns.
4. **FCC Reporting**: depends on a real backlog of `log_broadcast_events` and
   community-issue-tagged content existing before quarterly aggregation is
   useful to build against.

This mirrors the source document's own initial-scope table (§23): the
operational spine first, underwriting fulfillment second, compliance
reporting last because it has the least urgent cadence and the most to gain
from real data existing before it's built.

---

## 7. Open questions before any schema is written

Carried from the source document's §26, unresolved and still blocking:

- Which broadcast automation system receives the current RadioTraffic log,
  and what export/as-run formats does it support? (Affects whether
  `log_broadcast_events`' automation-confirmation source is a real
  integration or host-confirmed only, at least initially.)
- ~~What NPR API or station integration is actually available for
  rundowns?~~ Resolved (2026-08-07): NPR's Content Distribution Service
  (CDS) — see `docs/log-design.md` §5/§7 and CLAUDE.md. WUWF's own
  production token is still outstanding.
- Which existing clock and contract patterns represent WUWF's complete set of
  use cases? (Needed before `log_clock_slots`/`uw_placement_obligations`'
  columns are finalized — the sketches above are structural, not final DDL.)
- What level of automation confirmation exists for carts, live reads, and
  local news, and who has final authority over alternate airings, makegoods,
  and affidavits? (Shapes `uw_exceptions`' approval flow.)
- What controlled taxonomy should `fcc_community_issues` actually use, and
  how long must completed rundowns and generated reports be retained?

None of these block writing the individual per-tool design docs (Log's, in
particular, could proceed against reasonable defaults), but they should be
resolved — or explicitly deferred with a stated default — before any
migration lands, per this repo's usual rule that a migration is schema, not
a draft.

---

## 8. Next step

All three per-tool design docs are now written — `docs/log-design.md`,
`docs/underwriting-design.md`, `docs/fcc-reporting-design.md` — at the same
depth as `docs/roadmap-design.md` or `docs/academic-partnerships-design.md`.
This document is the boundary and schema-ownership decision those three
docs build on, not a replacement for them.

Per the build order in §6: Log's milestone 1 has since shipped in full (see
CLAUDE.md). Underwriting & Traffic is next, but — like every tool in this
portal — its design being written is not the same as it being authorized to
build; see its own doc's status line and CLAUDE.md before starting any
migration. FCC Reporting depends on a real backlog of `log_broadcast_events`
and community-issue-tagged content existing first, per §6 item 4, so it
stays last regardless of when its design doc was written.
