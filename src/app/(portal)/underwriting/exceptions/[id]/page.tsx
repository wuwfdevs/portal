import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Label, Select, Textarea } from "@/components/ui/input";
import { getExceptionDetail } from "@/lib/underwriting/queries";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import { resolveException } from "../../exception-actions";
import type { UwResolutionStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwResolutionStatus, BadgeVariant> = {
  open: "warning",
  resolved: "success",
};

export default async function ExceptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const exception = await getExceptionDetail(id);
  if (!exception) notFound();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/exceptions" className="text-xs font-semibold text-brand-link">
          ← Back to exceptions
        </Link>
        <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">{exception.contract.underwriter_name}</h2>
          <Badge variant={STATUS_VARIANT[exception.resolution_status]}>{exception.resolution_status}</Badge>
        </div>
        <p className="mb-4 text-xs text-ink-500">
          <Link href={`/underwriting/contracts/${exception.contract.id}`} className="font-semibold text-brand-link">
            {exception.contract.contract_identifier}
          </Link>{" "}
          · {exception.obligation.description}
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">What happened</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-400">Originally scheduled</dt>
              <dd className="text-ink-900">{formatPlacementTime(exception.original_scheduled_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Outcome</dt>
              <dd className="text-ink-900">{exception.host_action.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Host reason</dt>
              <dd className="text-ink-900">{exception.host_reason?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
            {exception.placement && (
              <>
                <div>
                  <dt className="text-xs text-ink-400">Program</dt>
                  <dd className="text-ink-900">{exception.placement.program_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Slot</dt>
                  <dd className="text-ink-900">{exception.placement.clock_slot_label ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Placement status</dt>
                  <dd className="text-ink-900">{exception.placement.status}</dd>
                </div>
              </>
            )}
            {exception.broadcastEvent?.notes && (
              <div className="col-span-full">
                <dt className="text-xs text-ink-400">Host notes</dt>
                <dd className="text-ink-900">{exception.broadcastEvent.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-96">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Resolution</div>
        <form action={resolveException} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="exception_id" value={exception.id} />
          <div>
            <Label htmlFor="compliance_judgment">Compliance judgment</Label>
            <Select id="compliance_judgment" name="compliance_judgment" defaultValue={exception.compliance_judgment}>
              <option value="pending">Pending</option>
              <option value="compliant">Compliant</option>
              <option value="noncompliant">Noncompliant</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="recommended_action">Recommended action</Label>
            <Textarea
              id="recommended_action"
              name="recommended_action"
              rows={2}
              defaultValue={exception.recommended_action ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="resolution_action">Resolution action</Label>
            <Select id="resolution_action" name="resolution_action" defaultValue={exception.resolution_action ?? ""}>
              <option value="">Not yet decided</option>
              <option value="accept_alternate">Accept alternate airing</option>
              <option value="schedule_makegood">Schedule a makegood</option>
              <option value="reassign">Reassign the obligation</option>
              <option value="waive">Waive</option>
              <option value="clarification_requested">Request clarification</option>
              <option value="corrected">Correct the record</option>
              <option value="closed">Close, no action</option>
            </Select>
            <FieldHint>Waiving requires a manager — anyone else&apos;s attempt is rejected.</FieldHint>
          </div>
          <div>
            <Label htmlFor="resolution_notes">Notes</Label>
            <Textarea id="resolution_notes" name="resolution_notes" rows={3} defaultValue={exception.resolution_notes ?? ""} />
          </div>
          <div>
            <Label htmlFor="resolution_status">Status</Label>
            <Select id="resolution_status" name="resolution_status" defaultValue={exception.resolution_status}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </Select>
          </div>
          <Button type="submit">Save</Button>
        </form>
      </div>
    </div>
  );
}
