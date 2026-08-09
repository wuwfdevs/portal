# Underwriting & Traffic — Product & Engineering Design

Status: **Milestone 1 shipped in full, then redesigned (2026-08-07/08)
grounded in a real WUWF underwriting agreement; the automatic rules-based
scheduler (§7) has since landed too (2026-08-09) — see CLAUDE.md's dated
note.** Second of the three tools
`docs/broadcast-operations-strategy.md` splits the WUWF Unified Broadcast
Rundown and Traffic System spec into, following `docs/log-design.md` in the
strategy doc's build order (§6) — this tool depends on Log's rundown and
broadcast-event schema, and, as of this redesign, on Log's own
network-clock/local-opportunity split too (both tools were redesigned in the
same pass; see `docs/log-design.md` §2).

Read `docs/broadcast-operations-strategy.md` and `docs/log-design.md` before
touching any of this. Source material throughout is the `WUWF Unified
Broadcast Rundownand Traffic System` spec (§ references point there), plus,
as of this redesign, a real executed WUWF underwriting agreement — see §2's
"The reference agreement" below.

---

## 1. The problem we're solving

WUWF runs RadioTraffic today for exactly five things: contracts, copy,
scheduling, logs, and affidavits. Everything else RadioTraffic does —
billing, accounts receivable, sales commissions, multi-station inventory,
commercial-radio yield optimization — is either irrelevant to a
noncommercial single-station operation or belongs to a different system
entirely. This tool reproduces exactly the five functions WUWF actually
relies on and stops there.

The reason it's a separate tool from Log rather than a section of it: the
work here — maintaining a contract, approving a copy revision, resolving a
missed-credit exception three days after it happened, certifying an
affidavit — has no live-broadcast time pressure and a completely different
rhythm from building or running a rundown. A traffic staffer's whole session
might be one contract renewal; a host's is a two-hour broadcast with
continuous timing math. Putting both in one tool means one of them loses.

### Why this redesign, and what was wrong with milestone 1

Milestone 1 shipped a generic ad-tech-shaped obligation model
(`quantity_required`/`quantity_period`/`distribution_rule` as free text) that
had never been checked against a real WUWF agreement. Grounding this
redesign in one — the real Autumn Beck Blackledge agreement (see below) —
surfaced eight concrete problems, in order:

1. **An underwriter existed only as free text** on a contract
   (`uw_contracts.underwriter_name`) — no durable identity, no reusable
   contact info, nothing to hang a competitive-adjacency check off of.
2. **`uw_placement_obligations` was the wrong shape.** The real agreement
   reads "Monday ~7:49am, Tuesday ~4:48pm, Wednesday and Thursday ~8:06am,
   26 weeks" — a plain recurring schedule. Milestone 1's model made staff
   translate that into an abstract quantity + period instead of just
   entering the schedule.
3. **`sponsorship_position` (opening/closing/mid) had no basis in the real
   agreement**, no enforcement anywhere in the placement function, and no
   real UI — dead schema.
4. **`uw_copy.production_status` was a universal pending/produced field**
   that doesn't fit a live-read message at all — the real agreement's two
   rotating messages are executed live-read or WUWF-recorded, never pushed
   through one production pipeline.
5. **`uw_obligation_status` was manually set by staff**, despite the design
   doc itself always having said fulfillment should derive from placements
   and broadcast events.
6. **Underwriting-media audio upload was write-only** — inspection of the
   actual milestone-1 app confirmed nothing ever read the file back.
7. **Affidavit-required was implicit/absent.** The real agreement states
   "Affidavits Needed — NO" explicitly; nothing in the schema recorded that
   as a contract-level fact.
8. **`agreement_document_url` was a bare text field**, not a real
   attachment — the executed agreement itself was never actually stored
   anywhere the portal could point back to.

Every one of those is fixed below; §2's product model and §5's data model
describe the corrected shape, not the milestone-1 one.

### The reference agreement

The real WUWF Autumn Beck Blackledge underwriting agreement is the concrete
case this redesign is checked against throughout: **4 weekly recurring
placements over a 26-week campaign** (Monday, Tuesday, Wednesday, and
Thursday, each its own schedule line — Wednesday and Thursday share one line
since they run at the same time/duration), which is **104 total spots**
(4 × 26). Each placement is a **30-second credit**, drawn from **2 rotating
messages** ("Message A"/"Message B"). **Affidavits Needed — NO.** The
agreement's own preemption language is "rescheduled within the program
originally sponsored" — a makegood stays inside the program the underwriter
actually bought, not just anywhere in the schedule. `lib/underwriting/
schedule-lines.ts`'s expected-occurrence math is tested directly against
this example: four weekly lines over a 182-day (26-week) campaign sum to
exactly 104 expected occurrences.

---

## 2. Product model

### Underwriter (new)
A durable sponsor entity (`uw_underwriters`): name, mailing address, contact
name, email, phone, category, notes. Replaces free-text
`underwriter_name` on the contract. `category` is what makes the
competitive-adjacency advisory (§6) useful — this is not a CRM, just enough
identity to reuse across contracts and reason about competing sponsors.

### Contract (redesigned)
The underwriting agreement itself: an underwriter reference, contract
identifier, effective dates, **sponsorship total and category**, an
**`affidavit_required` flag** (most WUWF agreements are `false`, per the
reference agreement's explicit "NO"), a **`preemption_policy`** describing
how a preempted spot is handled (the reference agreement's own language:
"rescheduled within the program originally sponsored"), an attached
**executed agreement document** (a real Storage object, not a bare URL —
see §6), status, and notes. Fulfillment is never stored here — always
computed, see §6/§7.

### Contract schedule line (new — replaces Placement obligation)
The real shape of a WUWF insertion order: one or more days of the week, a
target air time, a duration, an eligible program, and a date range. "Monday
~7:49am × 26 weeks" is one line; "Wednesday and Thursday ~8:06am × 26 weeks"
is one line with `days_of_week = {3,4}`, not two. `expected_occurrence_count`
(`lib/underwriting/schedule-lines.ts`) computes days-of-week × weeks-in-range
by default, or uses an explicit `occurrence_count_override` for an
obligation that isn't cleanly recurring (a "12 credits a month" case with no
single target time). `sponsorship_position` is gone entirely — it never had
a basis in a real agreement.

### Underwriting copy (redesigned)
Script, cart identifier (an ENCO/DAD reference, not portal-hosted audio —
see §6), duration, a short `label` distinguishing rotating messages under
one contract ("Message A"/"Message B" — see §6's copy rotation), effective/
expiration dates, approval status, and `execution_kind` (`live_read` |
`recorded`) — replacing the universal `production_status`, which never fit
a live-read message. A contract's schedule line says *how often*; its copy
says *what plays*, and a contract can rotate between several linked copy
rows.

### Scheduled placement
One schedule line's occurrence slated into a specific Log rundown break on a
specific date — the record this tool produces whether a human picked the
break (milestone 1 and this redesign both) or a rules engine did (deferred,
§7).

### Exception
An unresolved discrepancy between what a contract required and what
actually aired, created against one of Log's `log_broadcast_events` rows
once its outcome is anything other than "aired as scheduled."

### Makegood
A scheduled or aired alternate airing that resolves an exception, per the
reference agreement's own preemption policy: rescheduled within the program
originally sponsored.

### Affidavit
A proof-of-performance document generated from confirmed or
management-approved broadcast events — never from the original schedule
alone. Can be generated for any contract regardless of `affidavit_required`
— staff can always produce one on request; the flag only changes what the
dashboard treats as an expected workflow item.

### Critical distinction, carried from Log
A schedule line is not the same as an airing, for the same reason a content
item isn't (Log §3). One line can produce many scheduled placements across
a contract's whole run, each independently outcome-tracked.

---

## 3. Primary user workflows

### A. Creating and maintaining a contract (traffic staff)
Pick or create an underwriter, enter contract identifier, sponsorship
total/category, affidavit requirement, preemption policy, attach the
executed agreement document, and add one or more schedule lines.
Fulfillment status derives from scheduled placements and broadcast events
against it, not a field someone updates by hand.

### B. Managing underwriting copy (traffic staff)
Create copy **directly from a contract's own screen** (auto-linking it, no
separate navigation round-trip) or from the standalone copy library; set
label, execution kind, script or cart identifier, effective/expiration
dates, and approval status; link additional copy to every contract allowed
to use it. Expired or unapproved copy cannot be scheduled without an
explicit manager-checked override.

### C. Placing credits into the rundown (traffic staff, manual or auto-fill)
From a contract's schedule line, a traffic staffer picks an eligible Log
rundown break on an eligible date and places the credit. Eligibility
(program, day-of-week, duration fit) is checked at the moment of placement,
not just displayed as a warning after the fact. A lightweight
**competitive-adjacency advisory** (new — `lib/underwriting/adjacency.ts`)
flags when another underwriter in the same `category` already has a
placement scheduled nearby, purely informational — never a hard block, and
never triggered by the same underwriter's own other placements. As of
2026-08-09, a schedule line (or every active schedule line at once, from
the dashboard) can also be **auto-filled**: the same write path, driven by
a rules-based planner instead of a person picking one break at a time —
see CLAUDE.md's dated note and `lib/underwriting/auto-fill-plan.ts`. Manual
placement stays available for picking a specific break by hand.

### D. Reviewing pre-broadcast conflicts (traffic staff)
A dashboard of schedule lines that can't currently be placed — insufficient
inventory, missing approved copy, an unfulfilled expected-occurrence count
with no eligible breaks left this period.

### E. Reviewing the post-broadcast exception queue (traffic staff, manager)
Every underwriting-kind `log_broadcast_event` whose outcome isn't "aired as
scheduled" appears here with the underwriter/contract, original scheduled
time, actual outcome, host action and reason, the applicable schedule line,
and whether an alternate airing looks compliant. From here: accept the
alternate airing, schedule a makegood, waive it (manager-only), request
clarification, correct the record, add a note, or close the exception.

### F. Scheduling and confirming makegoods (traffic staff)
A makegood created from an exception is itself a scheduled placement once a
slot is chosen — reusing the exact same placement path as an ordinary
credit — then tracked through to its own broadcast event.

### G. Generating affidavits (traffic staff, certified by manager)
Select a contract and a campaign period; the system assembles verified air
dates/times, actual durations, approved alternates and makegoods, and
relevant exceptions from the underlying broadcast events, and produces a
document a manager certifies.

---

## 4. Screens

```
/underwriting                       Dashboard: pre-broadcast conflicts, open exceptions
/underwriting/underwriters          Underwriter list
/underwriting/underwriters/[id]     Underwriter detail — linked contracts
/underwriting/contracts             Contract list
/underwriting/contracts/new         Create contract
/underwriting/contracts/[id]        Contract detail — schedule lines, copy, fulfillment, document
/underwriting/copy                  Copy library
/underwriting/copy/[id]             Copy detail — approval status, execution kind, linked contracts
/underwriting/exceptions            Post-broadcast exception queue
/underwriting/exceptions/[id]       Exception detail and resolution
/underwriting/makegoods             Makegood tracking
/underwriting/affidavits            Affidavit list
/underwriting/affidavits/new        Generate an affidavit for a contract/period
/underwriting/affidavits/[id]       Affidavit detail, certify, print
```

**`/underwriting`** — the two queues that actually need daily attention:
schedule lines that can't currently be placed, and broadcast events awaiting
exception resolution.

**`/underwriting/contracts/[id]`** — schedule lines and their derived
fulfillment status side by side with linked copy (create-in-place or link
existing) and the attached agreement document, so a renewal conversation can
see "met 84 of 104 required credits this campaign" without cross-referencing
two screens. Every program reference on this screen is a human-readable
name select, never a raw UUID field — see §6.

---

## 5. Data model

Eleven tables, prefixed `uw_`, plus two additive changes to `log_*` tables
(§6). This section reflects the post-redesign shape
(`20260808200000_underwriting_redesign.sql`).

### `uw_underwriters` (new)
`id`, `name`, `mailing_address` (nullable), `contact_name` (nullable),
`email` (nullable), `phone` (nullable), `category` (nullable), `notes`
(nullable), `created_by`, `created_at`, `updated_at`.

### `uw_contracts` (redesigned)
`id`, `underwriter_id` (references `uw_underwriters`, not null),
`contract_identifier`, `agreement_document_path` (nullable — a real object
path in the `underwriting-documents` bucket, replacing the bare
`agreement_document_url`), `affidavit_required` bool (default `false`),
`sponsorship_category` (nullable), `sponsorship_total` (nullable
`numeric(10,2)`), `preemption_policy` (nullable text), `effective_from`,
`effective_to`, `status` (`draft` | `active` | `expired` | `terminated`),
`notes`, `created_by`, `created_at`, `updated_at`.

### `uw_contract_schedule_lines` (new — replaces `uw_placement_obligations`)
`id`, `contract_id`, `days_of_week` (`int[]`, 0=Sunday..6=Saturday, matching
`log_schedule`'s own convention — non-empty), `target_time` (nullable time —
null for a looser obligation with no single target), `duration_seconds`,
`program_id` (references `log_programs`, nullable), `start_date`,
`end_date` (nullable), `occurrence_count_override` (nullable — set only for
an obligation that isn't cleanly day-of-week-recurring), `makegood_policy`
(nullable), `notes`, `created_by`, `created_at`. Expected-occurrence math
(`lib/underwriting/schedule-lines.ts`, pure and tested): four weekly lines ×
26 weeks = 104 for the reference agreement.

### `uw_copy` (redesigned)
`id`, `label` (short human label — "Message A"/"Message B"), `script`
(nullable), `cart_identifier` (nullable — an ENCO/DAD reference, meaningful
when `execution_kind = 'recorded'`), `execution_kind` (`live_read` |
`recorded`, replacing `production_status`), `duration_seconds`,
`effective_from`, `effective_to` (nullable), `approval_status` (`draft` |
`approved` | `expired` | `retired`), `created_by`, `created_at`.

### `uw_contract_copy`
`contract_id`, `copy_id` — many-to-many join; a copy row can serve more than
one contract, and a contract can rotate between several.

### `uw_scheduled_placements` (redesigned: `obligation_id` → `schedule_line_id`)
`id`, `schedule_line_id`, `copy_id`, `log_rundown_item_id` (set once the
write into Log succeeds), `placement_date`, `scheduled_at`, `program_id`,
`program_name` (denormalized at write time — see §6), `break_label`
(denormalized), `status` (`scheduled` | `locked` | `conflict` |
`superseded`), `override_reason` (nullable), `created_by`, `created_at`.

### `uw_exceptions` (redesigned: `obligation_id` → `schedule_line_id`)
`id`, `log_broadcast_event_id`, `schedule_line_id`, `original_scheduled_at`,
`host_action`, `host_reason` (nullable), `requirement_note` (nullable),
`compliance_judgment` (`compliant` | `noncompliant` | `pending`),
`recommended_action` (nullable), `resolution_status` (`open` | `resolved`),
`resolution_action` (nullable — `accept_alternate` | `schedule_makegood` |
`reassign` | `waive` | `clarification_requested` | `corrected` | `closed`),
`resolution_notes` (nullable), `resolved_by` (nullable), `resolved_at`
(nullable).

### `uw_makegoods` (redesigned: `obligation_id` → `schedule_line_id`)
`id`, `exception_id`, `schedule_line_id`, `scheduled_placement_id`
(nullable until scheduled), `status` (`scheduled` | `aired` | `cancelled`),
`scheduled_for` (nullable), `aired_log_broadcast_event_id` (nullable).

### `uw_affidavits`
`id`, `contract_id`, `campaign_period_start`, `campaign_period_end`,
`generated_at`, `generated_by`, `certifying_staff_id` (nullable until
certified), `certification_text` (nullable), `report_identifier`, `status`
(`draft` | `certified`).

### `uw_affidavit_line_items`
`affidavit_id`, `log_broadcast_event_id`, `scheduled_placement_id` —
composite primary key `(affidavit_id, log_broadcast_event_id)`, no separate
id column.

---

## 6. Architecture

### RLS shape: member vs. manager

Same shape as Log's member/producer split, Roadmap's member/curator, and
Academic Partnerships' member/coordinator: `private.has_underwriting_access`
is the ordinary `tool_access` membership predicate, and
`private.is_underwriting_manager` (`tool_access.tool_role = 'manager'`) is
the elevation for waiving an exception, certifying an affidavit, and
overriding expired/unapproved copy into a placement. Ordinary traffic staff
do everything else.

### The Log boundary is two-way, and both directions are scoped grants, not shared tables

This tool doesn't get its own copy of Log's rundown schema — the boundary is
built entirely in this tool's own migration, as narrow additive grants on
both sides.

**Write into Log.** Placing a credit needs a real `log_rundown_items` row
with `item_kind = 'underwriting_credit'` and `underwriting_copy_id` set —
columns this migration adds to `log_rundown_items`. The write goes through a
`security definer` function this migration adds on Log's side,
`log_place_underwriting_credit(break_id, schedule_line_id, copy_id,
override_reason?)` — a plain RLS insert policy naming underwriting members
would let them write any `log_rundown_items` row, not just an eligible
underwriting-credit one in a break that actually permits it, so the guard
(a permitted break with room; an active contract; a program-eligible
schedule line; linked, eligible copy; an explicit manager-checked override
otherwise) lives in the function body instead. `log_clear_underwriting_
credit(placement_id)` is the undo, and `log_list_placeable_rundown_
breaks(schedule_line_id)` is how the contract page finds eligible open
breaks — an underwriting-only caller has no RLS access to Log's rundown
tables at all, so this read is security definer too. `log_list_programs()`
is the human-readable program picker (§ below) for the same reason.

**Read from Log.** The exception queue and affidavit generation both read
`log_broadcast_events` through two additive `select` policies:
`log_broadcast_events_select_for_underwriting` (scoped to events an
`uw_exceptions` row already references — permanent once created) and
`log_broadcast_events_select_for_underwriting_placements` (scoped to events
behind an `uw_scheduled_placements` row — needed for affidavit generation,
which has to see the compliant majority that never became an exception, not
just the exception subset). Both are keyed off a permanent reference rather
than `log_rundown_items.item_kind`'s current, reassignable state — an
earlier version of the first policy was scoped to `item_kind =
'underwriting_credit'` directly and was caught, before shipping, silently
hiding a still-open exception's context the moment its placement was
cleared and the item reassigned to ordinary content.

**The reverse read Log needs from this tool.** A host's live "move" action
in the console has to validate a new break against the schedule line's own
eligibility (program, day-of-week, date range), which lives in
`uw_contract_schedule_lines`, not Log's schema — so this tool's migration
adds a narrow `select` policy for Log members, scoped to lines with an
active scheduled placement.

**The host-facing script gap is closed.** Milestone 1 told the host to "go
to Underwriting & Traffic" to read a credit's script. A new additive
`select` policy on `uw_copy` (`uw_copy_select_for_log`), scoped to copy rows
already referenced from a `log_rundown_items` row the caller can see, lets
Log's console render the actual script inline instead — see
`docs/log-design.md` §6.

### Human-readable program selection everywhere

Every place a schedule line or a placement names a program, the UI is a
`<select>` populated by `log_list_programs()` — a `security definer`
function, since Underwriting staff have no RLS access to `log_programs` at
all — never a raw UUID entry field. One deliberate exception: the
obligation-creation form's `eligible_program_ids`-equivalent field predates
this and stays comma-separated program IDs with a hint — see the note in
CLAUDE.md's Underwriting slice-1 entry for why a create-time name picker
would need more RLS surface than that one screen alone justifies.

### DAD is the system of record here too

Same finding, same fix as Log (`docs/log-design.md` §6): inspection of the
milestone-1 app found `uw_copy.audio_object_path` was write-only — nothing
ever read it back. Removed in favor of `cart_identifier` (already existed)
as the DAD/cart reference. ENCO/DAD remains the playback system of record.

### Fulfillment is always derived, never stored

`lib/underwriting/fulfillment.ts`'s `computeFulfillment()` returns
`no_target` | `on_track` | `behind` | `fulfilled`, computed from a schedule
line's expected-occurrence count against its completed placements, open
exceptions, and open makegoods — never a field a staffer sets by hand. A
placement is never silently counted as fulfilled while an exception or
makegood against it is still open; `behind` wins over `fulfilled` in that
case even if the raw completed count already meets the target.

### Competitive adjacency is advisory for a human, enforced for the scheduler

`lib/underwriting/adjacency.ts`'s `checkCompetitiveAdjacency()` flags when
another underwriter sharing the current one's `category` already has a
nearby placement — purely informational (an `Alert`, never a block) on the
*manual* placement form, and never triggered by the same underwriter's own
other placements. This is deliberately not a scheduling constraint or a
spacing rule engine; WUWF asked for a simple advisory there, not automated
enforcement, since a human is already looking at the screen. Auto-fill
(§7) has no human in the loop at the moment it places a credit, so the
same real promise — the reference agreement's own "does not run adjacent
to a business with similar services or products" — is an *enforced* rule
there instead, scoped to within one break (see CLAUDE.md's dated note and
`lib/underwriting/auto-fill-plan.ts`). The two aren't the same check: the
manual advisory is program-wide and coarse; the auto-fill rule is exact,
since it only ever needs to know whichever item currently holds a
candidate break's last position.

### Milestone 1 (and this redesign) ships the real write path, not a fake one

Manual placement and the automatic scheduler (§7, landed 2026-08-09) produce
the *same* `uw_scheduled_placements`/`log_rundown_items` rows through the
*same* `log_place_underwriting_credit()` function — a human choosing the
break today, a rules engine choosing it later. `lib/underwriting/
auto-fill-plan.ts` is the rules engine's pure planning half; `lib/
underwriting/auto-fill.ts` is what actually calls the RPC.

### Affidavits are a certified document, not a generated PDF

This repo has no PDF-generation dependency anywhere. Milestone 1's affidavit
is a structured on-screen record (`/underwriting/affidavits/[id]`) styled
for browser print-to-PDF, backed by `uw_affidavit_line_items`' real evidence
trail.

### Audit events

Privileged actions here — waiving an exception, certifying an affidavit,
overriding expired/unapproved copy into a placement, terminating a
contract — call `logAuditEvent()`, with `audit_events_insert_underwriting`
scoped to this tool's members. Only a genuine transition into a privileged
state logs a fresh row — re-saving an already-waived exception or an
already-terminated contract doesn't log again, a bug a self-review caught
before this redesign shipped.

### Fit with portal conventions

`requireToolAccess("underwriting")` gates the route segment; Server Actions
per screen area (`contract-actions.ts`, `copy-actions.ts`,
`placement-actions.ts`, `exception-actions.ts`, `makegood-actions.ts`,
`affidavit-actions.ts`) assert access first, `failIfError`/`failWith` on the
way back; reads in `lib/underwriting/queries.ts` behind `unwrapRead()`; pure
logic — schedule-line occurrence math, fulfillment derivation, adjacency
checking, conflict checking, the exception resolution-action list —
colocated with `*.test.ts`, no Supabase import.

Capabilities: `underwriting.credit.schedule` (`{breakId, scheduleLineId,
copyId}` — deliberately without override support, which stays a UI-only
judgment call, the same carve-out `lib/roadmap/capabilities.ts` applies to
curation).

### What's deliberately not in the architecture

- **No PDF generation.**
- **No direct automation-system export or as-run reconciliation.**
- **No billing, invoicing, receivables, or commissions.** Permanent
  exclusion, not a milestone deferral.
- **No competitive-adjacency rules engine** — advisory only, see above.

---

## 7. Milestone 1 (redesigned), and what is left

**Ships:** underwriters as first-class entities; contracts with an
underwriter reference, sponsorship total/category, affidavit requirement,
preemption policy, and a real attached agreement document; contract
schedule lines with correct expected-occurrence math (104 for the reference
agreement); copy with rotation, execution kind, and DAD cart references;
manual placement into Log's rundown (the real write path, §6) with
human-readable program selection and a competitive-adjacency advisory;
pre-broadcast conflict review; the post-broadcast exception queue reading
Log's broadcast events; makegood tracking; derived fulfillment; and
browser-printable certified affidavits with a durable evidence link.

**Shipped since, beyond milestone 1:**

1. **Automatic rules-based scheduling** (2026-08-09) — see CLAUDE.md's
   dated note and `lib/underwriting/auto-fill-plan.ts`/`auto-fill.ts`.
   Reuses `log_place_underwriting_credit()` unchanged; no new migration.

**Still deferred, matching the strategy doc's build order:**

1. **True PDF/document generation for affidavits.**
2. **Automation-system export and as-run reconciliation.**
3. **Scheduled proof-of-performance delivery** — no notification/scheduling
   layer exists in this repo yet to build it on.
4. **A real competitive-adjacency rules engine**, if the advisory turns out
   to be insufficient in practice.

**Open questions specific to this tool:**

- Beyond the one reference agreement this redesign is grounded in, do WUWF's
  other real contracts exercise schedule-line shapes this model doesn't
  cleanly cover (e.g. a genuinely irregular cadence beyond what
  `occurrence_count_override` expresses)? Each should be checked the same
  way the reference agreement was before the automatic scheduler is built
  against assumptions nobody's confirmed at scale.
- Who holds final authority to waive an exception, certify an affidavit, and
  approve an alternate airing — is "manager" one role, or does it split
  between a traffic lead and station management?
- Which broadcast automation system receives the current RadioTraffic log,
  and what export/as-run format does it support?
