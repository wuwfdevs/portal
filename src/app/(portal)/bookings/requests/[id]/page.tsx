import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSummary } from "@/components/ui/detail-summary";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Steps } from "@/components/ui/steps";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { envelopeCheck, parseHonoredRead } from "@/lib/bookings/airtime";
import { calendarStateFrom } from "@/lib/bookings/estimate";
import { TREATMENT_SHORT_LABEL } from "@/lib/bookings/labels";
import { REQUESTS_PATH, agreementHref, requestEditHref } from "@/lib/bookings/paths";
import { AGREEMENT_STATUS_SHORT_LABEL } from "@/lib/bookings/agreements";
import { estimateDraw } from "@/lib/bookings/pricing";
import {
  DISPOSITIONS,
  DISPOSITION_BADGE,
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
import {
  getActivePlan,
  getPlanCalendar,
  getPricingContext,
  getProjectDetail,
  listAgreementChoices,
  listAirtimeCommitments,
  listAttachableBlocks,
  listBookingsMembers,
  readAirtimeHonored,
} from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import type { BkEstimateLineKind } from "@/lib/database.types";
import { formatDateShort } from "@/lib/log/program-status";
import {
  addNote,
  approveEstimate,
  assignOwner,
  markDelivered,
  reopenProject,
  sendEstimate,
  setDisposition,
  setProjectAgreement,
} from "../actions";
import { ActivityLog } from "./activity-log";
import { AirtimeSection } from "./airtime-section";
import { DatesSection, checkPlannedDates } from "./dates-section";
import { EstimateSection } from "./estimate-section";

type Params = {
  error?: string;
  saved?: string;
  new?: string;
  kind?: string;
  line?: string;
  airtime?: string;
};

const SAVED_LABEL: Record<string, string> = {
  created: "Created",
  "1": "Saved",
  sent: "Estimate sent",
  booked: "Booked",
  delivered: "Delivered",
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

  const [plan, pricing, members, allCommitments, agreementChoices, attachableBlocks] =
    await Promise.all([
      getActivePlan(),
      getPricingContext(project.rate_model_version_id),
      listBookingsMembers(context.tool.id),
      listAirtimeCommitments(),
      listAgreementChoices(partner.id, project.agreement_id),
      detail.agreement && detail.agreement.status === "active" && project.disposition === null
        ? listAttachableBlocks(detail.agreement)
        : Promise.resolve([]),
    ]);
  const [calendar, honoredRead] = plan
    ? await Promise.all([getPlanCalendar(plan), readAirtimeHonored(plan.id)])
    : [null, null];
  const state = calendar ? calendarStateFrom(calendar, nowISO) : null;
  const checks = state ? checkPlannedDates(detail, state) : [];
  const draw = estimateDraw(detail.lines.map((l) => ({ ...l, labor_hours: l.labor_hours ?? {} })));
  const envelope = plan
    ? envelopeCheck(
        allCommitments.filter((c) => c.project_disposition === null),
        plan,
        plan.airtime_contributed_minutes_per_week,
      )
    : null;
  const honored = parseHonoredRead(honoredRead?.payload ?? null);

  const estimate = estimateState(project, nowISO);
  const actions = availableStageActions(project, {
    roles: context.isAdministrator ? ["production"] : context.roles,
    hasLines: detail.lines.length > 0,
    hasCommitments: detail.commitments.length > 0,
    isPriced: project.priced_as !== null,
    nowISO,
  });
  const failingDates = checks.filter((c) => c.result && !c.result.ok).length;
  const lineKind: BkEstimateLineKind =
    query.kind === "labor" || query.kind === "expense" ? query.kind : "package";

  return (
    <div className="flex flex-col gap-5">
      <Link href={REQUESTS_PATH} className="inline-block text-xs font-semibold text-brand-link">
        ← Requests
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-bold text-ink-900">{project.title}</h2>
          {project.disposition ? (
            <Badge variant={DISPOSITION_BADGE[project.disposition]}>
              {DISPOSITION_LABEL[project.disposition]}
            </Badge>
          ) : (
            <Badge variant="accent">{STAGE_LABEL[project.stage]}</Badge>
          )}
          {query.saved && SAVED_LABEL[query.saved] && (
            <Badge variant="success">{SAVED_LABEL[query.saved]}</Badge>
          )}
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
          {(asksForProduction(project.requested) || detail.lines.length > 0) && (
            <EstimateSection
              detail={detail}
              pricing={pricing}
              canEdit={canEdit}
              isExecutive={context.isExecutive}
              openCard={query.new === "line" ? { kind: lineKind } : null}
              editingLine={query.line ?? null}
            />
          )}
          {(asksForProduction(project.requested) || detail.bookings.length > 0) && (
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

          {project.description && (
            <section className="rounded border border-line bg-panel-50 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
                What is asked for
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                {project.description}
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
              Add a note
            </h3>
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
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
              Activity
            </h3>
            <ActivityLog events={detail.events} />
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          <section className="rounded border border-line bg-white">
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
                  Delivered on {formatDateShort(project.delivered_at.slice(0, 10))}. Settlement
                  arrives in a later slice.
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
          </section>

          <DetailSummary
            title="Scope"
            editHref={canEdit ? requestEditHref(project.id) : undefined}
            items={[
              { label: "Partner", value: partner.name },
              {
                label: "Agreement",
                value: detail.agreement ? (
                  <Link
                    href={agreementHref(partner.id, detail.agreement.id)}
                    className="font-semibold text-brand-link hover:underline"
                  >
                    {detail.agreement.label}
                  </Link>
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
                label: "Priced as",
                value: project.priced_as ? TREATMENT_SHORT_LABEL[project.priced_as] : null,
              },
              { label: "Editorial", value: EDITORIAL_REVIEW_LABEL[project.editorial_review] },
              { label: "Owner", value: detail.owner_name },
            ]}
          />

          {(agreementChoices.length > 0 || detail.agreement) && (
            <section className="rounded border border-line bg-white">
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                Agreement
              </div>
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
                    Work under an agreement is priced against its reserve share and may take one of
                    its reserved blocks.
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
            </section>
          )}

          <section className="rounded border border-line bg-white">
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              Owner
            </div>
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
          </section>

          {canEdit && canSetDisposition(project) && (
            <section className="rounded border border-line bg-white">
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
                  <label className="flex items-start gap-2 text-xs text-ink-700">
                    <input type="checkbox" name="for_capacity" className="mt-0.5 size-4" />
                    <span>
                      Declined for capacity — record the estimate&apos;s margin as foregone for the
                      term report.
                    </span>
                  </label>
                )}
                <Button type="submit" variant="secondary" className="self-start">
                  Close
                </Button>
              </form>
            </section>
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
