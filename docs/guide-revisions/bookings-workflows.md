# Bookings: workflow guides (draft for verification)

**Status:** Editorial draft, not a released portal guide. Do not describe it as the live procedure until the relevant Bookings migrations have been applied and the workflows verified with the appropriate staff roles.

**Audience:** Staff handling university and external production requests; operations staff responsible for capacity; finance staff responsible for settlement.

**Source of truth:** Current request, calendar, rate, and settlement implementations and `docs/bookings-design.md`; consult the live portal for applied behavior. Existing guides remain authoritative where the production application differs.

## 1. How Bookings works

Bookings helps WUWF answer three questions before accepting production work: **Can we deliver it? What will it cost? Who will pay for it?** It also records what actually happened so the station can evaluate its commitments and recover appropriate costs.

A **request** identifies the partner, work, dates, and rate. An **estimate** prices the requested services using a versioned rate card. A **booking** occupies a specific pool and time window and draws on production capacity. An **agreement**, where applicable, records longer-term commitments and may reserve windows for a partner. A **settlement** records actual cost and the amount recharged or invoiced after delivery.

### The two constraints are different

- **Production capacity** is tracked by labor class and available time. A term plan records the hours available for production work, any reserve for strategic university work, and the facilities or service pools that may be booked. Core duties that have already been excluded from the available-hours figure must not also be entered as dated holds, or capacity is deducted twice.
- **Airtime capacity** is derived from eligible opportunities in On Air's clocks, with the university contribution reflected in the term plan. Bookings reports this envelope; it does **not** place on-air announcements. Actual placement belongs in Traffic or On Air.

### Three pricing situations

- **University rate:** a university unit pays the modeled cost under the applicable rate card.
- **University rate (WUWF contributing):** eligible strategic/applied-learning work uses a protected professional labor reserve; the partner still pays the elements charged under that rate, such as student labor and equipment.
- **Outside rate:** external work uses the outside rate, including the applicable assessment and margin.

These are pricing treatments, not judgments about whether a project is worthwhile. Strategic status does not create unlimited capacity: when the reserve cannot cover the professional time requested, the system can price the work at the university rate and flag the limitation.

**Distinguish four figures.** *Modeled cost* estimates WUWF's resources for the work. *Quoted amount* is what the partner is expected to pay. *Actual cost* is reconstructed from confirmed labor, equipment and direct expenses after delivery. *WUWF contribution* is the portion of actual cost not covered by the partner's payment, floored at zero. Do not call the quoted amount WUWF's cost or treat capacity hours as invoice amounts.

### What a term plan means

A term plan is a bounded planning period, not a claim that every staff hour is available for outside projects. Operations enters the professional time genuinely available for production after routine core obligations, and records dated holds for additional known conflicts. Protected capacity is set per labor class, not as a blanket percentage of all labor. A labor class without a reserve draws ordinary open capacity even on a strategic booking.

**Release verification required:** The repository's October 7 capacity correction permits multiple active nonoverlapping plans, selects the plan by booking date, and makes closed plans final. `docs/bookings-design.md` states those migrations were not yet applied when that section was written. Confirm migration status and live behavior before converting this paragraph into published instructions.

## 2. Handle a new production request

The simplest path should be the default. Use a university production request—such as coverage or event support requested by Athletics—as the running example; do not imply that Athletics has a blanket agreement or an approved contribution.

### Before opening the form

Clarify the requesting unit or organization; the intended deliverable; event date and location; whether facilities, field production, editing, or live support are needed; the responsible WUWF production lead; and any known approval, distribution, or access requirements. If any of those remain uncertain, record an assumption rather than treating it as confirmed scope.

### Enter, price, and check dates

1. In **Bookings → Requests**, select **+ New request**.
2. Identify the partner, select the requested service, and enter the event date and required information. For a university request, answer the strategic/applied-learning question only when that classification has actually been decided.
3. Select **Create and price the estimate**. The request and its estimate are created together. Review the summary: work, partner amount, WUWF contribution, required time, date feasibility and estimate expiry.
4. Open **Show calculation** if you need to understand the rate version, labor and equipment assumptions or how the quoted amount was derived. These details are for review, not values to change casually.
5. If **The dates need attention** appears, read the specific reason and assess the offered alternative dates with the partner and production lead. Never assume a date is committed solely because it appears on the request.
6. If the actual work differs from the standard package, use **Adjust scope**. Record the revised hours, facilities, crew or dates explicitly; once dates are manually adjusted, the automatic date planner no longer manages them.

**Before sending an estimate:** Check that the package actually describes the work, that dates and capacity are feasible, that the rate treatment is defensible, and that the request identifies what the partner will receive. A displayed estimate is not itself agreement to perform the work.

### From estimate to delivery

The existing request workflow distinguishes estimate, planning, date holds, commitments, delivery and settlement. Follow the controls and approvals for the request's current stage. Tentative bookings reserve their windows and have a limited lifetime; do not promise permanent availability on the strength of a tentative hold. Where an agreement reserves blocks, verify that the requested use falls within the agreement and its release deadlines.

**Handoff:** The production lead confirms the practical schedule, resources and completed work. The person authorized to approve the commitment confirms acceptance before dates and service terms are treated as firm. Finance is responsible for the settlement record, not for reconstructing production hours from guesswork.

### When something changes

- **Scope or timing changes before delivery:** update the request, rerun the relevant checks, and communicate any changed estimate or availability before proceeding.
- **Conflict or exhausted capacity:** consult the reason and alternate dates; do not invent capacity by overlooking a blackout or protected reserve. Booking exceptions require the Executive Director and are audited.
- **Work beyond the approved estimate:** record the additional effort in actuals. The settlement calculation does not automatically increase the partner's agreed charge just because staff spent more time.
- **Cancellation or a mistake:** check the request's stage and relevant booking/agreement controls before releasing dates; do not assume a posted finance record can be reversed inside Bookings.

## 3. Plan and govern production capacity

**Owner:** Operations; executive approval or policy decisions where required. This guide explains the model, not a substitute for annual or term planning conversations.

1. **Establish the planning period.** Identify the dates, expected university commitments, likely external demand, staffing and facility constraints. The term is the unit in which capacity is committed and reported.
2. **Enter realistic available hours.** For each labor class, enter the production hours remaining after routine core duties. Do not begin with payroll hours and treat them as entirely bookable. Record known assumptions so the figure can be explained later.
3. **Assign reserves deliberately.** Apply a reserve share only to classes whose professional time WUWF intends to contribute to strategic work. A class with no reserve still needs enough open hours for every booking, including strategic work that uses that class.
4. **Configure pools and windows.** Define how many units of each studio, field, live or editing pool can be used and when a booking can take them. A pool is an availability constraint, not an invoice line by itself.
5. **Record dated exclusions.** Use blackouts for dates closed to partner work and holds for specific WUWF uses. Avoid double counting work already excluded from the hours entered above.
6. **Test representative requests.** Check an ordinary university production request, an eligible strategic request, an external request and a day with competing uses. Confirm that both the labor-class capacity and the pool window permit the proposed work.
7. **Review commitments periodically.** Compare bookings and holds with remaining open capacity, and the airtime envelope with actual on-air commitments. Escalate policy questions—such as releasing unused strategic reserve—rather than silently changing the plan to accommodate one request.

**Do not conflate reserve with discounted pricing.** Reserve protects a defined amount of professional time. The rate treatment follows both strategic eligibility and available reserve. Likewise, a partner's payment does not guarantee an available studio or staff member.

## 4. Close and settle a delivered request

**Owner:** Production confirms actual resource use; Finance drafts and posts the settlement.

1. Mark the request delivered through its established workflow only after confirming the agreed service was provided.
2. Confirm actual labor hours for each planned class and resource use for each planned pool. Settlement drafting is blocked until required confirmation is complete.
3. In the request's **Settlement** section, review the draft. The partner amount starts from the approved estimate, replacing estimated direct expenses with recorded actual expenses. Actual labor and resource use determine **cost to WUWF**, not an automatic increase to the partner's charge.
4. Enter actual direct expenses, a funding index for a university recharge or the relevant invoice information for an external partner, and explanatory notes as appropriate.
5. Use **Update the draft** to recalculate from the latest confirmed actuals; compare the amount, actual cost, and contribution with the estimate.
6. Record the transaction in the university's financial system according to Finance's process. Enter the journal entry number, then **Post the settlement** in Bookings. Posting makes the settlement final.

**Important limitations:** The repository design explicitly defers Banner integration, PDF invoicing, and reversal of posted settlements. Do not describe those actions as available within Bookings. A correction to a posted record needs the applicable Finance procedure outside the ordinary edit workflow.

## Editorial and release checklist

- [ ] Verify live production migration status, especially the October 7 capacity correction, against the repository and preview.
- [ ] Verify current button text, stage transitions and authorization for each role in the actual application.
- [ ] Compare these explanations with the live 11 Bookings guides; retain their detailed screen references, remove duplication and preserve history.
- [ ] Convert approved sections into ProseMirror `rc_release_guide` migrations, with screen keys and one dated release note; do not overwrite editor-modified content.
- [ ] Run `release-content.test.ts`, the Bookings suite, and a signed-in walkthrough before publishing.
