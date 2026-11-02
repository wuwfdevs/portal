# Contract copy flow and copy rotation — hand-off

**Date:** 2026-09-27 · **Status:** built the same day (see
`docs/underwriting-traffic-redesign.md` §13); kept as the record of the
decisions ·
**Boards:** https://claude.ai/artifact/D7piH7tes9QWFX4nUag1JG (six artboards: the
step as built, the proposed Copy step, its edit / new / link states, and the
contract page's Copy tab).

This is one change, built at once: the copy half of contract setup is
redesigned, and copy rotation becomes a maintained property of a contract
instead of a per-line side effect of auto-fill. Read this whole file, then
the files in §0, before touching anything.

## 0. Read first

- `CLAUDE.md` — the Underwriting & Traffic entries from "insertion-order-
  grounded redesign" onward, and "List pages, create, edit, and right
  columns".
- `docs/underwriting-traffic-redesign.md` §9 (revisions, lines, buckets),
  §10 (freeze, fill order, bumping), §11 (setup wizard, contract page).
- `docs/ui-patterns.md` — the inline create card, the shared-form rule, the
  pickers rule.
- Code: `src/app/(portal)/underwriting/contracts/[id]/policy/page.tsx`
  (the step being split), `contracts/[id]/page.tsx` (the Copy tab and the
  readiness links), `contracts/[id]/wizard-header.tsx`,
  `contracts/[id]/line-card.tsx` (the manual placement form),
  `copy/copy-form.tsx`, `copy-actions.ts`, `contract-actions.ts`
  (`linkCopyToContract`, `setCopyFlight`, `unlinkCopyFromContract`,
  `returnPath`), `placement-actions.ts`, `makegood-actions.ts`,
  `lib/underwriting/inventory-selection.ts`, `lib/underwriting/auto-fill.ts`
  (`autoFillScheduleLine`, the bump branch), `lib/underwriting/placement.ts`,
  `lib/underwriting/queries.ts` (`getContractDetail`, `listCopy`,
  `listCopyLinkedToContracts`, `listPlacementsWithOutcomes`),
  `lib/underwriting/capabilities.ts`, and the SQL of
  `log_place_underwriting_credit()` / `uw_automation_block()` in
  `supabase/migrations/20260925150000_underwriting_demand_buckets.sql` and
  `20260925190000_underwriting_frozen_rundowns_and_bumping.sql`.

## 1. Decisions already made (do not reopen)

1. **Copy is its own wizard step.** Setup becomes five steps: The order →
   Schedule → Copy → Traffic policy → Review & activate. Step 3 is
   `/contracts/[id]/copy`; step 4 keeps `/contracts/[id]/policy` with only
   the traffic-policy form. Each step ends in one Continue.
2. **A linked message is a card with its script in full**, and Edit,
   Approve and Unlink act in place. The same card component renders on the
   Copy step and on the contract page's Copy tab, so nothing on the
   contract page links back into the wizard.
3. **Editing a linked message edits the shared `uw_copy` row.** There is
   one message, not a per-contract copy of it. The edit card names the
   other contracts the row serves before Save. No "duplicate into this
   contract" action.
4. **Approval stays a one-click workflow action on the card**, never a
   field inside the edit form (same reasoning the copy library's detail
   page already records). The create card gets an "Approved — ready to
   place" checkbox, since by the time an order is entered the sponsor has
   usually signed off.
5. **"Link existing" lists this underwriter's copy first.** Other
   underwriters' copy appears only when the search text matches it.
6. **Rotation is one contract-wide cycle in broadcast order**, maintained
   automatically: the planner assigns copy in air order across all of a
   contract's lines, and after any write that changes the rotation's inputs
   or the contract's timeline, a rebalance walk re-sequences every future,
   unaired, unfrozen placement. There is **no manual "re-rotate" action**.
7. **Manual placement is rotation by default.** The "Place a credit" form
   shows the message the cycle would pick and no picker; "Choose a specific
   message" is a disclosure. A hand-picked approved message may later be
   replaced by the rotation. A placement made with a manager override
   (`override_reason` not null) is a fixed point the walk never changes.
8. **Not built:** weights, fixed day assignments, per-line rotation
   settings, a stored rotation position, lazy copy assignment at rundown
   read time. Effective dates and flights are how a message is scoped to a
   period or event.

## 2. Part A — the UI

### 2.1 Wizard split

- `wizard-header.tsx`: five steps. Indices: new/order 0, schedule 1, copy 2,
  policy 3, contract page 4. Update every `current={…}` and the
  schedule step's button to "Continue to copy".
- New route `src/app/(portal)/underwriting/contracts/[id]/copy/page.tsx`
  (`maxDuration` not needed). The policy page loses its copy section, keeps
  the traffic-policy form, and its footer becomes "← Back to copy" /
  "Continue to review". The policy form's "Save policy" button stays.
- Copy step footer: "← Back to schedule" (ghost) / "Continue to traffic
  policy" (primary link to `/policy`). No save needed; every card action
  already persisted.
- `readinessHref.copy` on the contract page → `${base}/copy`.
- `return_to` values: `copy-actions.ts`'s `contractReturnPath` and
  `contract-actions.ts`'s `returnPath` accept `copy` (the step), `policy`
  (kept for the policy form), and default to the contract page's Copy tab
  (`${contractPath}?tab=copy`). Every copy form on either surface posts the
  matching `return_to`.

### 2.2 The message card (`contracts/[id]/copy-card.tsx`, server component)

Renders one linked `uw_copy` row for a contract. Header row: label (bold),
approval badge (`success` approved, `warning` draft, `muted`
expired/retired), meta line "Live read · ~~18s estimated from 48 words ·
effective 2026-10-05 onward" (recorded: "Recorded · 30s · cart 1234"; the
"~~" and word count only when `duration_seconds` equals
`estimateReadSeconds(script)` — otherwise "18s timed"), then on the contract
page only: "scheduled 38 · aired 11 · next Mon 7:49 AM" (§2.6). Right side:
Edit (ghost link to `?edit=<id>` on the current surface), Unlink (a form to
`unlinkCopyFromContract`), and a "⋮" `ActionMenu` holding **Change
status…** (a small form with the approval select, posting `setCopyStatus`
with `return_to`), **Serve one flight only…** (only when the contract has
flights; posts `setCopyFlight`), **Open in copy library**. Body: the script,
`whitespace-pre-line`, or "No script recorded."

A draft card has a warning-tinted footer: "Not yet approved — auto-fill and
manual placement skip it until it is." with an **Approve** primary button
(a form posting `setCopyStatus` with `approval_status=approved` and
`return_to`). Border `warning-border` for a draft, `line` otherwise.

Empty state (no copy linked): one card reading "No messages yet." with the
same two toolbar actions repeated inside it.

### 2.3 Editing in place

`?edit=<copyId>` swaps that card for a form. Split `copy/copy-form.tsx`
into `CopyFormFields` (fields only, the same pattern as
`AddFieldFields`/`CriterionFields`) and keep `CopyForm` as the library's
wrapper. The in-place form: highlighted card (`border-brand-primary ring-2
ring-brand-surface`, as `InlineCreateCard`), title "Editing <label>",
`CopyFormFields` prefilled, a note row "Also linked to IO 4106 (Autumn Beck
Blackledge) — the change applies there too." listing every other contract
the row serves (from `getCopyDetail(...).contracts`; "only linked to this
contract" when none), footer Save changes / Cancel (link to the bare path) /
"Open in copy library ↗". Posts `updateCopyDetails` with `copy_id`,
`contract_id`, `return_to`; on success redirect to the surface, not to
`/copy/[id]`. Errors bounce to `?edit=<id>&error=…` (`failWith` appends).

Script field: a live read-time hint under the textarea, "~14s at 160 words
per minute · 36 words · parenthesized host directions aren't counted",
computed client-side with `lib/log/read-time.ts`'s `estimateReadSeconds` /
word count (a small `"use client"` `ScriptField` wrapping `Textarea`, the
only client piece; it keeps `controlClasses`). Duration field label "Timed
duration (s)", placeholder "Leave blank to use the estimate". Add
"Effective to" — the wizard's old short form omitted it.

### 2.4 Creating in place

`?new=1` opens an `InlineCreateCard` ("New message for <underwriter>") above
the cards with `CopyFormFields` plus a `ChoiceCards` execution picker (two
options with one-line descriptions; the DAD cart field is disabled/enabled
by it — a tiny client toggle, or leave it enabled with the existing hint if
that is simpler) and an **"Approved — ready to place"** checkbox
(`approve_now`). Submit "Create and link" posts `createCopy` with
`contract_id`, `return_to`, `approve_now`; the action inserts
`approval_status = 'approved'` when checked, sets
`uw_copy.underwriter_id = contract.underwriter_id` (so the row is
attributable before any placement exists — this column already exists from
the program-log import), defaults `effective_from` to the contract's
`effective_from`, and links the row as today. The primary "+ New message"
link and the "Link existing…" secondary link sit on a heading row
"Messages · 2 linked · 1 awaiting approval" above the cards, on both
surfaces.

### 2.5 Linking existing copy

`?link=1` opens a second inline card, "Link a message already on file":
a `SearchableSelect` (`copy_id`), a "Serves" select (whole contract / each
flight, only when flights exist), submit "Link to this contract" /
Cancel. Posts `linkCopyToContract` with `return_to`.

Options come from a new `listLinkableCopyForContract(contractId)` in
`queries.ts`: every `uw_copy` row not already linked, split into
**primary** (attributed to this underwriter directly via
`uw_copy.underwriter_id`, or linked through `uw_contract_copy` to any other
contract of this underwriter) and **secondary** (everything else). Extend
`SearchableSelect` with `secondaryOptions`: shown only when the query has
two or more characters and matches them, under a group line "Other
underwriters"; primary options always listed, under "<Underwriter> · N on
file". Each option: label + status badge on the first line, a hint line
"Live read · ~26s · linked to IO 4106 (ended 2026-04-05) · effective
2025-10-06 onward", and a `detail` line with the script's first ~110
characters (add `detail?: string` to `SearchableOption`). A footer line in
the listbox: "61 messages belong to other underwriters. They appear once
your search matches one." Retired/expired copy is listed with its badge —
linking it is allowed, placing it is not, and the hint says so.

The Copy step's aside gains a "From previous orders" panel ("<Underwriter>
has 3 messages on file, 2 approved, last aired under IO 4106") from the
same read, linking to `?link=1`.

### 2.6 Contract page Copy tab

Replace the tab's `<ul>` with the toolbar row and the cards (§2.2–2.5 all
work here with `return_to` defaulting to the tab). Drop the footer sentence
that points at the wizard. Heading "Messages in rotation · 2 approved".
Below the cards one line: "Auto-fill rotates approved messages in order
across every line of this contract. A message effective for part of the run
only rotates on the dates it covers."

Counts per message (contract page only): from `listPlacementsWithOutcomes`
for the contract's current-revision lines, group by `copy_id`:
`scheduled` = non-superseded placements with outcome `pending`, `aired` =
outcome `aired`, `next` = the earliest pending `scheduled_at` formatted with
`lib/underwriting/placement.ts`'s station-local formatter. Program-log-
imported credits have no placement row and are not counted; say so in the
query's docstring, not in the UI.

### 2.7 Manual placement form (`line-card.tsx`)

The copy `<Select>` becomes a read-only line "Copy: next in rotation —
Message B" (computed by `nextInRotation()` from §3.2 against the contract's
timeline for the chosen break's air date; when no break is chosen yet, the
message the walk would pick after the contract's latest placement) with a
`<details>` "Choose a specific message" holding the existing select and the
override-reason field. Posting no `copy_id` means rotation decides: the
action resolves it server-side with the same function before calling
`placeCredit`. The hint under the disclosure: "A hand-picked approved
message is a starting point; the rotation may re-sequence it. Placing with
an override pins it." `makegood-actions.ts`'s slot form: same treatment.

## 3. Part B — rotation

### 3.1 Definition

A contract's **cycle** is its linked copy (`uw_contract_copy` joined to
`uw_copy`) ordered by `uw_copy.created_at` then `id` — the order the Copy
tab lists them. A placement is **eligible** for a copy when the copy is
approved, `effective_from <= placement_date <= effective_to` (null = open),
the link's `flight_id` is null or equals the placement's line's
`flight_id`, and `duration_seconds` fits the break's remaining room with the
placement's own current item excluded. The **timeline** is every
non-superseded placement of the contract's current revision's lines, all
lines together, ordered by `scheduled_at` then `id`. A placement is
**fixed** when it has aired or has any broadcast event, when
`uw_automation_block()` returns non-null for its break and rundown, or when
`override_reason` is not null. Walking the timeline forward, each
non-fixed placement takes the first eligible copy strictly after the
previous placement's copy in the cycle (wrapping), where "previous" is the
placement immediately before it in the timeline whatever its line and
whether or not it is fixed. If the previous placement's copy is no longer
linked, or there is no previous placement, start from the cycle's first
eligible copy. If no copy is eligible, the placement keeps its current copy
(a rebalance never clears a placement).

### 3.2 Pure module `lib/underwriting/rotation.ts` (+ `rotation.test.ts`)

```ts
export interface RotationCopy {
  id;
  approvalStatus;
  durationSeconds;
  effectiveFrom;
  effectiveTo;
  flightId;
  createdAt;
}
export interface RotationSlot {
  placementId;
  scheduledAt;
  airDate;
  lineFlightId;
  copyId;
  fixed: boolean;
  roomSeconds: number; /* break remaining + this item's own duration */
}
export function cycleOrder(copies: RotationCopy[]): RotationCopy[];
export function eligibleFor(copy, slot): boolean;
export function nextInRotation(copies, previousCopyId: string | null, slot): RotationCopy | null;
export function walkRotation(copies, slots: RotationSlot[]): { placementId; copyId }[]; // only the changes
```

Tests (write these first): two lines alternate in air order; three messages
cycle; an insertion between A and B takes the message after A and the
following non-fixed slots re-sequence; a fixed (aired, frozen, overridden)
slot is never changed but does advance the cycle; an ineligible message
(draft, out of dates, wrong flight, too long) is skipped; a message
effective mid-run joins from its first date; a previous copy no longer
linked restarts from the first; a slot with no eligible copy keeps its copy;
the output lists only slots whose copy actually changes.

### 3.3 Planner change (`inventory-selection.ts`, `auto-fill.ts`)

Remove `existingUsageCount`, the `usage` map and `selectCopyForBreak`'s
least-used sort. At pick time the planner only needs to know that some
eligible copy fits the break (keep `copyEligible`, ask for any); the copy
written is chosen by a final pass: merge the run's planned units with the
contract's existing timeline (all lines — `auto-fill.ts` reads
`listPlacementsWithOutcomes` for the contract's current-revision lines, not
`listPlacementsForScheduleLine`), sort by `scheduled_at`, and assign each
new unit with `nextInRotation` against its predecessor. Bumping's re-place
uses the same. Then, after the run's writes (and after each contract in the
dashboard-wide loop), call `rebalanceContractRotation(contractId)` (§3.5)
so any doubles the insertion created against existing later placements are
re-sequenced. Update `inventory-selection.test.ts` accordingly.

### 3.4 Boundary function (migration)

`supabase/migrations/20260928120000_underwriting_copy_rotation.sql`:
`log_reassign_underwriting_credit_copy(p_placement_id uuid, p_copy_id uuid)`
returns jsonb, `security definer`, granted to `authenticated`, revoked from
`public`/`anon`, in the exact shape of `log_place_underwriting_credit()`.
It locks the placement's schedule line, then refuses with a named error
unless: the placement exists and is not superseded (`unknown_placement`,
`placement_superseded`); it has no broadcast event (`already_aired`);
`override_reason` is null (`placement_pinned`); the contract is active
(`contract_not_active`); `uw_automation_block()` is null for its break and
rundown (`rundown_frozen` / `break_in_past`); the copy is linked to the
contract and flight-compatible with the line (`copy_not_linked`,
`copy_wrong_flight`); approved and in date for `placement_date`
(`copy_not_approved`); `duration_seconds` not null and fits
`available_duration_seconds` minus the other items' `planned_duration_
seconds` (`too_long`). Then it updates `log_rundown_items.underwriting_
copy_id` and `planned_duration_seconds`, and `uw_scheduled_placements.
copy_id`, and returns `{ok: true}`. A no-op when the copy is unchanged.
Comment the function the way the others are. Apply to preview, then
production, add the `APPLIED.md` row, `npm run db:check`. Verify with a
rolled-back RLS-impersonated scenario on preview exercising every refusal
(the §9.5 precedent).

### 3.5 Rebalance (`lib/underwriting/rotation-rebalance.ts`, server-only)

`rebalanceContractRotation(contractId): Promise<{ changed: number; refused:
{ placementId; error }[] }>`. Reads the contract, its linked copy with flight
scopes, its current-revision lines, the timeline with outcomes, and each
placement's break room (extend `listPlacementsWithOutcomes` or add one read
of `log_rundown_items`/`log_rundown_breaks` through the existing
`log_list_placeable_rundown_breaks()`-style boundary — if no existing read
exposes a placement's break room to an underwriting session, add
`log_list_underwriting_credit_rooms(p_contract_id)` to the same migration,
returning `placement_id, remaining_seconds, rundown_status, break_scheduled_
at`). Builds `RotationSlot[]` (fixed per §3.1), runs `walkRotation`, and
calls the boundary function once per change, sequentially. A refusal is
logged and skipped, never thrown — the walk is a best-effort enhancement on
an already-succeeded write, the same rule as embeddings. Skip entirely for a
non-active contract. Log one `underwriting.contract.rotation_rebalanced`
audit event when `changed > 0` (member-level, like `auto_filled`).

Call it at the end of, after the primary write succeeded and before
`revalidatePath`: `linkCopyToContract`, `unlinkCopyFromContract`,
`setCopyFlight`, `createCopy` (when linked), `updateCopyDetails` and
`setCopyStatus` (for every contract the row is linked to —
`getCopyDetail(...).contracts`), `placeCreditAction`, the makegood slot
action, `cancelScheduleLineFrom`, revision activation, and
`autoFillScheduleLine` / the contract- and dashboard-wide loops (once per
contract, after all its lines). Never from a Log host action.

### 3.6 Capability

`underwriting.credit.schedule` (`lib/underwriting/capabilities.ts`):
`copyId` becomes optional; absent, the handler resolves it with
`nextInRotation` and then rebalances. Document in the capability's
description. Confirmation stays required.

## 4. Docs and records

- `docs/underwriting-traffic-redesign.md`: add §13 "Copy on the contract,
  and rotation (2026-09-28)" recording §1's decisions, the five-step wizard,
  the rotation definition (§3.1 verbatim), the call sites, and the
  migration. Link the boards.
- `docs/underwriting-design.md`: correct §6's copy-rotation sentence to the
  contract-wide, broadcast-order definition.
- `docs/ui-patterns.md` Rollout: the wizard's copy step is now on the inline
  create/edit pattern with the shared `CopyFormFields`; `SearchableSelect`
  gained `secondaryOptions` and `detail`.
- `CLAUDE.md`: one pointer entry under Underwriting & Traffic, dated, naming
  the wizard split, the shared card, the rotation rule, the rebalance call
  sites, and the migration. Keep it short; the redesign doc holds the
  account.
- `supabase/migrations/APPLIED.md`: the new row with both dates.

## 5. Verification before calling it done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:check`.
- Migration applied to `wuwf-tools-portal-preview` and `wuwf-tools-portal`,
  the RLS-impersonated refusal scenario run on preview, both recorded.
- On preview, against the Autumn Beck Blackledge test contract or a fresh
  one: two lines, two approved messages, "Auto-fill this contract" → list
  the contract's placements by `scheduled_at` and confirm strict A/B
  alternation across both lines; approve a third message → confirm future
  placements re-sequence A/B/C from the next unfrozen rundown and nothing
  before "now" changed; retire it → the reverse; place one credit manually
  with a manager override → confirm it survives the next rebalance.
- Every focusable control on the new cards uses `Input`/`Select`/`Textarea`
  or `MOBILE_SAFE_TEXT_SIZE` (the recurring iOS zoom bug).
- Errors from every new form render inside that form (`?new=1&error=`,
  `?edit=<id>&error=`, `?link=1&error=`).

## 6. Out of scope

Weights or fixed ordering beyond `created_at`; pinning a hand-picked
approved message without an override; rotation for program-log-imported
credits (they have no placement rows); any change to
`log_place_underwriting_credit()`'s guards; lazy copy assignment at rundown
read time; a "duplicate message into this contract" action.

## 7. Assumptions to confirm in passing

- `uw_scheduled_placements` has no `created_at`/position column that would
  be a better cycle order than `uw_copy.created_at`; if a later order needs
  reordering, a `rotation_position` on `uw_contract_copy` is the place.
- Retired/expired copy remains linkable (it is today); only placement
  refuses it.
- `setCopyStatus` is not one of §6's manager-only actions; leave it
  member-level.
