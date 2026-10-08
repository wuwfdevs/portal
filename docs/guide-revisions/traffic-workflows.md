# Traffic: operational workflow guide (draft for verification)

**Status:** Editorial draft. No production edits. Reconcile with the live staff-edited `underwriting-set-up-a-contract` guide (flagged `needs_review`) before any guide migration. Confirm code and live behavior for actions named below.

## Direct screen links

These links target the **portal's current route structure**. Dynamic record screens must be opened from their parent list; a link to a list cannot identify an individual record.

- [Copy](/underwriting/copy)
- [Place a credit](/underwriting/contracts)
- [Affidavits](/underwriting/affidavits)
- [Exceptions](/underwriting/exceptions)
- [Contracts](/underwriting/contracts)
- [Dashboard](/underwriting)
- [Migration](/underwriting/setup/migration)
- [DAD log](/log/dad-log)

## Purpose and handoffs

Traffic turns an approved underwriting agreement into a measurable broadcast obligation. The essential chain is **signed order → contract and flights → scheduled demand → approved copy → placed credit → broadcast verification → exception or fulfillment → affidavit**. A scheduled credit is not necessarily an aired credit. An approved script is not necessarily a recorded DAD cut.

The underwriting or business team is accountable for accurate commercial terms, schedule and sponsor information. Traffic is accountable for correct placement and reconciliation. Production is accountable for recording required cuts. Managers handle designated exceptions and affidavit certification. Station procedures for processing underwriter card payments are separate from the Traffic tool; do not store card details in contract notes.

## 1. Enter or reconcile a contract

1. Find the organization and check for an existing contract before creating another.
2. Read the signed insertion order. Identify its date range, any distinct flights, inventory pools or named programs, duration, required total, weekly or daily quotas, exclusions, copy restrictions, separation rules, makegood approval requirements and affidavit terms.
3. Enter the contract and its schedule so each line accurately expresses the obligation. **Do not convert a three-per-week order into a daily credit merely because seven days are eligible.** Period demand and eligibility are different.
4. Where an order includes explicit dates or a changing schedule, preserve those constraints rather than spreading credits across the entire campaign. Use the review warnings to flag inconsistencies in the source order; do not silently correct a signed document.
5. Attach the agreement and verify the entered figures against it. Complete the activation readiness checks. A draft does not schedule until activated.

**Migrated agreements:** Inspect the import and any unrecognized names or missing source documents. Treat migrated historical placements as provisional until reviewed against the actual order and run evidence. Do not infer an advertiser's consent to a makegood or substitution from a completed import.

## 2. Prepare and approve copy

1. From the contract's **Copy** area, create a new message or link existing copy. Verify that the sponsor identification and script satisfy the order and station underwriting standards.
2. Associate approved messages with the correct contract, flight and, where stipulated, schedule line. A line-specific message must not rotate onto unrelated lines.
3. Check the script's status, effective dates, duration, and DAD cut. **Approved** governs scheduling eligibility; **recorded in DAD** governs whether automation can play it.
4. For a newly assigned cut, record the message under the identified cut number and mark it recorded after checking the actual DAD asset. An existing DAD spot must be explicitly selected when the copy references one. Changing a cut or substantive wording can clear the recorded status.
5. Confirm the correct treatment for live reads during hosted hours and recorded playback during unattended hours. A new live read is not automatically ready for automated playback.

### Rotation example

Two approved messages with weights **2** and **1** should be distributed approximately two-to-one over eligible placements, rather than all instances of one followed by the other. Weights apply within the group of messages that rotate together (general contract copy or copy dedicated to a specific line); aired credits remain fixed and changing weights only resequences unaired credits. Review the current copy-rotation guide for exact controls.

## 3. Place and verify credits

1. Check the line's remaining demand and eligible dates or inventory pools.
2. Use **Place a credit** to select an available break and verify the proposed message. Manual placement may show adjacency warnings; these warnings are advisory and should still be considered.
3. Use the available auto-fill scope (line, contract or all eligible active contracts) when appropriate. Auto-fill may provision the rundowns it needs. Its success must be checked against each line's period demand, not simply by counting total credits.
4. Distinguish the placement record from broadcast confirmation. Review outcomes and period fulfillment after air; resolve missed, preempted or otherwise disputed credits using the exception workflow.
5. Where agency approval is required for a makegood, record it before scheduling the substitution. Avoid using an available slot to conceal a contractual shortfall in a different week or flight.
6. Generate affidavits from confirmed fulfillment for the required period. Certification is manager-controlled and creates a fixed record; investigate discrepancies before certifying.

## 4. Unattended hours and DAD

Traffic's placement system and On Air's automation schedule are linked but not interchangeable.

- On Air defines which hours are automated and which hours permit underwriting. An eligible contractual obligation does not override an hours-closed rule.
- The DAD log includes playable breaks for unattended hours only; hosted hours remain the host's responsibility.
- Check the DAD log's pre-release warnings: missing or unrecorded cuts, unapproved or out-of-date messages, live-only elements and invalid timing can block release.
- Traffic releases and downloads the generated day file, which must then reach DAD's import folder. **A released export does not by itself prove DAD imported or aired it.**
- If a rundown changes after release, examine the stale-release warning and generate a new version. Preserve the version trail.

**Integration boundary:** Verify the operational process for confirming DAD import and reconciling actual playout. The repository describes exported files and broadcast events, but this guide must not claim an automated ENCO return path without verifying it.

## 5. Troubleshooting and decisions

| Situation | First check | Responsible handoff |
|---|---|---|
| Credits are not filling | Active status, approved and eligible copy, line demand, date/window restrictions and inventory | Traffic / underwriting |
| A cut cannot be released | Cut number, actual recording, recorded flag, timing and automated-hours eligibility | Production / Traffic |
| Scheduled count differs from order | Period-by-period quantity, flight boundaries, revisions and source-order inconsistencies | Underwriting / Traffic |
| Credit did not air | Broadcast event or playout evidence, recorded exception and makegood requirements | Traffic / manager |
| An affidavit is disputed | Confirmed airing history, contract terms, makegoods, and document period | Traffic / certifying manager |

## Publication controls

- [ ] Reconcile the flagged, staff-edited `underwriting-set-up-a-contract` article; preserve editorial text.
- [ ] Compare the existing exceptions-and-makegoods guide with the older combined exceptions/makegoods/affidavits guide; consolidate overlapping instructions without losing useful detail.
- [ ] Validate screen labels and roles against the current code and a signed-in workflow.
- [ ] Link the separate underwriter payment SOP; do not blend PCI procedures into this tool guide.
- [ ] Check whether October 8 weighted-rotation migrations are applied to production before calling them live.
- [ ] Release through migration only after review, with correct screen keys and a release note.
