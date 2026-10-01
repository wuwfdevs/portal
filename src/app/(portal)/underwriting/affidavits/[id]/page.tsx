import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSummary } from "@/components/ui/detail-summary";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { getAffidavitDetail, getAffidavitMonth } from "@/lib/underwriting/queries";
import { monthOf, signingQueue } from "@/lib/underwriting/affidavit-month";
import { monthLabel } from "@/lib/underwriting/dates";
import { STATION_LETTERHEAD, formatCalendarDate } from "@/lib/underwriting/affidavits";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { certifyAffidavit } from "../../affidavit-actions";
import type { UwAffidavitStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwAffidavitStatus, BadgeVariant> = {
  draft: "neutral",
  certified: "success",
};

/**
 * Workflow G's affidavit page (docs/underwriting-design.md §4, §6): a
 * preview of the client-facing PDF — built from the same AffidavitDocument
 * the PDF renders — plus, for staff only, every recorded outcome behind it.
 * Certifying stores the PDF with the manager's signature and freezes it.
 */
export default async function AffidavitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; signing?: string }>;
}) {
  const { id } = await params;
  const { error, signing } = await searchParams;
  const [{ isManager, profile }, affidavit] = await Promise.all([
    requireUnderwritingAccess(),
    getAffidavitDetail(id),
  ]);
  if (!affidavit) notFound();

  // Working through a month's signatures: where this one sits in the
  // month's queue, so Previous / Skip / "Sign and open next" can move on.
  const month = monthOf(affidavit.campaign_period_end);
  const monthHref = `/underwriting/affidavits?month=${month}`;
  const queue =
    signing && isManager && affidavit.status === "draft"
      ? signingQueue((await getAffidavitMonth(month)).rows)
      : [];
  const position = queue.indexOf(affidavit.id);
  const previousId = position > 0 ? queue[position - 1] : undefined;
  const nextId = position >= 0 && position < queue.length - 1 ? queue[position + 1] : undefined;

  const doc = affidavit.document;
  const certified = affidavit.status === "certified";
  const pdfHref = `/api/underwriting/affidavits/${affidavit.id}/pdf`;
  const showLength = doc.rows.some((row) => row.length !== null);
  // What a signer checks first (docs/underwriting-traffic-redesign.md §17):
  // aired against ordered, makegoods, and anything still open in the period.
  const orderedCount = doc.summary
    .filter((row) => !row.bonus)
    .reduce((sum, row) => sum + row.ordered, 0);
  const makegoodCount = doc.rows.filter((row) => row.note?.startsWith("Makegood")).length;
  const openExceptionCount = new Set(
    affidavit.lineItems.flatMap(({ exception }) =>
      exception && exception.resolution_status === "open" ? [exception.id] : [],
    ),
  ).size;
  // In the signing view the log is folded after its first rows; the summary
  // above is what a signer reads, the full log is one click away.
  const LOG_PREVIEW_ROWS = 5;
  const foldLog = signing !== undefined && !certified && doc.rows.length > LOG_PREVIEW_ROWS + 2;
  const logHead = foldLog ? doc.rows.slice(0, LOG_PREVIEW_ROWS) : doc.rows;
  const logRest = foldLog ? doc.rows.slice(LOG_PREVIEW_ROWS) : [];
  const logTable = (rows: typeof doc.rows) => (
    <TableFrame>
      <Table>
        <thead>
          <HeaderRow>
            <Th>Date</Th>
            <Th>Time</Th>
            <Th>Program</Th>
            <Th>Message</Th>
            {showLength && <Th>Length</Th>}
            <Th>Note</Th>
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.broadcastEventId}>
              <Cell className="whitespace-nowrap text-ink-700">{row.date}</Cell>
              <Cell className="whitespace-nowrap text-ink-700">{row.time}</Cell>
              <Cell className="text-ink-700">{row.program}</Cell>
              <Cell className="text-ink-700">{row.message ?? "—"}</Cell>
              {showLength && <Cell className="text-ink-700">{row.length ?? ""}</Cell>}
              <Cell className="text-brand-link">{row.note ?? ""}</Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={monthHref} className="text-xs font-semibold text-brand-link">
          ← {monthLabel(`${month}-01`)}
        </Link>
        {position >= 0 && (
          <nav aria-label="Affidavits to sign" className="flex items-center gap-2 text-sm">
            <span className="text-ink-500">
              {position + 1} of {queue.length} to sign
            </span>
            {previousId && (
              <Link
                href={`/underwriting/affidavits/${previousId}?signing=1`}
                className="rounded border border-line px-3 py-1.5 text-xs font-semibold text-brand-link hover:bg-panel-50"
              >
                ‹ Previous
              </Link>
            )}
            {nextId && (
              <Link
                href={`/underwriting/affidavits/${nextId}?signing=1`}
                className="rounded border border-line px-3 py-1.5 text-xs font-semibold text-brand-link hover:bg-panel-50"
              >
                Skip ›
              </Link>
            )}
          </nav>
        )}
        <a href={pdfHref} target="_blank" rel="noopener">
          <Button type="button" variant={certified ? "primary" : "secondary"}>
            {certified ? "Download PDF" : "Preview draft PDF"}
          </Button>
        </a>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {!certified && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Aired", value: doc.airedCount, warn: false },
                {
                  label: "Ordered this period",
                  value: orderedCount,
                  warn: doc.airedCount < orderedCount,
                },
                { label: "Makegoods aired", value: makegoodCount, warn: false },
                {
                  label: "Exceptions open",
                  value: openExceptionCount,
                  warn: openExceptionCount > 0,
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded border border-line bg-white px-4 py-3">
                  <dt className="text-xs text-ink-500">{stat.label}</dt>
                  <dd
                    className={
                      stat.warn
                        ? "text-2xl font-bold tabular-nums text-warning-fg"
                        : "text-2xl font-bold tabular-nums text-ink-900"
                    }
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <article className="rounded border border-line bg-white p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
              <div className="text-sm">
                <div className="font-bold text-ink-900">{STATION_LETTERHEAD.name}</div>
                {STATION_LETTERHEAD.addressLines.map((line) => (
                  <div key={line} className="text-ink-500">
                    {line}
                  </div>
                ))}
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <h2 className="font-serif text-xl font-bold text-brand-link">
                    Performance Affidavit
                  </h2>
                  <Badge variant={STATUS_VARIANT[affidavit.status]}>{affidavit.status}</Badge>
                </div>
                <div className="text-xs text-ink-500">Report {affidavit.report_identifier}</div>
              </div>
            </header>

            <div className="grid gap-6 py-5 text-sm sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                  Prepared for
                </div>
                {doc.recipientLines.map((line, index) => (
                  <div
                    key={`${index}-${line}`}
                    className={index === 0 ? "font-bold text-ink-900" : "text-ink-700"}
                  >
                    {line}
                  </div>
                ))}
                {doc.recipientLines.length === 1 && (
                  <Link
                    href={`/underwriting/underwriters/${affidavit.contract.underwriter.id}/edit`}
                    className="mt-1 inline-block text-xs font-semibold text-brand-link"
                  >
                    Add a mailing address
                  </Link>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-ink-500">Order number</dt>
                <dd className="text-ink-900">
                  {orderNumberLabel(affidavit.contract.contract_identifier)}
                </dd>
                <dt className="text-ink-500">Period</dt>
                <dd className="text-ink-900">{doc.periodLabel}</dd>
                <dt className="text-ink-500">Account rep</dt>
                <dd className="text-ink-900">
                  {affidavit.contract.account_rep ?? (
                    <Link
                      href={`/underwriting/contracts/${affidavit.contract.id}/order`}
                      className="text-xs font-semibold text-brand-link"
                    >
                      Add on the order
                    </Link>
                  )}
                </dd>
                {doc.lengthLabel && (
                  <>
                    <dt className="text-ink-500">Announcements</dt>
                    <dd className="text-ink-900">{doc.lengthLabel}</dd>
                  </>
                )}
              </dl>
            </div>

            {doc.summary.length > 0 && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-ink-900">Delivery</h3>
                <TableFrame>
                  <Table>
                    <thead>
                      <HeaderRow>
                        <Th>Schedule</Th>
                        <Th className="text-right">Ordered</Th>
                        <Th className="text-right">Aired</Th>
                      </HeaderRow>
                    </thead>
                    <tbody>
                      {doc.summary.map((row) => (
                        <Row key={row.scheduleLineId}>
                          <Cell className="text-ink-700">
                            {row.label}
                            {row.bonus ? " (bonus)" : ""}
                          </Cell>
                          <Cell className="text-right text-ink-700">{row.ordered}</Cell>
                          <Cell
                            className={
                              !row.bonus && row.aired < row.ordered
                                ? "text-right font-bold text-warning-fg"
                                : "text-right text-ink-700"
                            }
                          >
                            {row.aired}
                          </Cell>
                        </Row>
                      ))}
                    </tbody>
                  </Table>
                </TableFrame>
                {doc.outsideSummaryCount > 0 && (
                  <p className="mt-2 text-xs text-ink-500">
                    {doc.outsideSummaryCount === 1
                      ? "1 further announcement below counts toward a schedule period that extends beyond these dates."
                      : `${doc.outsideSummaryCount} further announcements below count toward schedule periods that extend beyond these dates.`}
                  </p>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-bold text-ink-900">Broadcast log</h3>
              {doc.rows.length === 0 ? (
                <p className="text-sm text-ink-500">No announcements aired in this period.</p>
              ) : (
                <>
                  {logTable(logHead)}
                  {logRest.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-brand-link">
                        {logRest.length} more
                      </summary>
                      <div className="mt-2">{logTable(logRest)}</div>
                    </details>
                  )}
                </>
              )}
            </section>

            <section className="mt-6 border-t border-line pt-5 text-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                Affidavit of performance
              </div>
              <p className="text-ink-900">
                {certified ? affidavit.certification_text : doc.certificationSentence}
              </p>
              {certified && (
                <p className="mt-3 text-ink-700">
                  <span className="italic">/s/ {affidavit.certifyingStaffName ?? "—"}</span>
                  {affidavit.certifying_staff_title ? `, ${affidavit.certifying_staff_title}` : ""}
                  {affidavit.certified_at
                    ? ` · ${formatStationTimestamp(affidavit.certified_at)}`
                    : ""}
                </p>
              )}
            </section>
          </article>

          {affidavit.lineItems.length > 0 && (
            <section className="rounded border border-line">
              <div className="border-b border-line px-5 py-3.5">
                <div className="text-sm font-bold text-ink-900">Every recorded outcome</div>
                <p className="text-xs text-ink-500">
                  Staff only — not on the affidavit. Misses, moves and exceptions behind this
                  period.
                </p>
              </div>
              <TableFrame className="rounded-none border-0">
                <Table>
                  <thead>
                    <HeaderRow>
                      <Th>Scheduled</Th>
                      <Th>Program</Th>
                      <Th>Outcome</Th>
                      <Th>Compliance</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {affidavit.lineItems.map(
                      ({ lineItem, broadcastEvent, placement, exception }) => (
                        <Row key={`${lineItem.affidavit_id}-${lineItem.log_broadcast_event_id}`}>
                          <Cell className="whitespace-nowrap text-ink-700">
                            {formatStationTimestamp(placement.scheduled_at)}
                          </Cell>
                          <Cell className="text-ink-700">
                            {placement.program_name}
                            {placement.break_label ? ` (${placement.break_label})` : ""}
                          </Cell>
                          <Cell className="text-ink-700">
                            {broadcastEvent.outcome.replace(/_/g, " ")}
                          </Cell>
                          <Cell className="text-ink-700">
                            {exception ? (
                              <Link
                                href={`/underwriting/exceptions/${exception.id}`}
                                className="text-brand-link"
                              >
                                {exception.compliance_judgment}
                              </Link>
                            ) : (
                              "compliant"
                            )}
                          </Cell>
                        </Row>
                      ),
                    )}
                  </tbody>
                </Table>
              </TableFrame>
            </section>
          )}
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">
          {certified ? (
            <DetailSummary
              title="Signed"
              items={[
                { label: "By", value: affidavit.certifyingStaffName },
                { label: "Title", value: affidavit.certifying_staff_title },
                {
                  label: "On",
                  value: affidavit.certified_at
                    ? formatStationTimestamp(affidavit.certified_at)
                    : null,
                },
                {
                  label: "SHA-256",
                  value: affidavit.certified_document_sha256 ? (
                    <span className="break-all font-mono text-xs">
                      {affidavit.certified_document_sha256.slice(0, 16)}…
                    </span>
                  ) : null,
                },
              ]}
            />
          ) : (
            <div className="rounded border border-line bg-white">
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                Sign
              </div>
              {isManager ? (
                <form action={certifyAffidavit} className="flex flex-col gap-3 p-5">
                  <input type="hidden" name="affidavit_id" value={affidavit.id} />
                  <div>
                    <Label htmlFor="certifying_staff_title">Your title</Label>
                    <Input
                      id="certifying_staff_title"
                      name="certifying_staff_title"
                      defaultValue={profile.title ?? ""}
                      required
                    />
                    <FieldHint>
                      {profile.title
                        ? "From your profile. A change here applies to this affidavit only."
                        : "Your profile has no title yet — an administrator can add one under Admin › Users."}
                    </FieldHint>
                  </div>
                  <FieldHint>
                    Your name, this title and today&apos;s date print on the signature line. The PDF
                    is then stored as signed and can&apos;t be changed — a correction is a new
                    affidavit.
                  </FieldHint>
                  {position >= 0 ? (
                    <>
                      <Button type="submit" name="then" value="next">
                        {nextId ? "Sign and open next" : "Sign and finish"}
                      </Button>
                      <Button type="submit" variant="secondary">
                        Sign
                      </Button>
                    </>
                  ) : (
                    <Button type="submit">Sign and store PDF</Button>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold text-brand-link">
                      Something&apos;s wrong with this one
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-ink-500">
                      Skip it and tell whoever generated it. Generating it again from the month list
                      picks up any corrected log entries; the earlier draft stays listed as its
                      earlier version.
                    </p>
                  </details>
                </form>
              ) : (
                <p className="p-5 text-sm text-ink-500">
                  An underwriting manager signs this affidavit. Until then its PDF is marked as a
                  draft.
                </p>
              )}
            </div>
          )}
          <DetailSummary
            title="Generated"
            items={[
              { label: "On", value: formatStationTimestamp(affidavit.generated_at) },
              {
                label: "Covers",
                value: `${formatCalendarDate(affidavit.campaign_period_start)} – ${formatCalendarDate(affidavit.campaign_period_end)}`,
              },
              { label: "Aired", value: String(doc.airedCount) },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
