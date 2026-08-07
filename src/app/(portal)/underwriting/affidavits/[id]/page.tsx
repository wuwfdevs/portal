import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { getAffidavitDetail } from "@/lib/underwriting/queries";
import { summarizeAffidavitLineItems } from "@/lib/underwriting/affidavits";
import { certifyAffidavit } from "../../affidavit-actions";
import { PrintButton } from "../print-button";
import type { UwAffidavitStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwAffidavitStatus, BadgeVariant> = {
  draft: "neutral",
  certified: "success",
};

export default async function AffidavitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const affidavit = await getAffidavitDetail(id);
  if (!affidavit) notFound();

  const summary = summarizeAffidavitLineItems(affidavit.lineItems.map(({ broadcastEvent }) => broadcastEvent));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link href="/underwriting/affidavits" className="text-xs font-semibold text-brand-link">
            ← Back to affidavits
          </Link>
        </div>
        <PrintButton />
      </div>

      {error && <Alert className="print:hidden">{error}</Alert>}

      <div className="rounded border border-line p-6">
        <div className="mb-1 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">Underwriting affidavit</h2>
          <Badge variant={STATUS_VARIANT[affidavit.status]}>{affidavit.status}</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-400">Report #</dt>
            <dd className="text-ink-900">{affidavit.report_identifier}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Underwriter</dt>
            <dd className="text-ink-900">
              <Link href={`/underwriting/contracts/${affidavit.contract.id}`} className="text-brand-link">
                {affidavit.contract.underwriter.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Contract #</dt>
            <dd className="text-ink-900">{affidavit.contract.contract_identifier}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Campaign period</dt>
            <dd className="text-ink-900">
              {affidavit.campaign_period_start} – {affidavit.campaign_period_end}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Generated</dt>
            <dd className="text-ink-900">
              {new Date(affidavit.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Line items</dt>
            <dd className="text-ink-900">
              {summary.totalLineItems} ({summary.airedAsScheduled} aired as scheduled, {summary.otherOutcomes} other)
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Evidence</div>
        {affidavit.lineItems.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">
            No broadcast events found for this contract in this period.
          </p>
        ) : (
          <TableFrame className="rounded-none border-0">
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Scheduled</Th>
                  <Th>Program</Th>
                  <Th>Outcome</Th>
                  <Th>Actual duration</Th>
                  <Th>Compliance</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {affidavit.lineItems.map(({ lineItem, broadcastEvent, placement, exception }) => (
                  <Row key={`${lineItem.affidavit_id}-${lineItem.log_broadcast_event_id}`}>
                    <Cell className="whitespace-nowrap text-ink-700">
                      {new Date(placement.scheduled_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Cell>
                    <Cell className="text-ink-700">
                      {placement.program_name}
                      {placement.break_label ? ` (${placement.break_label})` : ""}
                    </Cell>
                    <Cell className="text-ink-700">{broadcastEvent.outcome.replace(/_/g, " ")}</Cell>
                    <Cell className="text-ink-700">
                      {broadcastEvent.actual_duration_seconds ? `${broadcastEvent.actual_duration_seconds}s` : "—"}
                    </Cell>
                    <Cell className="text-ink-700">
                      {exception ? (
                        <Link href={`/underwriting/exceptions/${exception.id}`} className="text-brand-link">
                          {exception.compliance_judgment}
                        </Link>
                      ) : (
                        "compliant"
                      )}
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </div>

      <div className="rounded border border-line p-5 print:hidden">
        <div className="mb-3 text-sm font-bold text-ink-900">Certification</div>
        {affidavit.status === "certified" ? (
          <div className="text-sm text-ink-700">
            <p>{affidavit.certification_text}</p>
            <p className="mt-2 text-xs text-ink-400">Certified by {affidavit.certifyingStaffName ?? "a manager"}</p>
          </div>
        ) : (
          <form action={certifyAffidavit} className="flex flex-col gap-4">
            <input type="hidden" name="affidavit_id" value={affidavit.id} />
            <div>
              <Label htmlFor="certification_text">Certification language</Label>
              <Textarea
                id="certification_text"
                name="certification_text"
                rows={3}
                placeholder="I certify that the above accurately reflects this contract's broadcast history for this period."
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Certify</Button>
            </div>
            <p className="text-xs text-ink-400">Only an underwriting manager&apos;s certification is honored.</p>
          </form>
        )}
      </div>

      {affidavit.status === "certified" && (
        <div className="hidden text-sm text-ink-700 print:block">
          <p className="font-bold">Certification</p>
          <p>{affidavit.certification_text}</p>
        </div>
      )}
    </div>
  );
}
