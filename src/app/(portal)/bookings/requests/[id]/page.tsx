import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSummary } from "@/components/ui/detail-summary";
import { FieldHint, Input, Label, Select, Textarea, CheckboxField } from "@/components/ui/input";
import { Steps } from "@/components/ui/steps";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { envelopeCheck, parseHonoredRead } from "@/lib/bookings/airtime";
import { calendarStateFrom } from "@/lib/bookings/estimate";
import { BADGE_LABEL, BADGE_TITLE, badgesFor, projectBadgeFacts } from "@/lib/bookings/badges";
import { buildBookingPlan, type PlanLine } from "@/lib/bookings/booking-plan";
import { PRODUCTION_RATE_HINT, PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import { buildSummary, capacityStatusFor, hourBuckets, serviceName } from "@/lib/bookings/summary";
import { formatWindow, type CalendarState } from "@/lib/bookings/scheduling";
import { REQUESTS_PATH, agreementHref, requestEditHref } from "@/lib/bookings/paths";
import { AGREEMENT_STATUS_SHORT_LABEL } from "@/lib/bookings/agreements";
import { estimateDraw, estimateTotals, isAdjusted } from "@/lib/bookings/pricing";
import {
  DISPOSITIONS,
  DISPOSITION_STATUS,
  DISPOSITION_LABEL,
  EDITORIAL_REVIEW_LABEL,
  PARTNER_KIND_LABEL,
  REQUESTED_LABEL,
  SOURCE_LABEL,
  STAGES,
  STAGE_LABEL,
  asksForAirtime,
  asksForProduction,
  availableStageActions,
  canSetDisposition,
  estimateState,
  stageIndex,
} from "@/lib/bookings/projects";
import { currentPlan, planForDate } from "@/lib/bookings/plans";
import {
  getPlanCalendar,
  getPricingContext,
  getProjectDetail,
  getSettlement,
  listAgreementChoices,
  listAirtimeCommitments,
  listAttachableBlocks,
  listBookingsMembers,
  listHoursUsed,
  listPlans,
  listPools,
  readAirtimeHonored,
} from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import { draftSettlement, settlementState } from "@/lib/bookings/settlements";
import { unitCostsFromRows } from "@/lib/bookings/pricing";
import type { BkEstimateLineKind } from "@/lib/database.types";
import { formatDateShort } from "@/lib/log/program-status";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  addNote,
  answerStrategic,
  approveEstimate,
  assignOwner,
  chooseAlternative,
  markDelivered,
  reopenProject,
  resumeAutoPlan,
  sendEstimate,
  setDisposition,
  setProjectAgreement,
} from "../actions";
import { ActivityLog } from "./activity-log";
import { HoursUsed } from "./hours-used";
import { SettlementSection } from "./settlement-section";
import { AirtimeSection } from "./airtime-section";
import { DatesSection, checkPlannedDates } from "./dates-section";
import { CalculationPanel } from "./calculation-panel";
import { EstimateSection } from "./estimate-section";
import { TextLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";

type Params = {
  error?: string;
  saved?: string;
  new?: string;
  kind?: string;
  line?: string;
  adjust?: string;
  airtime?: string;
};

const SAVED_LABEL: Record<string, string> = {
  created: "Created",
  "1": "Saved",
  sent: "Estimate sent",
  booked: "Booked",
  delivered: "Delivered",
  settlement: "Settlement saved",
  settled: "Settled",
};

/**
 * The project page (docs/bookings-design.md §4): the stage strip, the
 * estimate, the dates with their capacity check, airtime, notes and
 * activity; an aside with the stage actions, the scope summary, the owner
 * and the dispositions. Every write is a form; open cards and edit rows are
 * query-string state.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ id }, query, context] = await Promise.all([
    params,
    searchParams,
    requireBookingsAccess(),
  ]);
  const detail = await getProjectDetail(id);
  if (!detail) notFound();
  const { project, partner } = detail;
  const nowISO = new Date().toISOString();
  const canEdit = context.isProduction || context.isDirector || context.isExecutive;

  const [
    plans,
    pricing,
    members,
    allCommitments,
    agreementChoices,
    attachableBlocks,
    pools,
    hoursUsed,
    settlement,
  ] = await Promise.all([
    listPlans(),
    getPricingContext(project.rate_model_version_id),
    listBookingsMembers(context.tool.id),
    listAirtimeCommitments(),
    listAgreementChoices(partner.id, project.agreement_id),
    detail.agreement && detail.agreement.status === "active" && project.disposition === null
      ? listAttachableBlocks(detail.agreement)
      : Promise.resolve([]),
    listPools(),
    listHoursUsed(id),
    getSettlement(id),
  ]);
  // The plan is the active one whose dates contain the event (§22.3); without an event
  // date, the current term's. A project whose dates reach into another term has each of
  // those dates checked against that term's calendar.
  const plan =
    (project.event_starts_on ? planForDate(plans, project.event_starts_on) : null) ??
    currentPlan(plans, stationTodayISO(nowISO));
  const [calendar, honoredRead] = plan
    ? await Promise.all([getPlanCalendar(plan), readAirtimeHonored(plan.id)])
    : [null, null];
  const state = calendar ? calendarStateFrom(calendar, nowISO) : null;
  const otherPlans = [
    ...new Map(
      detail.bookings
        .filter((b) => b.status !== "released")
        .map((b) => planForDate(plans, b.date))
        .filter((p): p is NonNullable<typeof p> => p !== null && p.id !== plan?.id)
        .map((p) => [p.id, p] as const),
    ).values(),
  ];
  const otherStates = new Map(
    await Promise.all(
      otherPlans.map(
        async (p) => [p.id, calendarStateFrom(await getPlanCalendar(p), nowISO)] as const,
      ),
    ),
  );
  const stateFor = (date: string): CalendarState | null => {
    const covering = planForDate(plans, date);
    return (covering ? otherStates.get(covering.id) : undefined) ?? state;
  };
  const checks = state ? checkPlannedDates(detail, stateFor) : [];
  const draw = estimateDraw(detail.lines.map((l) => ({ ...l, labor_hours: l.labor_hours ?? {} })));
  const envelope = plan
    ? envelopeCheck(
        allCommitments.filter((c) => c.project_disposition === null),
        plan,
        plan.airtime_contributed_minutes_per_week,
      )
    : null;
  const honored = parseHonoredRead(honoredRead?.payload ?? null);

  // Settlement at actual cost (§21): the draft the confirmed hours give, recomputed live until it is posted.
  const settlementLines = detail.lines.map((l) => ({
    id: l.id,
    kind: l.kind,
    package_id: l.package_id,
    label: l.label,
    quantity: Number(l.quantity),
    amount: Number(l.amount),
    direct_cost: l.direct_cost === null ? null : Number(l.direct_cost),
    labor_hours: l.labor_hours ?? {},
    resource_units: l.resource_units ?? {},
    recipe_labor_hours: l.recipe_labor_hours,
    recipe_resource_units: l.recipe_resource_units,
  }));
  const confirmedFigures = hoursUsed.map((row) => ({
    kind: row.kind,
    id: (row.kind === "labor" ? row.labor_class_id : row.pool_id) ?? "",
    planned: Number(row.planned),
    used: Number(row.used),
  }));
  const settlementStatus = settlementState(settlementLines, confirmedFigures, settlement);
  const settlementPreview =
    (project.stage === "delivered" || project.stage === "settled") &&
    settlement?.status !== "posted" &&
    settlementStatus !== "awaiting_hours" &&
    pricing
      ? draftSettlement({
          partnerKind: partner.kind,
          treatment: project.priced_as,
          lines: settlementLines,
          confirmed: confirmedFigures,
          unitCosts: unitCostsFromRows(pricing.unitCosts),
          assessmentShare: pricing.assessmentShare,
          expenseActuals: settlement?.expense_actuals ?? {},
          estimatedFullCost:
            project.full_economic_cost === null ? null : Number(project.full_economic_cost),
        })
      : null;

  const estimate = estimateState(project, nowISO);
  const failingDates = checks.filter((c) => c.result && !c.result.ok).length;

  // The system's plan for the dates (§18.2): shown as an exception when it can't be written.
  const asksProduction = asksForProduction(project.requested);
  const planLines: PlanLine[] = detail.lines.map((l) => ({
    quantity: Number(l.quantity),
    labor_hours: l.labor_hours ?? {},
    resource_units: l.resource_units ?? {},
  }));
  const openBookings = detail.bookings.filter((b) => b.status !== "released");
  const packageLines = detail.lines.filter((l) => l.kind === "package");
  const planCheck =
    state &&
    asksProduction &&
    project.disposition === null &&
    project.stage === "request" &&
    project.dates_mode === "auto" &&
    project.event_starts_on &&
    planLines.length > 0 &&
    openBookings.length === 0
      ? buildBookingPlan(
          {
            date: project.event_starts_on,
            window:
              project.event_window_start && project.event_window_end
                ? {
                    start: project.event_window_start.slice(0, 5),
                    end: project.event_window_end.slice(0, 5),
                  }
                : null,
            lines: planLines,
            treatment: project.priced_as ?? "incremental",
            partnerId: project.partner_id,
          },
          state,
        )
      : null;
  const planFailure = planCheck && !planCheck.ok ? planCheck : null;
  const actions = availableStageActions(project, {
    roles: context.isAdministrator ? ["production"] : context.roles,
    hasLines: detail.lines.length > 0,
    hasCommitments: detail.commitments.length > 0,
    isPriced: project.priced_as !== null,
    nowISO,
    datesBlockedReason: planFailure
      ? "Pick a date that works first — see the dates above."
      : undefined,
  });
  const badgeKeys = badgesFor(
    projectBadgeFacts(project, {
      hasPackageLine: packageLines.length > 0,
      openBookings: openBookings.length,
      bookingException: detail.bookings.some((b) => b.exception_reason),
      failingPlannedDates: failingDates,
      scopeAdjusted: detail.lines.some((l) =>
        isAdjusted({
          ...l,
          labor_hours: l.labor_hours ?? {},
          resource_units: l.resource_units ?? {},
        }),
      ),
      customPackage: packageLines.some(
        (l) => pricing?.packages.find((p) => p.id === l.package_id)?.agreement_id != null,
      ),
    }),
  );
  const totals = estimateTotals(
    detail.lines.map((l) => ({ ...l, labor_hours: l.labor_hours ?? {} })),
  );
  const classFlags = (pricing?.classes ?? calendar?.classes ?? []).map((c) => ({
    id: c.id,
    charged_in_strategic: c.charged_in_strategic,
  }));
  const warnings = checks.flatMap((c) => (c.result?.ok ? c.result.warnings : []));
  const sendAction = actions.find(
    (a) => a.action === "send_estimate" || a.action === "resend_estimate",
  );
  const summary = buildSummary({
    services: packageLines.map((l) => serviceName(l)),
    hours: hourBuckets(
      detail.lines.map((l) => ({ quantity: Number(l.quantity), labor_hours: l.labor_hours ?? {} })),
      classFlags,
    ),
    priced: project.priced_as !== null && detail.lines.length > 0,
    total: totals.total,
    treatment: project.priced_as,
    capacity: capacityStatusFor({
      needsDates:
        asksProduction &&
        (planLines.some((l) => Object.keys(l.resource_units).length > 0) ||
          openBookings.length > 0),
      hasTerm: state !== null,
      eventDate: project.event_starts_on,
      openBookings: openBookings.length,
      planFailed: planFailure !== null,
      failingDates,
      warnings: warnings.length,
      estimate,
      heldUntil: estimate.kind === "sent" ? formatDateShort(estimate.expiresAt.slice(0, 10)) : null,
    }),
    contribution: project.wuwf_contribution === null ? null : Number(project.wuwf_contribution),
    estimate,
    readyToSend: sendAction?.enabled === true && failingDates === 0 && planFailure === null,
  });
  const askStrategic =
    canEdit &&
    partner.kind === "uwf_unit" &&
    project.qualifies_strategic === null &&
    project.disposition === null &&
    (project.stage === "request" || project.stage === "estimate") &&
    detail.lines.length > 0;
  const editingEstimate =
    query.new === "line" || query.line !== undefined || query.adjust !== undefined;
  const lineKind: BkEstimateLineKind =
    query.kind === "labor" || query.kind === "expense" ? query.kind : "package";

  return (
    <div className="flex flex-col gap-5">
      <TextLink href={REQUESTS_PATH} className="inline-block text-xs">
        ← Requests
      </TextLink>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-bold text-ink-900">{project.title}</h2>
          {project.disposition ? (
            <StatusBadge map={DISPOSITION_STATUS} value={project.disposition} />
          ) : (
            <Badge variant="accent">{STAGE_LABEL[project.stage]}</Badge>
          )}
          {query.saved && SAVED_LABEL[query.saved] && (
            <Badge variant="success">{SAVED_LABEL[query.saved]}</Badge>
          )}
          {badgeKeys.map((key) => (
            <Badge key={key} variant="warning" title={BADGE_TITLE[key]}>
              {BADGE_LABEL[key]}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-ink-500">
          {partner.name} · {PARTNER_KIND_LABEL[partner.kind]} · {REQUESTED_LABEL[project.requested]}{" "}
          · {SOURCE_LABEL[project.source]} on {formatDateShort(project.created_at.slice(0, 10))}
        </p>
        <Steps
          label="Stages"
          steps={STAGES.map((stage) => ({ label: STAGE_LABEL[stage] }))}
          current={project.stage === "settled" ? STAGES.length : stageIndex(project.stage)}
        />
      </header>

      {query.error && <Alert>{query.error}</Alert>}
      {project.disposition && (
        <Alert variant="note">
          {DISPOSITION_LABEL[project.disposition]}
          {project.disposition_at
            ? ` on ${formatDateShort(project.disposition_at.slice(0, 10))}`
            : ""}
          : {project.disposition_reason}
          {project.margin_foregone !== null
            ? ` · foregone margin ${formatDollars(Number(project.margin_foregone))}`
            : ""}
          . Its holds were released; reopening keeps the stage reached but not the dates.
        </Alert>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {(asksProduction || detail.lines.length > 0) && (
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-sm leading-relaxed text-ink-900" data-testid="summary-line">
                {summary.parts.map((part, index) => (
                  <span key={part.key}>
                    {index > 0 && <span className="text-ink-400"> · </span>}
                    <span className={part.key === "price" ? "font-bold" : undefined}>
                      {part.text}
                    </span>
                  </span>
                ))}
              </p>
              {project.priced_as && (
                <p className="text-xs text-ink-500">{PRODUCTION_RATE_HINT[project.priced_as]}</p>
              )}
              {askStrategic && (
                <form
                  action={answerStrategic}
                  className="flex flex-wrap items-center gap-3 rounded border border-line bg-panel-50 px-3 py-2 text-sm"
                >
                  <input type="hidden" name="project_id" value={project.id} />
                  <span className="text-ink-700">
                    Is this strategic or applied-learning work? If yes, WUWF contributes the staff
                    time.
                  </span>
                  <span className="flex gap-2">
                    <Button
                      type="submit"
                      name="qualifies_strategic"
                      value="yes"
                      variant="secondary"
                    >
                      Yes
                    </Button>
                    <Button type="submit" name="qualifies_strategic" value="no" variant="secondary">
                      No
                    </Button>
                  </span>
                </form>
              )}
              {planFailure && (
                <Alert variant="warning" className="flex flex-col gap-3 px-4 py-3 text-sm">
                  <p className="font-semibold">The dates need attention.</p>
                  <p>{planFailure.message}</p>
                  {planFailure.alternatives.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs">Nearest that work:</span>
                      {planFailure.alternatives.map((alt) => (
                        <form key={`${alt.date}-${alt.window_start}`} action={chooseAlternative}>
                          <input type="hidden" name="project_id" value={project.id} />
                          <input type="hidden" name="date" value={alt.date} />
                          <input
                            type="hidden"
                            name="window"
                            value={`${alt.window_start}-${alt.window_end}`}
                          />
                          <Button type="submit" variant="secondary">
                            {formatDateShort(alt.date)},{" "}
                            {formatWindow(alt.window_start, alt.window_end)}
                          </Button>
                        </form>
                      ))}
                    </div>
                  )}
                  <p className="text-xs">
                    Or plan the dates by hand under <strong>Adjust scope</strong> below.
                  </p>
                </Alert>
              )}
              {planCheck?.ok && canEdit && (
                <form action={resumeAutoPlan} className="text-xs">
                  <input type="hidden" name="project_id" value={project.id} />
                  <Button type="submit" variant="secondary">
                    Plan the dates now
                  </Button>
                </form>
              )}
              <details open={editingEstimate} className="text-sm">
                <summary className="cursor-pointer text-xs font-bold text-brand-link">
                  Show calculation
                </summary>
                <div className="mt-3 flex flex-col gap-4">
                  <CalculationPanel
                    detail={detail}
                    provisional={pricing ? pricing.version.status !== "adopted" : true}
                  />
                  <EstimateSection
                    detail={detail}
                    pricing={pricing}
                    canEdit={canEdit}
                    isExecutive={context.isExecutive}
                    openCard={query.new === "line" ? { kind: lineKind } : null}
                    editingLine={query.line ?? null}
                    adjustingLine={query.adjust ?? null}
                    pools={pools}
                  />
                </div>
              </details>
            </Card>
          )}
          {(asksProduction || detail.bookings.length > 0) && (
            <details
              open={
                query.new === "date" ||
                query.new === "block" ||
                project.dates_mode === "manual" ||
                failingDates > 0
              }
              className="rounded border border-line bg-white"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink-900">
                Adjust scope
                <span className="ml-2 text-xs font-normal text-ink-500">
                  Plan the dates by hand, or change what is booked
                </span>
              </summary>
              <div className="border-t border-line p-1">
                <DatesSection
                  detail={detail}
                  calendar={calendar}
                  state={state}
                  checks={checks}
                  draw={draw}
                  canEdit={canEdit}
                  openCard={query.new === "date" ? "date" : query.new === "block" ? "block" : null}
                  attachableBlocks={attachableBlocks}
                />
              </div>
            </details>
          )}
          {(asksForAirtime(project.requested) || detail.commitments.length > 0) && (
            <AirtimeSection
              detail={detail}
              envelope={envelope}
              honored={honored?.commitments ?? []}
              honoredError={honoredRead?.error ?? null}
              canEdit={canEdit}
              openCard={query.new === "airtime"}
              editing={query.airtime ?? null}
            />
          )}

          {(project.stage === "delivered" || hoursUsed.length > 0) && (
            <HoursUsed
              detail={detail}
              classes={(pricing?.classes ?? calendar?.classes ?? []).map((c) => ({
                id: c.id,
                name: c.name,
              }))}
              pools={pools}
              confirmed={hoursUsed}
              canEdit={canEdit && project.stage === "delivered" && project.disposition === null}
            />
          )}

          {(project.stage === "delivered" || project.stage === "settled" || settlement) &&
            project.disposition === null && (
              <SettlementSection
                projectId={project.id}
                state={settlementStatus}
                settlement={settlement}
                preview={settlementPreview}
                fundingIndexDefault={project.funding_index ?? partner.default_funding_index}
                expenseLines={settlementLines
                  .filter((l) => l.kind === "expense")
                  .map((l) => ({
                    id: l.id,
                    label: l.label,
                    estimatedCost: Number(l.direct_cost ?? 0) * l.quantity,
                    actualCost: settlement?.expense_actuals?.[l.id] ?? null,
                  }))}
                isFinance={context.isFinance}
              />
            )}

          {project.description && (
            <section className="rounded border border-line bg-panel-50 p-4">
              <SectionHeading level="eyebrow" as="h3" className="mb-2">
                What is asked for
              </SectionHeading>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                {project.description}
              </p>
            </section>
          )}

          <section>
            <SectionHeading level="eyebrow" as="h3" className="mb-2">
              Add a note
            </SectionHeading>
            <form action={addNote} className="flex flex-col gap-2">
              <input type="hidden" name="project_id" value={project.id} />
              <Textarea
                name="note"
                rows={3}
                placeholder="Internal note — visible to Bookings staff only"
              />
              <Button type="submit" variant="secondary" className="self-start">
                Add note
              </Button>
            </form>
          </section>

          <section>
            <SectionHeading level="eyebrow" as="h3" className="mb-2">
              Activity
            </SectionHeading>
            <ActivityLog events={detail.events} />
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          <Card>
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              Stage
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 text-sm text-ink-700">
              {estimate.kind === "sent" && (
                <p>
                  Estimate out; its dates are held until{" "}
                  {formatDateShort(estimate.expiresAt.slice(0, 10))} ({estimate.daysLeft} day
                  {estimate.daysLeft === 1 ? "" : "s"}).
                </p>
              )}
              {estimate.kind === "expired" && (
                <p className="text-warning-fg">
                  The estimate expired on {formatDateShort(estimate.expiredAt.slice(0, 10))}; its
                  holds no longer take the windows. Send it again or close the request.
                </p>
              )}
              {estimate.kind === "approved" && (
                <p>
                  Approved on {formatDateShort(estimate.approvedAt.slice(0, 10))}; the dates are
                  confirmed.
                </p>
              )}
              {project.stage === "delivered" && project.delivered_at && (
                <p>
                  Delivered on {formatDateShort(project.delivered_at.slice(0, 10))}. Confirm the
                  hours used, then Finance settles it at actual cost.
                </p>
              )}
              {actions.length === 0 &&
                estimate.kind === "none" &&
                project.disposition === null &&
                project.stage === "request" && (
                  <p className="text-xs text-ink-500">
                    Production staff send the estimate once it is priced.
                  </p>
                )}
              {actions.map((option) => {
                const action =
                  option.action === "approve_estimate"
                    ? approveEstimate
                    : option.action === "mark_delivered"
                      ? markDelivered
                      : sendEstimate;
                const blockedByDates =
                  (option.action === "send_estimate" || option.action === "resend_estimate") &&
                  failingDates > 0;
                return (
                  <form key={option.action} action={action} className="flex flex-col gap-1">
                    <input type="hidden" name="project_id" value={project.id} />
                    <Button
                      type="submit"
                      variant={option.action === "resend_estimate" ? "secondary" : "primary"}
                      disabled={!option.enabled}
                    >
                      {option.label}
                    </Button>
                    {!option.enabled && option.reason && (
                      <span className="text-xs text-ink-500">{option.reason}</span>
                    )}
                    {option.enabled && blockedByDates && (
                      <span className="text-xs text-warning-fg">
                        {failingDates} planned date{failingDates === 1 ? "" : "s"} would be refused;
                        the send holds all or none.
                      </span>
                    )}
                  </form>
                );
              })}
            </div>
          </Card>

          <DetailSummary
            title="Scope"
            editHref={canEdit ? requestEditHref(project.id) : undefined}
            items={[
              { label: "Partner", value: partner.name },
              {
                label: "Agreement",
                value: detail.agreement ? (
                  <TextLink href={agreementHref(partner.id, detail.agreement.id)}>
                    {detail.agreement.label}
                  </TextLink>
                ) : null,
              },
              { label: "Asks for", value: REQUESTED_LABEL[project.requested] },
              {
                label: "Services asked for",
                value:
                  project.requested_packages.length > 0
                    ? project.requested_packages.join(", ")
                    : null,
              },
              {
                label: "Event",
                value: project.event_starts_on
                  ? `${formatDateShort(project.event_starts_on)}${
                      project.event_ends_on && project.event_ends_on !== project.event_starts_on
                        ? ` – ${formatDateShort(project.event_ends_on)}`
                        : ""
                    }`
                  : null,
              },
              {
                label: "Due",
                value: project.deliverables_due_on
                  ? formatDateShort(project.deliverables_due_on)
                  : null,
              },
              { label: "Location", value: project.location },
              {
                label: "Contact",
                value: [project.contact_name, project.contact_email, project.contact_phone]
                  .filter(Boolean)
                  .join("\n"),
                preserveLines: true,
              },
              { label: "Index", value: project.funding_index ?? partner.default_funding_index },
              {
                label: "Strategic?",
                value:
                  project.qualifies_strategic === null
                    ? "Not decided"
                    : project.qualifies_strategic
                      ? "Yes"
                      : "No",
              },
              {
                label: "Rate",
                value: project.priced_as ? PRODUCTION_RATE_LABEL[project.priced_as] : null,
              },
              { label: "Editorial", value: EDITORIAL_REVIEW_LABEL[project.editorial_review] },
              { label: "Owner", value: detail.owner_name },
            ]}
          />

          {(agreementChoices.length > 0 || detail.agreement) && (
            <details className="rounded border border-line bg-white">
              <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold text-ink-900">
                Agreement
                <span className="ml-2 text-xs font-normal text-ink-500">
                  {detail.agreement ? detail.agreement.label : "None"}
                </span>
              </summary>
              <div className="border-t border-line">
                {canEdit && project.disposition === null && project.stage !== "settled" ? (
                  <form action={setProjectAgreement} className="flex flex-col gap-2 px-5 py-4">
                    <input type="hidden" name="project_id" value={project.id} />
                    <Label htmlFor="agreement_id">Under {partner.name}&apos;s agreement</Label>
                    <Select
                      id="agreement_id"
                      name="agreement_id"
                      defaultValue={project.agreement_id ?? ""}
                    >
                      <option value="">None — priced from the facts on the request</option>
                      {agreementChoices.map((agreement) => (
                        <option key={agreement.id} value={agreement.id}>
                          {agreement.label}
                          {agreement.status !== "active"
                            ? ` (${AGREEMENT_STATUS_SHORT_LABEL[agreement.status].toLowerCase()})`
                            : ""}
                        </option>
                      ))}
                    </Select>
                    <FieldHint>
                      Work under an agreement is priced against its reserve share and may take one
                      of its reserved blocks.
                    </FieldHint>
                    <Button type="submit" variant="secondary" className="self-start">
                      Save
                    </Button>
                  </form>
                ) : (
                  <p className="px-5 py-4 text-sm text-ink-700">
                    {detail.agreement ? detail.agreement.label : "None."}
                  </p>
                )}
              </div>
            </details>
          )}

          <details className="rounded border border-line bg-white">
            <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold text-ink-900">
              Owner
              <span className="ml-2 text-xs font-normal text-ink-500">
                {members.find((m) => m.id === project.owner_id)?.displayName ?? "Unassigned"}
              </span>
            </summary>
            <div className="border-t border-line">
              <form action={assignOwner} className="flex flex-col gap-2 px-5 py-4">
                <input type="hidden" name="project_id" value={project.id} />
                <Label htmlFor="owner_id">Who is working this</Label>
                <Select id="owner_id" name="owner_id" defaultValue={project.owner_id ?? ""}>
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" className="self-start">
                  Save
                </Button>
              </form>
            </div>
          </details>

          {canEdit && canSetDisposition(project) && (
            <Card>
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                Close the request
              </div>
              <form action={setDisposition} className="flex flex-col gap-3 px-5 py-4">
                <input type="hidden" name="project_id" value={project.id} />
                <div>
                  <Label htmlFor="disposition">Disposition</Label>
                  <Select id="disposition" name="disposition" defaultValue="deferred">
                    {DISPOSITIONS.map((d) => (
                      <option key={d} value={d}>
                        {DISPOSITION_LABEL[d]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <Input id="reason" name="reason" required maxLength={300} />
                  <FieldHint>Every hold is released; the stage reached is kept.</FieldHint>
                </div>
                {partner.kind === "external" && (
                  <CheckboxField
                    name="for_capacity"
                    label="Declined for capacity — record the estimate's margin as foregone for the term report."
                  />
                )}
                <Button type="submit" variant="secondary" className="self-start">
                  Close
                </Button>
              </form>
            </Card>
          )}
          {canEdit && project.disposition !== null && (
            <form action={reopenProject}>
              <input type="hidden" name="project_id" value={project.id} />
              <Button type="submit" variant="secondary">
                Reopen the request
              </Button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
