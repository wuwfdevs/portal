# Underwriting & Traffic — Product & Engineering Design

Status: **Design, not yet authorized to build.** Second of the three tools
`docs/broadcast-operations-strategy.md` splits the WUWF Unified Broadcast
Rundown and Traffic System spec into, following `docs/log-design.md` in the
strategy doc's build order (§6) — this tool depends on Log's rundown and
broadcast-event schema existing first.

Read `docs/broadcast-operations-strategy.md` and `docs/log-design.md`
before touching any of this. Source material throughout is the `WUWF
Unified Broadcast Rundownand Traffic System` spec (§ references point
there).

---

## 1. The problem we're solving

WUWF runs RadioTraffic today for exactly five things: contracts, copy,
scheduling, logs, and affidavits. Everything else RadioTraffic does —
billing, accounts receivable, sales commissions, multi-station inventory,
commercial-radio yield optimization — is either irrelevant to a
noncommercial single-station operation or belongs to a different system
entirely (§ "Product boundaries"). This tool reproduces exactly the five
functions WUWF actually relies on and stops there.

The reason it's a separate tool from Log rather than a section of it: the
work here — maintaining a contract, approving a copy revision, resolving a
missed-credit exception three days after it happened, certifying an
affidavit — has no live-broadcast time pressure and a completely different
rhythm from building or running a rundown. A traffic staffer's whole
session might be one contract renewal; a host's is a two-hour broadcast
with continuous timing math. Putting both in one tool means one of them
loses.

---

## 2. Product model

### Contract
The underwriting agreement itself (§6.1): underwriter, contract identifier,
attached agreement, effective dates, current fulfillment status, notes.

### Placement obligation
A contract may bundle several distinct obligations (§6.2) — different
requirements by program, date range, daypart, frequency, duration, copy
version, or sponsorship position. Each is tracked separately because
"12 credits a month" and "3 credits a week only during Morning Edition" are
different fulfillment problems even under the same contract.

### Underwriting copy
Script, recorded audio, duration, cart identifier, effective/expiration
dates, and approval/production status (§6.3), associated with the
contract(s) allowed to use it. A contract's obligation says *how often*;
its copy says *what plays*.

### Scheduled placement
One instance of an obligation slated into a specific rundown slot on a
specific date — the record this tool produces whether a human picked the
slot (milestone 1) or a rules engine did (deferred, §7).

### Exception
An unresolved discrepancy between what a contract required and what
actually aired (§16), created against one of Log's `log_broadcast_events`
rows once its outcome is anything other than "aired as scheduled."

### Makegood
A scheduled or aired alternate airing that resolves an exception (§16).

### Affidavit
A proof-of-performance document generated from confirmed or
management-approved broadcast events — never from the original schedule
alone (§17). §17's explicit requirement — "the underlying broadcast events
and approvals supporting each affidavit should remain available for audit
and regeneration" — is why an affidavit is a real row with a durable link
to its evidence, not a one-shot export.

### Critical distinction, carried from Log
An obligation is not the same as an airing, for the same reason a content
item isn't (Log §3). One obligation can produce many scheduled placements
across a contract's whole run, each independently outcome-tracked.

---

## 3. Primary user workflows

### A. Creating and maintaining a contract (traffic staff)
Enter underwriter, contract identifier, attached agreement, effective
dates, and one or more placement obligations. Fulfillment status derives
from scheduled placements and broadcast events against it, not a field
someone updates by hand.

### B. Managing underwriting copy (traffic staff)
Upload script/audio, set cart identifier and effective/expiration dates,
track approval and production status, and link the copy to every contract
allowed to use it. Expired or unapproved copy cannot be scheduled without
an explicit override (§6.3) — see §5's `uw_scheduled_placements.override_*`
columns.

### C. Placing credits into the rundown (traffic staff, milestone 1: manual)
From a contract's obligation, a traffic staffer picks an eligible clock
slot on an eligible date and places the credit. Eligibility (program,
daypart, duration, spacing, existing inventory) is checked at the moment of
placement, not just displayed as a warning after the fact — the same rule
§6.4 states for the (deferred) automatic scheduler applies to a manual
placement too. A conflict is surfaced immediately, not discovered at air
time.

### D. Reviewing pre-broadcast conflicts (traffic staff)
A dashboard of obligations that can't currently be placed — insufficient
inventory, missing copy, an unfulfilled quantity with no eligible slots
left this period (§6.4's "produce an exception list for traffic review
rather than silently violating rules," applied before air, not just after).

### E. Reviewing the post-broadcast exception queue (traffic staff, manager)
Every underwriting-kind `log_broadcast_event` whose outcome isn't
"aired as scheduled" appears here (§16) with the underwriter/contract,
original scheduled time, actual outcome, host action and reason, the
applicable contract requirement, and whether an alternate airing looks
compliant. From here: accept the alternate airing, schedule a makegood,
reassign the obligation, waive it, request clarification, correct the
record, add a note, or close the exception.

### F. Scheduling and confirming makegoods (traffic staff)
A makegood created from an exception is itself a scheduled placement once
a slot is chosen, going through the same eligibility check as any other
placement, then tracked through to its own broadcast event.

### G. Generating affidavits (traffic staff, certified by manager)
Select a contract and a campaign period; the system assembles verified air
dates/times, actual durations, approved alternates and makegoods, and
relevant exceptions from the underlying broadcast events, and produces a
document a manager certifies (§17).

---

## 4. Screens

```
/underwriting                       Dashboard: pre-broadcast conflicts, open exceptions
/underwriting/contracts             Contract list
/underwriting/contracts/new         Create contract
/underwriting/contracts/[id]        Contract detail — obligations, copy, fulfillment
/underwriting/copy                  Copy library
/underwriting/copy/[id]             Copy detail — approval status, linked contracts
/underwriting/schedule               Placement queue — obligations awaiting a slot
/underwriting/exceptions            Post-broadcast exception queue
/underwriting/exceptions/[id]       Exception detail and resolution
/underwriting/makegoods             Makegood tracking
/underwriting/affidavits            Affidavit list
/underwriting/affidavits/new        Generate an affidavit for a contract/period
/underwriting/affidavits/[id]       Affidavit detail, certify, print
```

**`/underwriting`** — the two queues that actually need daily attention:
obligations that can't currently be placed, and broadcast events awaiting
exception resolution. Everything else is reference data a staffer visits
when something specific needs updating.

**`/underwriting/contracts/[id]`** — obligations and their fulfillment
status side by side with linked copy, so a renewal conversation can see
"met 9 of 12 required credits this month" without cross-referencing two
screens.

---

## 5. Data model

Nine tables, prefixed `uw_`, plus two additive changes to `log_*` tables
(§6).

### `uw_contracts`
`id`, `underwriter_name`, `contract_identifier`, `agreement_document_url`
(nullable), `effective_from`, `effective_to`, `status` (`draft` | `active` |
`expired` | `terminated`), `notes`, `created_by`, `created_at`,
`updated_at`.

### `uw_placement_obligations`
`id`, `contract_id`, `description`, `quantity_required`, `quantity_period`
(`weekly` | `monthly` | `campaign_total`), `duration_seconds`,
`eligible_program_ids` (`uuid[]` → `log_programs`), `eligible_days_of_week`
(`int[]`, nullable), `eligible_daypart` (nullable text), `distribution_rule`
(nullable — spacing/clustering guidance as text, not a rules DSL; see §7),
`sponsorship_position` (nullable — `opening` | `closing` | `mid`),
`start_date`, `end_date` (nullable), `status` (`active` | `fulfilled` |
`at_risk`).

### `uw_copy`
`id`, `script` (nullable), `audio_object_path` (nullable, `underwriting-media`
storage bucket), `duration_seconds`, `cart_identifier`, `effective_from`,
`effective_to` (nullable), `approval_status` (`draft` | `approved` |
`expired` | `retired`), `production_status` (`pending` | `produced`),
`created_by`, `created_at`.

### `uw_contract_copy`
`contract_id`, `copy_id` — many-to-many join; a copy version can serve more
than one contract (e.g. a shared underwriter umbrella campaign).

### `uw_scheduled_placements`
`id`, `obligation_id`, `copy_id`, `log_rundown_item_id` (set once the write
into Log succeeds — see §6), `placement_date`, `program_id`,
`clock_slot_id`, `status` (`scheduled` | `locked` | `conflict` |
`superseded`), `override_reason` (nullable — set when placed with expired
or unapproved copy per §6.3), `created_by`, `created_at`.

### `uw_exceptions`
`id`, `log_broadcast_event_id`, `obligation_id`, `original_scheduled_at`,
`host_action`, `host_reason` (mirrors Log's `reason` enum), `requirement_note`,
`compliance_judgment` (`compliant` | `noncompliant` | `pending`),
`recommended_action`, `resolution_status` (`open` | `resolved`),
`resolution_action` (nullable — `accept_alternate` | `schedule_makegood` |
`reassign` | `waive` | `clarification_requested` | `corrected` | `closed`),
`resolution_notes`, `resolved_by`, `resolved_at`.

### `uw_makegoods`
`id`, `exception_id`, `obligation_id`, `scheduled_placement_id` (nullable
until scheduled), `status` (`scheduled` | `aired` | `cancelled`),
`scheduled_for`, `aired_log_broadcast_event_id` (nullable).

### `uw_affidavits`
`id`, `contract_id`, `campaign_period_start`, `campaign_period_end`,
`generated_at`, `generated_by`, `certifying_staff_id` (nullable until
certified), `certification_text` (nullable), `report_identifier`, `status`
(`draft` | `certified`).

### `uw_affidavit_line_items`
`affidavit_id`, `log_broadcast_event_id`, `scheduled_placement_id` — the
durable link §17 requires between an affidavit and the specific airings
that support it, enabling both audit and regeneration without re-deriving
which events counted.

---

## 6. Architecture

### RLS shape: member vs. manager

Same shape as Log's member/producer split, Roadmap's member/curator, and
Academic Partnerships' member/coordinator: `private.has_underwriting_access`
is the ordinary `tool_access` membership predicate, and
`private.is_underwriting_manager` (`tool_access.tool_role = 'manager'`) is
the elevation for actions §16/§17 reserve to management — waiving an
obligation, certifying an affidavit, and overriding expired/unapproved copy
into a placement (§6.3's "explicit override"). Ordinary traffic staff do
everything else: contracts, copy, placement, exception triage up to but not
including a waive/certify decision.

### The Log boundary is two-way, and both directions are scoped grants, not shared tables

`docs/broadcast-operations-strategy.md` §2 and `docs/log-design.md` §6
already settle that this tool doesn't get its own copy of Log's rundown
schema. Concretely, this tool's own migration is where both halves of the
relationship get built:

**Write into Log.** Placing a credit (§3C) needs to create a real
`log_rundown_items` row with `item_kind = 'underwriting_credit'` and
`underwriting_copy_id` set — columns this tool's migration adds to
`log_rundown_items`, per `docs/log-design.md`'s explicit deferral. The
actual write goes through a `security definer` function this migration adds
on Log's side, `log_place_underwriting_credit(...)`, in the same shape as
`ri_bind_guest_participant()`/`ri_guest_join_waiting_room()` — a plain RLS
insert policy naming underwriting members would let them write any
`log_rundown_items` row, not just an underwriting-credit one in a slot that
actually permits it, so the guard lives in the function body instead. The
`underwriting.credit.schedule` capability calls this function, not a bare
Supabase insert.

**Read from Log.** The exception queue (§3E) and affidavit generation
(§3G) both read `log_broadcast_events` (joined through `log_rundown_items`
to find rows where `item_kind = 'underwriting_credit'`). This is a plain
additive `select` policy scoped to that join condition plus underwriting
membership — read-only, no write access needed in this direction, since
hosts are the only ones who write broadcast events.

**The reverse read Log needs from this tool.** A host's live "move" action
in the console (Log §14.2) has to validate a new slot against the
obligation's own eligibility rules — program, daypart, duration, spacing —
which live in `uw_placement_obligations`, not Log's schema. So this tool's
migration also adds a narrow `select` policy on `uw_placement_obligations`
for Log members, scoped to obligations with an active scheduled placement
in the rundown being edited. Log doesn't duplicate obligation rules into
its own schema to avoid this read; it borrows the one copy that exists,
same principle as every other cross-tool link in this portal.

### Milestone 1 ships the real write path, not a fake one

Manual placement (§3C) and the eventual automatic scheduler (§7) produce
the *same* `uw_scheduled_placements`/`log_rundown_items` rows through the
*same* `log_place_underwriting_credit()` function — a human choosing the
slot today, a rules engine choosing it later. This mirrors Academic
Partnerships' manual `mailto:` path staying available alongside real email:
build the real data path first, automate the decision that feeds it later,
never a placeholder that has to be swapped out.

One consequence worth stating plainly: `docs/log-design.md`'s milestone 1
lets someone manually create a `log_content_items` row with
`content_type = 'underwriting_credit'` as a stopgap before this tool
exists. Those items and any rundown placements built from them are **not**
migrated into the real `uw_copy`/`uw_scheduled_placements` model when this
tool ships — they stay exactly what they were, ordinary content items. Only
placements made through this tool's write path from here forward use
`item_kind = 'underwriting_credit'`.

### Affidavits are a certified document, not a generated PDF, in milestone 1

§17 wants a proof-of-performance document with certification language and
a unique identifier. This repo has no PDF-generation dependency anywhere
today (Sourcework only *reads* PDFs, via `pdfjs-dist`), and "don't add a
major dependency without a specific reason" argues against reaching for one
just to satisfy a formatting preference. Milestone 1's affidavit is a
structured on-screen record (`/underwriting/affidavits/[id]`) styled for
browser print-to-PDF, backed by `uw_affidavit_line_items`' real evidence
trail — the same pragmatic call Academic Partnerships made keeping a manual
`mailto:` path instead of building templated sending before it was needed.
A real PDF-generation library is a reasonable follow-up once someone's
actually filed a printed affidavit and found the browser-print version
insufficient, not before.

### Audit events

Privileged actions here — waiving an obligation, certifying an affidavit,
overriding expired/unapproved copy into a placement, terminating a
contract — call `logAuditEvent()` (`underwriting.obligation.waived`,
`underwriting.affidavit.certified`, `underwriting.placement.override`,
`underwriting.contract.terminated`), with a new
`audit_events_insert_underwriting` policy scoped to this tool's members,
mirroring Academic Partnerships' `audit_events_insert_academic_partnerships`.
Contract/copy/obligation creation and ordinary placement are routine
traffic-staff work, not privileged, and stay off the audit log — same
distinction Roadmap draws between filing a post (ordinary) and curating one
(audited).

### Fit with portal conventions

`requireToolAccess("underwriting")` gates the route segment; Server Actions
per screen area (`contract-actions.ts`, `copy-actions.ts`,
`placement-actions.ts`, `exception-actions.ts`, `affidavit-actions.ts`)
assert access first, `failIfError`/`failWith` on the way back; reads in
`lib/underwriting/queries.ts` behind `unwrapRead()`; pure logic —
eligibility checking, fulfillment-status derivation, the exception
resolution-action list — colocated with `*.test.ts`, no Supabase import.

Capabilities: `underwriting.credit.schedule` (place an obligation into a
slot — `confirmation: "required"` when it involves an override, since that
bypasses an explicit compliance rule the same way a `confirmation`-gated
capability elsewhere in this portal guards an irreversible or rule-bending
action), `underwriting.exception.resolve`, and
`underwriting.contract.fulfillmentStatus` (a read, mirroring
`sourcework.project.search`'s usefulness to the in-portal agent without a
full screen in front of you).

### What's deliberately not in the architecture (milestone 1)

- **No automatic rules-based scheduler.** §7 below; the manual write path
  is real, the automation on top of it is a follow-up slice.
- **No PDF generation.** §6 above.
- **No direct automation-system export or as-run reconciliation.** Source
  doc §24 lists this as a subsequent capability, and it depends on the same
  open question Log's design doc raises about which automation system and
  export format WUWF actually uses.
- **No billing, invoicing, receivables, or commissions.** Explicitly out of
  scope for the entire product per the source document's boundaries table —
  not a milestone deferral, a permanent exclusion.

---

## 7. Milestone 1, and what is left

**Milestone 1** ships: contracts, placement obligations, copy with its
approval workflow, manual placement into Log's rundown (the real write
path, §6), pre-broadcast conflict review, the post-broadcast exception
queue reading Log's broadcast events, makegood tracking, and
browser-printable certified affidavits with a durable evidence link.

**Deferred, matching the strategy doc's build order:**

1. **Automatic rules-based scheduling** — a follow-up slice once manual
   placement has validated the eligibility rules against WUWF's actual
   contract patterns (strategy doc §6, item 3). Building the ruleset before
   real contracts have exercised the manual path risks encoding assumptions
   nobody's confirmed yet — `distribution_rule` staying free text in
   milestone 1 rather than a structured spacing DSL is the same caution
   applied to the schema.
2. **True PDF/document generation for affidavits**, once the
   browser-print version has actually been used and found wanting.
3. **Automation-system export and as-run reconciliation**, pending the open
   question below.
4. **Scheduled proof-of-performance delivery** (source doc §24) — sending
   an affidavit automatically on a cadence. No notification/scheduling
   layer exists in this repo yet to build it on.

**Open questions specific to this tool, carried from the strategy doc's §7
and sharpened:**

- Which underwriting constraints — spacing/clustering avoidance, position
  restrictions, distribution patterns — are contractually mandatory versus
  merely WUWF's historical practice? This determines whether
  `distribution_rule` can ever become a real structured rule set or should
  stay advisory text indefinitely.
- Who holds final authority to waive an obligation, certify an affidavit,
  and approve an alternate airing — is "manager" one role, or does it split
  between a traffic lead and station management? The schema above assumes
  one elevated role; if WUWF's actual sign-off chain has two distinct
  approvers, `uw_exceptions`/`uw_affidavits` need a second role and a
  two-step approval, not a bigger single role.
- Which broadcast automation system receives the current RadioTraffic log,
  and what export/as-run format does it support? Blocks both the deferred
  automation-system integration and any real answer to whether
  `confirmation_source = 'automation'` on a broadcast event is ever
  populated automatically.
