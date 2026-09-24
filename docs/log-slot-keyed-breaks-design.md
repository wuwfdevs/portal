# Log: slot-keyed rundown breaks

**Status:** design agreed (2026-09-24), not yet built. Decisions are in §7;
one (overrun display, §7.2) awaits confirmation. §9 records how the design
was reached. Read `docs/log-design.md` (§5's data model, §8's import
history) first — this document assumes both.

## 1. The problem

A rundown break (`log_rundown_breaks`) is one day's occurrence of a place in
the program's clock where WUWF can put local content. Today that occurrence
is keyed to a **local opportunity** (`local_opportunity_id`), and it carries
its own copy of the window: `label`, `scheduled_at`,
`available_duration_seconds`, `network_rejoin_at`.

Two consequences follow, and every recent bug in this area traces back to
one of them.

1. **A slot nobody marked as an opportunity has nothing to attach to.** The
   program-log import routinely finds credits DAD scheduled into unmarked
   slots (Here & Now's 14:58 credit on 2026-09-24), and placeholder clocks
   have no opportunities at all. The import answered this by writing breaks
   with a null `local_opportunity_id` — first at DAD's printed windows
   (2026-08-21), then, since 2026-09-24, at the clock slot's own times
   (`lib/log/program-log-clock-alignment.ts`). Either way they are a second
   kind of break with no stable identity.
2. **With no stable identity, "is this the same break?" is answered by
   comparing times.** Generation and sync dedupe on
   `(local_opportunity_id, scheduled_at)` instants; imported breaks dedupe
   on overlapping windows (`selectNonOverlappingBreakDrafts`). This produced
   the string-vs-instant bug that tripled a rundown's breaks
   (`20260808220000`), the overlap seams the 2026-09-24 alignment fixed,
   and the 15-second snapping, multi-slot runs, and export-window fallback
   that alignment still needs.

The copied window is also mostly redundant. A rundown already records its
`clock_version_id`, and a clock version's slots are insert-only, forever
(CLAUDE.md, Log slice 1). A rundown's slot times therefore cannot change
underneath it, so there is nothing to protect by copying them. The only
editable layer is the opportunity overlay (`requirement`,
`permitted_content_types`), which is edited in place.

## 2. Why a break record still has to exist

Items can't hang directly off `log_clock_slots`. A slot is a template: one
row that recurs every hour of the shift, every day the clock version is in
effect. A credit airs in *one* occurrence of it ("Monday, 6:49:34"). Some
state also belongs to one day's occurrence, not to the template:

- where a floating break actually landed that day;
- a one-day widening of what the break permits (the import adds
  `underwriting_credit` to an opportunity that didn't allow it);
- the host's aired/missed record, which hangs off items and is unchanged
  here.

So the proposal is not to remove breaks. It is to give each break an
identity in the clock.

## 3. The proposal

**A break is one occurrence of one clock slot:** it is identified by
`(rundown_id, clock_slot_id, hour_index)`, and its times come from that
slot.

### 3.1 Schema (`log_rundown_breaks`)

| Column | Change |
|---|---|
| `clock_slot_id uuid not null references log_clock_slots` | **new** — the slot this break is an occurrence of |
| `hour_index integer not null` | **new** — which repetition of the clock within the shift (already computed by generation; today it isn't stored) |
| `local_opportunity_id` | kept, nullable. Filled from the slot's opportunity when one exists; null for an unmarked slot. Opportunity assignments (pins) and placement still key on it, and it records which opportunity the break was generated from even if that opportunity is later deactivated |
| `scheduled_at`, `available_duration_seconds`, `network_rejoin_at`, `label` | kept as stored columns, but **derived by a `before insert` trigger** from the rundown's `shift_start_at`, the slot, and `hour_index` — not supplied by the caller. Every reader (the timing engine, the rundown screen, Underwriting's security-definer functions) keeps working unchanged. A caller-supplied value that disagrees is overwritten, not trusted |
| `requirement`, `permitted_content_types` | kept as per-occurrence snapshots (the one layer that is legitimately editable, and legitimately per-day) |
| `landing_offset_seconds integer` | **new**, nullable — where a floating slot landed that day, the one per-day time a break may carry. See §3.2 |

Constraints:

- `unique (rundown_id, clock_slot_id, hour_index)`, replacing both
  `log_rundown_breaks_unique_occurrence` and the partial
  `log_rundown_breaks_imported_unique`. With no interior windows (§3.2),
  a slot occurrence has at most one break, so the key needs no time in it.
- `clock_slot_id` must belong to the rundown's `clock_version_id` (checked
  by the same trigger).

### 3.2 Where a break's times come from

- **Fixed avail slot** (a music bed, a funding-credit cutaway): the slot's
  own start and duration. `landing_offset_seconds` is null.
- **Floating slot:** `landing_offset_seconds` is where it landed that day,
  within `[earliest, latest]`; duration is the slot's. It defaults to the
  earliest start, as generation does today.
- **Inside a long slot** (placeholder "Program content" clocks, BBC's
  23-minute segments): **no break** (decided, §7.3). The import lists an
  export row that lands there as unresolved, with a note to give the
  program a real clock or mark a slot, and the host places it by hand if it
  aired. No window is ever supplied by a caller, so today's export-window
  fallback in `program-log-clock-alignment.ts` goes away. The evidence for
  this: across every rundown imported to date, not one item landed on a
  placeholder clock, and only one (a This American Life credit) landed
  outside an opportunity on a clock with long slots.

### 3.3 Which breaks exist

Rows are created **lazily**: one for every marked opportunity (as now), and
one for any other slot occurrence only when something is placed in it.
Materializing every slot (about 90 rows per Morning Edition rundown) would
make the rundown screen render network segments as breaks, and most of them
could never legitimately hold anything.

### 3.4 What gets simpler

- **Generation and sync** (`generateRundown`, `syncRundownBreaks`,
  `log_generate_rundown_for_underwriting`) insert
  `(rundown, slot, hour)` rows with `on conflict do nothing` on the new key.
  `selectMissingBreakDrafts`'s instant comparison and
  `selectNonOverlappingBreakDrafts` are deleted, and so is the
  generated/imported split in sync.
- **The import** finds the slot occurrence an export row starts at and
  writes a row for that `(slot, hour)` if none exists. Within-tolerance
  snapping stays, because DAD prints times a second or two off the clock.
  The multi-slot "run" logic is deleted: a DAD avail spanning two slots
  becomes items in the first slot's break, and the timing engine reports the
  run-over (§3.5). What's left of `program-log-clock-alignment.ts` is a
  lookup: "which slot occurrence does this printed time belong to".
- **`log_rundowns.source`** stops mattering to any break logic and becomes
  pure provenance.

### 3.5 Overrun into an unmarked slot

Today (`lib/log/timing.ts`'s `computeBreakStatuses`), a break whose items
run past its window chains the overage into the *next break row*, but only
if that row exists, is empty, and starts exactly where this one rejoins the
network. The receiving break reads `covered_by_previous` if it's required
(any local content satisfies it) or `preempted_by_previous` if it's optional
(network content got bumped). With no such row, the source break reads
`over`.

**Content that spans several marked slots is unaffected.** This chaining is
what carries a long local story across a multi-slot window: Morning
Edition's 29:30 story window is four marked opportunities in a row (Music
Bed 30s, Newscast 3 90s, Newscast 4 90s, Music Bed 60s, 4:30 in all, ending
at 34:00). A 4-minute story placed in the 29:30 break reads `filled`, and
the three breaks after it read `preempted_by_previous`. Every one of those
slots is a marked opportunity, so each keeps its row under this proposal,
and the chain works exactly as it does today. What follows is only about a
story that runs past the last marked slot, into network content nobody
marked (at 34:00, the network's Funding Credit).

Under lazy materialization, the slot after a break is usually unmarked and
has no row: a newscast, a network promo, a story segment. So an overrun
there keeps reading `over`, as it does today. The real example on
2026-09-24: Morning Edition's 6:42:30 music bed (90s) holds 100s of
credits, so it's 10s over, and the next thing on the clock is a 14-second
H&N promo.

Options (**recommended B, awaiting confirmation — see §7.2**):

- **A. No change.** `over`, as today.
- **B. Name what the overrun cuts into.** Still `over`, but the badge reads
  "runs 0:10 into H&N Promo", read from the clock version's slots. This is
  a display change only: no status changes, and nothing else reads it. It
  tells a host whether they're eating a promo or a newscast.
- **C. Absorb it into the unmarked slot** as `preempted_by_previous`,
  which is what this document originally proposed. This changes status
  semantics: the source break would read `filled`, and the rundown summary's
  preempted count would include network segments. It hides the one number
  a host acts on (seconds over) behind a status on a row that doesn't
  exist.

Recommendation: B.

## 4. The Underwriting boundary

Underwriting currently holds no contracts, schedule lines, placements,
exceptions, makegoods or affidavits in production, so nothing here migrates
Underwriting data. The impact is on the code and functions that will run
once it does.

Only `log_rundown_items` references breaks (`break_id`), and items keep
their ids and their `break_id`. So `uw_scheduled_placements`,
`log_broadcast_events`, exceptions, makegoods and affidavits are untouched.
The security-definer functions that cross the Log/Underwriting boundary:

| Function | Change |
|---|---|
| `log_generate_rundown_for_underwriting` | writes breaks — takes `clock_slot_id`/`hour_index` per draft, and the new conflict target |
| `log_get_program_schedule_context` | returns each opportunity's `slot_id`, so `rundown-provisioning.ts` can build keyed drafts |
| `log_list_placeable_rundown_breaks` | restricted to opportunity breaks — see below |
| `log_place_underwriting_credit`, `log_relocate_underwriting_credit`, `log_insert_rundown_items_for_underwriting`, `log_delete_unplaced_credit_item` | none — they read the snapshot columns, which stay |

**Which breaks auto-fill may use.** `log_list_placeable_rundown_breaks`
offers any break whose `permitted_content_types` contains
`underwriting_credit`. An imported break on an unmarked slot gets the
liberal imported set, which includes it. So once contracts exist,
auto-fill would pack scheduled credits into slots that only have a row
because DAD happened to put a credit there, such as a network promo slot.
That's already true of today's imported breaks, and it only hasn't mattered
because there are no contracts yet. **Decided (§7.4):** restrict placement
candidates to opportunity breaks (`local_opportunity_id is not null`), so
auto-fill and the manual picker only ever fill windows a producer marked.
The import still places what the export says, anywhere, because that's
what aired.

On the application side, about 17 source files touch breaks. Most only read
the unchanged columns; the writers are `rundown-actions.ts`,
`import-actions.ts`, `rundown-generation.ts`, `rundown-provisioning.ts`, and
the alignment module.

## 5. Migrating existing data

**Decided (2026-09-24): delete every rundown with an `air_date` before
2026-09-24 rather than backfill it.** Production at that date:

| | Before 2026-09-24 | 2026-09-24 onward |
|---|---|---|
| Rundowns (all `source = 'imported'`) | 185 | 12 |
| Items | 700 | — |
| Broadcast events (as-aired records) | 43 | — |

The delete cascades rundowns → breaks → items → broadcast events, and it
reaches nothing in Underwriting: `uw_scheduled_placements`,
`uw_exceptions`, `uw_makegoods`, `uw_affidavits` and `uw_contracts` are all
empty. The import-created `uw_copy` rows (67) and `uw_underwriters` stay:
they're the copy library, not rundown data. The one real loss is the 43
as-aired records for those dates, which nothing reads yet (FCC Reporting
isn't built).

The migration, in order:

1. Delete rundowns with `air_date < '2026-09-24'`.
2. Add the columns, nullable.
3. Backfill the remaining 12 rundowns' opportunity breaks from the
   opportunity's `slot_id`, and their null-opportunity breaks with the
   import's slot-occurrence lookup. A break holding items that maps to no
   slot (one inside a long slot, §3.2) stops the migration rather than
   being dropped or guessed at. Checked against the 2026-09-24 import,
   there are none.
4. **Delete empty null-opportunity breaks** (decided). The new import would
   never have created them.
5. Merge any two breaks that now share a key, moving items (with their ids)
   into the survivor.
6. Set `not null`, add the key and the trigger, and drop the two old unique
   indexes.

Verify by a rolled-back dry run against production. For the 12 surviving
rundowns, item, broadcast-event and placement counts must be identical
before and after. Then apply to preview and production and record it in
`APPLIED.md`. Preview's database was unreachable at the last two attempts
(APPLIED.md's `pending` rows), and this should not be applied to production
alone.

## 6. Phasing

1. **Migration and trigger, plus the writers updated to pass
   `(slot, hour)`.** Readers are unchanged. The import keeps its current
   alignment but writes keys.
2. **Delete the dedup code.** `selectNonOverlappingBreakDrafts`, the
   instant-comparison in `selectMissingBreakDrafts`, the generated/imported
   split in sync, and the alignment module's run logic.
3. **The placement-candidate filter** in `log_list_placeable_rundown_breaks`
   (§4, §7.4 — a migration of its own), and **the overrun display** in
   `timing.ts` and the rundown screen (§3.5), once §7.2 is confirmed.

Phases 2 and 3 can ship separately. Phase 1 is the one with the migration
risk.

## 7. Decisions

All agreed 2026-09-24 unless marked otherwise.

1. **Delete rundowns dated before 2026-09-24** rather than migrate them,
   and **delete empty breaks on unmarked slots** in what remains (§5).
2. **Overrun into an unmarked slot** (§3.5): **B recommended, awaiting
   confirmation** — keep `over`, and name the network slot the overrun cuts
   into. Content that spans several *marked* slots (the 29:30 story window)
   already chains across them and is unaffected by any option here (§3.5,
   §9).
3. **Placeholder clocks and long slots** (§3.2): no break inside a long
   slot. An export row that lands there is reported as unresolved. 21
   programs, about 18% of the weekly schedule, still run on the placeholder
   clock, so this is expected to become rare only as real clocks arrive.
4. **Placement candidates** (§4): auto-fill and the manual picker use
   opportunity breaks only. The import still places what the export says.
5. **Break times stay stored columns**, filled by the trigger from the slot
   (§3.1), so no reader changes.

## 8. Out of scope

- Materializing every slot occurrence (§3.3).
- Any change to items, broadcast events, or Underwriting's own tables.
- Changing how opportunities are authored.

## 9. How this design was reached

The design came out of one conversation on 2026-09-24, starting from a host's
observation that an imported rundown's breaks "don't seem to correspond
perfectly to the clock". It's recorded here so the reasoning doesn't have to
be reconstructed.

1. **Why imported breaks didn't match the clock.** The import (2026-08-21)
   wrote DAD's printed windows as breaks, on the grounds that the export was
   the station's confirmed avail structure and most clocks had no
   opportunities marked. The 2026-08-24 revision then added the clock's
   opportunity breaks around them, deduplicated by window overlap. The
   seams between the two were the mismatch: DAD's times instead of the
   clock's, clock windows swallowed by a slightly longer DAD window, and
   pinned content rerouted into export breaks.
2. **"Why not import the credits and slot them into the clock's breaks?"**
   The original reasons no longer held: opportunities had become slot-keyed
   (marking one is a click), and DAD's windows turned out to be the clock's
   own avails printed a second or two off. The rule became: **the clock
   defines every break's window; the export decides what goes in it.**
3. **"The export should prevail."** During the transition away from DAD,
   what DAD scheduled is what aired. So a credit the export places in a slot
   nobody marked is still placed, but it takes that slot's clock times
   rather than creating a new window or changing the clock's opportunities.
   That shipped the same day as a stopgap in
   `lib/log/program-log-clock-alignment.ts` (`docs/log-design.md` §8's
   2026-09-24 revision), checked against that day's real import.
4. **"Why are breaks and clock slots different records at all?"** A slot is
   a template that recurs every hour of every day, and a credit airs in one
   occurrence of it, so a per-day record has to exist (§2). What was wrong
   was its identity: keyed to an opportunity with a copied window, instead
   of to the slot occurrence it is. That's this document's proposal (§3).
5. **Existing data, overruns, placeholder clocks, and Underwriting.** The
   decisions in §7 follow from production data at the time: 197 rundowns,
   all imported; no Underwriting contracts, placements or affidavits; no
   item ever placed on a placeholder clock; one 10-second overrun that day
   (Morning Edition's 6:42:30 music bed, into a network promo).
6. **"Was the overrun chaining designed for stories that span several
   slots?"** Yes. Morning Edition's 29:30 local-story window is four marked
   opportunities in a row: Music Bed (29:30, 30s), Newscast 3 (30:00, 90s),
   Newscast 4 (31:30, 90s) and Music Bed (33:00, 60s), 4:30 in all and
   ending at 34:00. A story of up to 4:30 placed in the 29:30 break reads
   `filled` and chains through the other three, each of which reads
   `preempted_by_previous` since all four are optional. This was the case
   the slot-keyed opportunities (2026-08-10) and the multi-hop chaining
   (the same day) were built for. All four keep their rows under this
   design, so it keeps working unchanged. §3.5's options only affect a
   story that runs past 34:00 into the network's Funding Credit, which
   nobody marked. One consequence worth knowing: a story that routinely
   runs over the newscasts shows three "preempted" badges every time, by
   design, since preempting a newscast is worth a host's attention.

