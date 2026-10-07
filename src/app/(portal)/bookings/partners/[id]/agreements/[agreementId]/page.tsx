import { Card } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSummary } from "@/components/ui/detail-summary";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import {
  AGREEMENT_STATUS_BADGE,
  AGREEMENT_STATUS_LABEL,
  BLOCK_STATE_BADGE,
  BLOCK_STATE_LABEL,
  bookingDeadline,
  pastBookingDeadline,
  proposalDraw,
  releaseDeadline,
  type Gauge,
} from "@/lib/bookings/agreements";
import { envelopeCheck, formatMinutes } from "@/lib/bookings/airtime";
import { calendarStateFrom } from "@/lib/bookings/estimate";
import { PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import {
  agreementEditHref,
  agreementHref,
  partnerHref,
  ratesHref,
  requestHref,
} from "@/lib/bookings/paths";
import { DISPOSITION_BADGE, DISPOSITION_LABEL, STAGE_LABEL } from "@/lib/bookings/projects";
import {
  getCurrentPlan,
  getAgreementDetail,
  getPlanCalendar,
  listAirtimeCommitments,
} from "@/lib/bookings/queries";
import {
  capacitySummary,
  formatHours,
  formatWindow,
  parseWindows,
  toHHMM,
  totalCapacity,
  windowsFor,
} from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  addReservedBlock,
  approveAgreement,
  deleteAgreement,
  deleteReservedBlock,
  endAgreement,
  keepReservedBlock,
  releaseReservedBlock,
} from "../../../actions";
import { AgreementDocumentUpload } from "./agreement-document-upload";

type Params = { saved?: string; error?: string; new?: string };

const SAVED_LABEL: Record<string, string> = {
  created: "Drafted",
  "1": "Saved",
  approved: "Approved",
  ended: "Ended",
};

function percent(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

/**
 * An agreement's page (docs/bookings-design.md §4): its terms, the proposal
 * preview a draft shows the executive before signature (§3H — its draw on
 * the term's reserve and envelope, and the windows its blocks take), the
 * consumption bars once active, the reserved blocks with their release
 * status, and the requests under it.
 */
export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; agreementId: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ id, agreementId }, query, context] = await Promise.all([
    params,
    searchParams,
    requireBookingsAccess(),
  ]);
  const detail = await getAgreementDetail(agreementId);
  if (!detail || detail.partner.id !== id) notFound();
  const { agreement, partner, blocks, consumption } = detail;
  const today = stationTodayISO();
  const nowISO = new Date().toISOString();
  const canEdit = context.isProduction || context.isDirector || context.isExecutive;
  const canKeep = context.isDirector || context.isExecutive;
  const here = agreementHref(id, agreementId);

  const [plan, commitments] = await Promise.all([getCurrentPlan(), listAirtimeCommitments()]);
  const calendar = plan ? await getPlanCalendar(plan) : null;
  const state = calendar ? calendarStateFrom(calendar, nowISO) : null;
  const total = state ? totalCapacity(capacitySummary(state)) : null;
  const envelope = plan
    ? envelopeCheck(
        commitments.filter((c) => c.project_disposition === null),
        plan,
        plan.airtime_contributed_minutes_per_week,
      )
    : null;
  const draw = proposalDraw(
    agreement,
    blocks,
    plan && total && envelope
      ? {
          starts_on: plan.starts_on,
          ends_on: plan.ends_on,
          reserveTotal: total.reserve,
          reserveRemaining: total.reserveRemaining,
          airtimeRemainingMinutesPerWeek: envelope.remainingMinutesPerWeek,
        }
      : null,
  );
  const poolName = (poolId: string) => detail.pools.find((p) => p.id === poolId)?.name ?? "Pool";

  // Pools a block can be reserved on: the active term's resourced pools, else every active pool.
  const blockPools = calendar
    ? calendar.pools.filter((pool) => state?.resources.some((r) => r.pool_id === pool.id))
    : detail.pools.filter((pool) => pool.active);
  const windows = blockPools.flatMap((pool) =>
    windowsFor(
      state?.resources.find((r) => r.pool_id === pool.id),
      parseWindows(pool.default_windows),
    ),
  );
  const uniqueWindows = windows.filter(
    (w, index) => windows.findIndex((o) => o.start === w.start && o.end === w.end) === index,
  );
  const openProjects = detail.projects.filter((p) => p.disposition === null);

  return (
    <div className="flex flex-col gap-5">
      <Link href={partnerHref(id)} className="inline-block text-xs font-semibold text-brand-link">
        ← {partner.name}
      </Link>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-bold text-ink-900">{agreement.label}</h2>
          <Badge variant={AGREEMENT_STATUS_BADGE[agreement.status]}>
            {AGREEMENT_STATUS_LABEL[agreement.status]}
          </Badge>
          {query.saved && SAVED_LABEL[query.saved] && (
            <Badge variant="success">{SAVED_LABEL[query.saved]}</Badge>
          )}
        </div>
        <p className="text-xs text-ink-500">
          {formatDateShort(agreement.starts_on)} – {formatDateShort(agreement.ends_on)}
          {agreement.approved_at
            ? ` · approved ${formatDateShort(agreement.approved_at.slice(0, 10))}${detail.approved_by_name ? ` by ${detail.approved_by_name}` : ""}`
            : ""}
          {agreement.ended_at ? ` · ended ${formatDateShort(agreement.ended_at.slice(0, 10))}` : ""}
        </p>
      </header>
      {query.error && <Alert>{query.error}</Alert>}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {agreement.status === "draft" && (
            <section className="flex flex-col gap-3 rounded border border-warning-border bg-warning-bg/40 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-bold text-ink-900">What this agreement would draw</h3>
                <span className="text-xs text-ink-500">
                  The proposal preview the Executive Director sees before signing, against{" "}
                  {plan ? `the ${plan.label} term plan` : "the active term plan"} as it stands.
                </span>
              </div>
              {!plan ? (
                <Alert variant="note">
                  No term plan is active, so there is no reserve or envelope to compare against. The
                  windows below are the only draw this page can show.
                </Alert>
              ) : (
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded border border-line bg-white p-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-400">
                      Reserve share
                    </dt>
                    <dd className="mt-1 text-ink-900">
                      <span className="text-lg font-semibold">
                        {formatHours(Number(agreement.reserve_hours_allocated))}
                      </span>
                      <span className="block text-xs text-ink-500">
                        {percent(draw.reserveShare)} of the term&apos;s{" "}
                        {total ? formatHours(total.reserve) : ""} reserve
                      </span>
                      <span
                        className={`block text-xs ${draw.reserveOverdrawn ? "font-semibold text-[#8F3A3A]" : "text-ink-700"}`}
                      >
                        {draw.reserveOverdrawn
                          ? `Overdraws the reserve by ${formatHours(-(draw.reserveRemainingAfter ?? 0))} — the term cannot carry it as planned.`
                          : `Leaves ${formatHours(draw.reserveRemainingAfter ?? 0)} of the reserve for everyone else.`}
                      </span>
                    </dd>
                  </div>
                  <div className="rounded border border-line bg-white p-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-400">
                      Airtime
                    </dt>
                    <dd className="mt-1 text-ink-900">
                      <span className="text-lg font-semibold">
                        {formatMinutes(agreement.airtime_minutes_per_week)} a week
                      </span>
                      <span className="block text-xs text-ink-500">
                        of the envelope&apos;s{" "}
                        {formatMinutes(envelope?.remainingMinutesPerWeek ?? 0)} still uncommitted
                      </span>
                      <span
                        className={`block text-xs ${draw.airtimeOverdrawn ? "font-semibold text-[#8F3A3A]" : "text-ink-700"}`}
                      >
                        {draw.airtimeOverdrawn
                          ? `Over the envelope by ${formatMinutes(-(draw.airtimeRemainingAfter ?? 0))} a week.`
                          : `Leaves ${formatMinutes(draw.airtimeRemainingAfter ?? 0)} a week for other requests and for Traffic.`}
                      </span>
                    </dd>
                  </div>
                  <div className="rounded border border-line bg-white p-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-400">
                      Windows reserved
                    </dt>
                    <dd className="mt-1 text-ink-900">
                      <span className="text-lg font-semibold">{draw.blocksInTerm}</span>
                      <span className="block text-xs text-ink-500">
                        {Object.entries(draw.blocksByPool).length === 0
                          ? "no reserved blocks yet"
                          : Object.entries(draw.blocksByPool)
                              .map(([poolId, count]) => `${count} ${poolName(poolId)}`)
                              .join(" · ")}
                      </span>
                      <span className="block text-xs text-ink-700">
                        Each is closed to other partners until its release deadline once the
                        agreement is active.
                      </span>
                    </dd>
                  </div>
                </dl>
              )}
              {Number(agreement.funded_student_hours) > 0 && (
                <p className="text-xs text-ink-700">
                  Plus {formatHours(Number(agreement.funded_student_hours))} of student / OPS hours
                  the partner funds.
                </p>
              )}
            </section>
          )}

          {agreement.status !== "draft" && (
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-bold text-ink-900">Consumption</h3>
                <span className="text-xs text-ink-500">
                  What requests under this agreement have drawn against its terms, from their live
                  dates and open commitments.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <GaugeView
                  label="Reserve share"
                  gauge={consumption.reserve}
                  format={formatHours}
                  hint="Professional hours of strategic dates"
                />
                <GaugeView
                  label="Funded student hours"
                  gauge={consumption.students}
                  format={formatHours}
                  hint="Student / OPS hours of every date"
                />
                <GaugeView
                  label="Airtime"
                  gauge={consumption.airtime}
                  format={(m) => `${formatMinutes(m)} a week`}
                  hint="Contributed commitments of open requests"
                />
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-bold text-ink-900">Reserved blocks</h3>
              <span className="text-xs text-ink-500">
                Windows held for {partner.name}. A block nobody has taken by{" "}
                {agreement.release_deadline_days} day
                {agreement.release_deadline_days === 1 ? "" : "s"} before its date opens to
                everyone, unless the director keeps it.
              </span>
              <span className="flex-1" />
              {canKeep && agreement.status !== "ended" && (
                <Link
                  href={agreementHref(id, agreementId, { new: "block" })}
                  className="px-1 text-sm font-bold text-brand-link hover:underline"
                >
                  + Reserve a block
                </Link>
              )}
            </div>
            {agreement.status === "draft" && blocks.length > 0 && (
              <Alert variant="note">
                A draft&apos;s blocks reserve nothing yet; they are part of the proposal and take
                effect when the agreement is approved.
              </Alert>
            )}
            {consumption.blocks.pastBookingDeadline > 0 && agreement.status === "active" && (
              <Alert variant="warning">
                {consumption.blocks.pastBookingDeadline} block
                {consumption.blocks.pastBookingDeadline === 1 ? " is" : "s are"} past the booking
                deadline with no request. Each opens to other partners at its release deadline
                unless the director keeps it.
              </Alert>
            )}

            {query.new === "block" && canKeep && (
              <InlineCreateCard
                title="Reserve a block"
                action={addReservedBlock}
                submitLabel="Reserve"
                cancelHref={here}
              >
                <input type="hidden" name="partner_id" value={id} />
                <input type="hidden" name="agreement_id" value={agreementId} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="rb_pool">Pool</Label>
                    <Select id="rb_pool" name="pool_id" defaultValue={blockPools[0]?.id ?? ""}>
                      {blockPools.map((pool) => (
                        <option key={pool.id} value={pool.id}>
                          {pool.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="rb_date">Date</Label>
                    <Input
                      id="rb_date"
                      name="date"
                      type="date"
                      required
                      min={agreement.starts_on}
                      max={agreement.ends_on}
                      defaultValue={today > agreement.starts_on ? today : agreement.starts_on}
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="rb_repeat">Repeat weekly until</Label>
                    <Input
                      id="rb_repeat"
                      name="repeat_until"
                      type="date"
                      min={agreement.starts_on}
                      max={agreement.ends_on}
                    />
                    <FieldHint>Leave blank for one block.</FieldHint>
                  </div>
                  <div>
                    <Label htmlFor="rb_window">Window</Label>
                    <Select id="rb_window" name="window" defaultValue="">
                      {uniqueWindows.map((w) => (
                        <option key={`${w.start}-${w.end}`} value={`${w.start}-${w.end}`}>
                          {w.label} · {formatWindow(w.start, w.end)}
                        </option>
                      ))}
                      <option value="custom">Custom times…</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="rb_start">Custom start</Label>
                    <Input id="rb_start" name="window_start" type="time" />
                  </div>
                  <div>
                    <Label htmlFor="rb_end">Custom end</Label>
                    <Input id="rb_end" name="window_end" type="time" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="rb_notes">Notes</Label>
                    <Textarea id="rb_notes" name="notes" rows={1} />
                  </div>
                </div>
              </InlineCreateCard>
            )}

            {blocks.length === 0 ? (
              <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
                No reserved blocks. An agreement without them still carries its reserve share and
                airtime allowance; its requests book ordinary windows.
              </p>
            ) : (
              <TableFrame>
                <Table stack>
                  <thead>
                    <HeaderRow>
                      <Th>When</Th>
                      <Th>Pool</Th>
                      <Th>Deadlines</Th>
                      <Th>Status</Th>
                      {canKeep && (
                        <Th>
                          <span className="sr-only">Actions</span>
                        </Th>
                      )}
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {blocks.map((block) => {
                      const late = pastBookingDeadline(block, agreement, today);
                      return (
                        <Row key={block.id}>
                          <Cell stack="title">
                            {formatDateShort(block.date, true)} ·{" "}
                            {formatWindow(toHHMM(block.window_start), toHHMM(block.window_end))}
                            {block.notes && (
                              <span className="block text-xs text-ink-500">{block.notes}</span>
                            )}
                          </Cell>
                          <Cell label="Pool">{block.pool_name}</Cell>
                          <Cell label="Deadlines" className="text-xs text-ink-700">
                            Book by {formatDateShort(bookingDeadline(block, agreement))} · released{" "}
                            {formatDateShort(releaseDeadline(block, agreement))}
                          </Cell>
                          <Cell label="Status">
                            <Badge variant={late ? "warning" : BLOCK_STATE_BADGE[block.state]}>
                              {late ? "Past booking deadline" : BLOCK_STATE_LABEL[block.state]}
                            </Badge>
                            {block.project_id && (
                              <span className="block text-xs text-ink-500">
                                <Link
                                  href={requestHref(block.project_id)}
                                  className="font-semibold text-brand-link hover:underline"
                                >
                                  {block.project_title ?? "A request"}
                                </Link>
                              </span>
                            )}
                            {block.state === "kept" && block.kept_by_name && (
                              <span className="block text-xs text-ink-500">
                                Kept by {block.kept_by_name}
                              </span>
                            )}
                          </Cell>
                          {canKeep && (
                            <Cell stack="aside" className="text-right">
                              {block.project_id === null && block.released_at === null && (
                                <div className="flex flex-wrap justify-end gap-1">
                                  {block.state === "reserved" && (
                                    <form action={keepReservedBlock}>
                                      <input type="hidden" name="partner_id" value={id} />
                                      <input
                                        type="hidden"
                                        name="agreement_id"
                                        value={agreementId}
                                      />
                                      <input type="hidden" name="block_id" value={block.id} />
                                      <Button type="submit" variant="ghost">
                                        Keep
                                      </Button>
                                    </form>
                                  )}
                                  {block.state !== "released" && (
                                    <form action={releaseReservedBlock}>
                                      <input type="hidden" name="partner_id" value={id} />
                                      <input
                                        type="hidden"
                                        name="agreement_id"
                                        value={agreementId}
                                      />
                                      <input type="hidden" name="block_id" value={block.id} />
                                      <Button type="submit" variant="ghost">
                                        Release
                                      </Button>
                                    </form>
                                  )}
                                  {block.state === "released" && (
                                    <form action={keepReservedBlock}>
                                      <input type="hidden" name="partner_id" value={id} />
                                      <input
                                        type="hidden"
                                        name="agreement_id"
                                        value={agreementId}
                                      />
                                      <input type="hidden" name="block_id" value={block.id} />
                                      <Button type="submit" variant="ghost">
                                        Keep after all
                                      </Button>
                                    </form>
                                  )}
                                  <form action={deleteReservedBlock}>
                                    <input type="hidden" name="partner_id" value={id} />
                                    <input type="hidden" name="agreement_id" value={agreementId} />
                                    <input type="hidden" name="block_id" value={block.id} />
                                    <Button type="submit" variant="ghost" className="text-ink-500">
                                      Remove
                                    </Button>
                                  </form>
                                </div>
                              )}
                            </Cell>
                          )}
                        </Row>
                      );
                    })}
                  </tbody>
                </Table>
              </TableFrame>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-bold text-ink-900">Requests under this agreement</h3>
              <span className="text-xs text-ink-500">
                Put a request under the agreement from its own page; it is then priced against the
                reserve share and may take a reserved block.
              </span>
            </div>
            {detail.projects.length === 0 ? (
              <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
                None yet.
              </p>
            ) : (
              <TableFrame>
                <Table stack>
                  <thead>
                    <HeaderRow>
                      <Th>Request</Th>
                      <Th>Event</Th>
                      <Th>Rate</Th>
                      <Th>Stage</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {detail.projects.map((project) => (
                      <Row key={project.id}>
                        <Cell stack="title">
                          <Link
                            href={requestHref(project.id)}
                            className="font-semibold text-brand-link hover:underline"
                          >
                            {project.title}
                          </Link>
                        </Cell>
                        <Cell label="Event">
                          {project.event_starts_on ? formatDateShort(project.event_starts_on) : "—"}
                        </Cell>
                        <Cell label="Rate">
                          {project.priced_as ? PRODUCTION_RATE_LABEL[project.priced_as] : "—"}
                        </Cell>
                        <Cell stack="aside">
                          {project.disposition ? (
                            <Badge variant={DISPOSITION_BADGE[project.disposition]}>
                              {DISPOSITION_LABEL[project.disposition]}
                            </Badge>
                          ) : (
                            <Badge variant="accent">{STAGE_LABEL[project.stage]}</Badge>
                          )}
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            )}
          </Card>

          {detail.packages.length > 0 && (
            <section className="flex flex-col gap-2 rounded border border-line bg-panel-50 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">
                Bespoke packages
              </h3>
              <p className="text-sm text-ink-700">
                Offered only to requests under this agreement:{" "}
                {detail.packages
                  .map(
                    (p) =>
                      `${p.name} (${p.unit_label}${p.version_label ? `, ${p.version_label}` : ""})`,
                  )
                  .join("; ")}
                . Finance scopes a package to an agreement on the{" "}
                <Link
                  href={ratesHref("packages")}
                  className="font-bold text-brand-link hover:underline"
                >
                  Rates tab
                </Link>
                .
              </p>
            </section>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          {(agreement.status === "draft" || (agreement.status === "active" && canKeep)) && (
            <Card>
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                {agreement.status === "draft" ? "Approval" : "Status"}
              </div>
              <div className="flex flex-col gap-3 px-5 py-4 text-sm text-ink-700">
                {agreement.status === "draft" && (
                  <>
                    <p>
                      A draft reserves nothing and prices nothing until the Executive Director
                      approves it.
                    </p>
                    {context.isExecutive ? (
                      <form action={approveAgreement} className="flex flex-col gap-1">
                        <input type="hidden" name="partner_id" value={id} />
                        <input type="hidden" name="agreement_id" value={agreementId} />
                        <Button type="submit">Approve the agreement</Button>
                        {(draw.reserveOverdrawn || draw.airtimeOverdrawn) && (
                          <span className="text-xs text-warning-fg">
                            The draw above exceeds what the term has left; approving records the
                            commitment anyway.
                          </span>
                        )}
                      </form>
                    ) : (
                      <p className="text-xs text-ink-500">Only the Executive Director approves.</p>
                    )}
                    {canEdit && (
                      <form action={deleteAgreement}>
                        <input type="hidden" name="partner_id" value={id} />
                        <input type="hidden" name="agreement_id" value={agreementId} />
                        <Button type="submit" variant="ghost" className="text-ink-500">
                          Delete this draft
                        </Button>
                      </form>
                    )}
                  </>
                )}
                {agreement.status === "active" && canKeep && (
                  <form action={endAgreement} className="flex flex-col gap-1">
                    <input type="hidden" name="partner_id" value={id} />
                    <input type="hidden" name="agreement_id" value={agreementId} />
                    <Button type="submit" variant="secondary">
                      End the agreement
                    </Button>
                    <span className="text-xs text-ink-500">
                      Its blocks stop reserving windows and no new request is priced under it;
                      {openProjects.length > 0
                        ? ` ${openProjects.length} open request${openProjects.length === 1 ? "" : "s"} keep${openProjects.length === 1 ? "s" : ""} the pricing already recorded.`
                        : " nothing is open under it now."}
                    </span>
                  </form>
                )}
              </div>
            </Card>
          )}

          <DetailSummary
            title="Terms"
            editHref={
              canEdit && agreement.status !== "ended"
                ? agreementEditHref(id, agreementId)
                : undefined
            }
            items={[
              { label: "Partner", value: partner.name },
              {
                label: "Dates",
                value: `${formatDateShort(agreement.starts_on)} – ${formatDateShort(agreement.ends_on)}`,
              },
              { label: "Reserve", value: formatHours(Number(agreement.reserve_hours_allocated)) },
              { label: "Students", value: formatHours(Number(agreement.funded_student_hours)) },
              {
                label: "Airtime",
                value:
                  agreement.airtime_minutes_per_week > 0
                    ? `${formatMinutes(agreement.airtime_minutes_per_week)} a week`
                    : null,
              },
              { label: "Volume", value: agreement.expected_volume },
              {
                label: "Deadlines",
                value: `Book ${agreement.booking_deadline_days} days before; release ${agreement.release_deadline_days} days before`,
              },
              {
                label: "Direct costs",
                value: agreement.direct_cost_treatment,
                preserveLines: true,
              },
              { label: "Beyond", value: agreement.beyond_envelope_note, preserveLines: true },
              { label: "Blackouts", value: agreement.blackout_notes, preserveLines: true },
              { label: "Capital", value: agreement.capital_notes, preserveLines: true },
              { label: "Notes", value: agreement.notes, preserveLines: true },
            ]}
          />

          <Card>
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              Signed agreement
            </div>
            <div className="px-5 py-4">
              <AgreementDocumentUpload
                agreementId={agreementId}
                existingPath={agreement.document_path}
                canUpload={canEdit && agreement.status !== "ended"}
              />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function GaugeView({
  label,
  gauge,
  format,
  hint,
}: {
  label: string;
  gauge: Gauge;
  format: (value: number) => string;
  hint: string;
}) {
  const over = gauge.remaining < 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</span>
        <span className={`text-xs ${over ? "font-semibold text-[#8F3A3A]" : "text-ink-500"}`}>
          {format(gauge.used)} of {format(gauge.allowed)}
        </span>
      </div>
      <ProgressBar
        label={label}
        done={gauge.allowed > 0 ? Math.min(gauge.used, gauge.allowed) : 0}
        total={gauge.allowed > 0 ? gauge.allowed : 1}
        valueText={`${format(gauge.used)} of ${format(gauge.allowed)}`}
        size="sm"
      />
      <span className="text-[11px] text-ink-500">
        {over
          ? `Over by ${format(-gauge.remaining)}.`
          : gauge.allowed > 0
            ? `${format(gauge.remaining)} left. ${hint}.`
            : `None allowed under the agreement. ${hint}.`}
      </span>
    </div>
  );
}
