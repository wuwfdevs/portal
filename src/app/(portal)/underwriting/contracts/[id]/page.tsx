import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  getContractDetail,
  getContractFulfillment,
  listCopy,
  listNearbyPlacementsForAdjacency,
  listScheduleLinePlacementContexts,
} from "@/lib/underwriting/queries";
import { formatPlacementTime, listProgramOptions } from "@/lib/underwriting/placement";
import { describeScheduleLineRecurrence, expectedOccurrenceCount } from "@/lib/underwriting/schedule-lines";
import { checkCompetitiveAdjacency } from "@/lib/underwriting/adjacency";
import { FULFILLMENT_STATUS_LABEL } from "@/lib/underwriting/fulfillment";
import {
  addScheduleLine,
  linkCopyToContract,
  setContractStatus,
  unlinkCopyFromContract,
} from "../../contract-actions";
import { createCopy } from "../../copy-actions";
import { clearCreditAction, placeCreditAction } from "../../placement-actions";
import { ContractDocumentUpload } from "../../contract-document-upload";
import type { UwContractStatus, UwPlacementStatus } from "@/lib/database.types";

const CONTRACT_STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

const PLACEMENT_STATUS_VARIANT: Record<UwPlacementStatus, BadgeVariant> = {
  scheduled: "success",
  locked: "accent",
  conflict: "danger",
  superseded: "muted",
};

const FULFILLMENT_VARIANT: Record<string, BadgeVariant> = {
  no_target: "neutral",
  on_track: "accent",
  behind: "danger",
  fulfilled: "success",
};

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();

  const [allCopy, programs, fulfillment, lineContexts] = await Promise.all([
    listCopy(),
    listProgramOptions(),
    getContractFulfillment(contract.id, contract.scheduleLines),
    listScheduleLinePlacementContexts(contract.scheduleLines),
  ]);
  const linkedCopyIds = new Set(contract.copy.map((item) => item.id));
  const linkableCopy = allCopy.filter((item) => !linkedCopyIds.has(item.id));
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));

  const adjacencyByLine = new Map<string, Awaited<ReturnType<typeof listNearbyPlacementsForAdjacency>>>();
  for (const line of contract.scheduleLines) {
    if (!line.program_id) continue;
    adjacencyByLine.set(line.id, await listNearbyPlacementsForAdjacency(line.program_id, contract.id));
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/contracts" className="text-xs font-semibold text-brand-link">
          ← Back to contracts
        </Link>
        <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">
            <Link href={`/underwriting/underwriters/${contract.underwriter.id}`} className="hover:underline">
              {contract.underwriter.name}
            </Link>
          </h2>
          <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
          <Badge variant={FULFILLMENT_VARIANT[fulfillment.status]}>
            {FULFILLMENT_STATUS_LABEL[fulfillment.status]}
            {fulfillment.expectedOccurrences != null && ` · ${fulfillment.completedCount}/${fulfillment.expectedOccurrences}`}
          </Badge>
        </div>
        <p className="mb-4 text-xs text-ink-500">
          {contract.contract_identifier} · {contract.effective_from}
          {contract.effective_to ? ` – ${contract.effective_to}` : ""}
          {contract.sponsorship_category ? ` · ${contract.sponsorship_category}` : ""}
          {contract.sponsorship_total != null ? ` · $${contract.sponsorship_total.toLocaleString()}` : ""}
          {" · "}
          Affidavit {contract.affidavit_required ? "required" : "not required"}
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}
        {contract.notes && <p className="mb-4 text-sm text-ink-700">{contract.notes}</p>}
        {contract.preemption_policy && (
          <p className="mb-4 text-xs text-ink-500">Preemption policy: {contract.preemption_policy}</p>
        )}

        <div className="mb-6 rounded border border-line p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Executed agreement</div>
          <ContractDocumentUpload contractId={contract.id} existingPath={contract.agreement_document_path} />
        </div>

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Contract schedule lines
          </div>
          {contract.scheduleLines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No schedule lines yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {lineContexts.map(({ scheduleLine, placements, placeable }) => {
                const expected = expectedOccurrenceCount(scheduleLine);
                const nearby = adjacencyByLine.get(scheduleLine.id) ?? [];
                const adjacency = checkCompetitiveAdjacency(
                  { underwriterId: contract.underwriter.id, category: contract.underwriter.category },
                  nearby,
                );
                return (
                  <li key={scheduleLine.id} className="flex flex-col gap-2 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-ink-900">
                        {describeScheduleLineRecurrence(scheduleLine)}
                      </span>
                      <span className="text-ink-500">· {scheduleLine.duration_seconds}s</span>
                      {scheduleLine.program_id && (
                        <Badge variant="accent">{programNameById.get(scheduleLine.program_id) ?? "Unknown program"}</Badge>
                      )}
                      <span className="text-xs text-ink-400">
                        {expected != null ? `${expected} expected` : "open-ended"}
                      </span>
                    </div>
                    <p className="text-xs text-ink-400">
                      {scheduleLine.start_date}
                      {scheduleLine.end_date ? ` – ${scheduleLine.end_date}` : " (ongoing)"}
                    </p>
                    {scheduleLine.makegood_policy && (
                      <p className="text-xs text-ink-400">Makegood: {scheduleLine.makegood_policy}</p>
                    )}

                    {placements.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-1.5 rounded border border-dashed border-line p-2.5">
                        {placements.map((placement) => (
                          <li key={placement.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant={PLACEMENT_STATUS_VARIANT[placement.status]}>{placement.status}</Badge>
                            <span className="text-ink-700">
                              {placement.program_name} — {formatPlacementTime(placement.scheduled_at)}
                              {placement.break_label ? ` (${placement.break_label})` : ""}
                            </span>
                            {placement.override_reason && (
                              <span className="text-warning-fg">override: {placement.override_reason}</span>
                            )}
                            <form action={clearCreditAction}>
                              <input type="hidden" name="contract_id" value={contract.id} />
                              <input type="hidden" name="placement_id" value={placement.id} />
                              <Button type="submit" variant="ghost">
                                Clear
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}

                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                        Place a credit
                      </summary>
                      {contract.copy.length === 0 ? (
                        <p className="mt-2 text-xs text-ink-500">
                          Create or link copy to this contract first — see &quot;Copy&quot; below.
                        </p>
                      ) : !placeable.ok ? (
                        <p className="mt-2 text-xs text-danger">{placeable.message}</p>
                      ) : placeable.breaks.length === 0 ? (
                        <p className="mt-2 text-xs text-ink-500">
                          No eligible open breaks right now — a rundown must exist for an eligible program
                          first.
                        </p>
                      ) : (
                        <form
                          action={placeCreditAction}
                          className="mt-2 flex flex-col gap-3 rounded border border-line p-3"
                        >
                          <input type="hidden" name="contract_id" value={contract.id} />
                          <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
                          {adjacency.warning && (
                            <Alert variant="note">
                              Another underwriter in {contract.underwriter.category} already has a placement on
                              this program — consider spacing these out. Advisory only, not a block.
                            </Alert>
                          )}
                          <div>
                            <Label htmlFor={`break_${scheduleLine.id}`}>Open break</Label>
                            <Select id={`break_${scheduleLine.id}`} name="break_id" defaultValue="">
                              <option value="" disabled>
                                Choose a break…
                              </option>
                              {placeable.breaks.map((brk) => (
                                <option key={brk.break_id} value={brk.break_id}>
                                  {brk.program_name} — {formatPlacementTime(brk.scheduled_at)} ({brk.label}) ·{" "}
                                  {brk.remaining_seconds}s remaining
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`copy_${scheduleLine.id}`}>Copy</Label>
                            <Select id={`copy_${scheduleLine.id}`} name="copy_id" defaultValue="">
                              <option value="" disabled>
                                Choose copy…
                              </option>
                              {contract.copy.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label} ({item.approval_status})
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`override_${scheduleLine.id}`}>Override reason</Label>
                            <Input id={`override_${scheduleLine.id}`} name="override_reason" />
                            <FieldHint>
                              Only needed if the copy isn&apos;t approved or is outside its effective dates —
                              and only a manager&apos;s override is actually honored.
                            </FieldHint>
                          </div>
                          <div className="flex justify-end">
                            <Button type="submit">Place credit</Button>
                          </div>
                        </form>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">
              Add a schedule line
            </summary>
            <form action={addScheduleLine} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <div>
                <Label>Day(s) of week</Label>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-700">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => (
                    <label key={label} className="flex items-center gap-1.5">
                      <input type="checkbox" name="days_of_week" value={index} className="h-4 w-4" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="target_time">Target air time</Label>
                  <Input id="target_time" name="target_time" type="time" />
                </div>
                <div>
                  <Label htmlFor="duration_seconds">Duration (s)</Label>
                  <Input id="duration_seconds" name="duration_seconds" type="number" required min={1} />
                </div>
                <div>
                  <Label htmlFor="program_id">Program</Label>
                  <Select id="program_id" name="program_id" defaultValue="">
                    <option value="">Any program</option>
                    {programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex gap-3">
                <div>
                  <Label htmlFor="start_date">Start date</Label>
                  <Input id="start_date" name="start_date" type="date" required />
                </div>
                <div>
                  <Label htmlFor="end_date">End date</Label>
                  <Input id="end_date" name="end_date" type="date" />
                </div>
              </div>
              <div>
                <Label htmlFor="occurrence_count_override">Expected occurrences override</Label>
                <Input id="occurrence_count_override" name="occurrence_count_override" type="number" min={1} />
                <FieldHint>
                  Only for a looser obligation (e.g. &quot;12 credits a month&quot;) that doesn&apos;t fit clean
                  day-of-week math. Leave blank to compute from days/dates above.
                </FieldHint>
              </div>
              <div>
                <Label htmlFor="makegood_policy">Makegood policy (if different from the contract&apos;s)</Label>
                <Input id="makegood_policy" name="makegood_policy" />
              </div>
              <div>
                <Label htmlFor="line_notes">Notes</Label>
                <Input id="line_notes" name="notes" />
              </div>
              <div className="flex justify-end">
                <Button type="submit">Add schedule line</Button>
              </div>
            </form>
          </details>
        </div>

        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Copy</div>
          {contract.copy.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No copy yet — create the first message below.</p>
          ) : (
            <ul className="divide-y divide-line">
              {contract.copy.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/underwriting/copy/${item.id}`} className="font-semibold text-brand-link">
                    {item.label}
                  </Link>
                  <span className="text-xs text-ink-400">
                    {item.execution_kind} · {item.approval_status}
                  </span>
                  <form action={unlinkCopyFromContract}>
                    <input type="hidden" name="contract_id" value={contract.id} />
                    <input type="hidden" name="copy_id" value={item.id} />
                    <Button type="submit" variant="ghost">
                      Unlink
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">
              Create a new message for this contract
            </summary>
            <form action={createCopy} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="label">Label</Label>
                  <Input id="label" name="label" required maxLength={80} placeholder="Message A" />
                </div>
                <div>
                  <Label htmlFor="execution_kind">Execution</Label>
                  <Select id="execution_kind" name="execution_kind" defaultValue="live_read">
                    <option value="live_read">Live read</option>
                    <option value="recorded">Recorded (via DAD)</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="script">Script</Label>
                <Textarea id="script" name="script" rows={3} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="duration_seconds_copy">Duration (s)</Label>
                  <Input id="duration_seconds_copy" name="duration_seconds" type="number" min={1} />
                </div>
                <div>
                  <Label htmlFor="cart_identifier">DAD cart #</Label>
                  <Input id="cart_identifier" name="cart_identifier" />
                </div>
                <div>
                  <Label htmlFor="effective_from_copy">Effective from</Label>
                  <Input id="effective_from_copy" name="effective_from" type="date" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Create and link</Button>
              </div>
            </form>
          </details>
          {linkableCopy.length > 0 && (
            <form action={linkCopyToContract} className="flex items-center gap-2 border-t border-line px-5 py-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <Select name="copy_id" defaultValue="" className="max-w-[220px]">
                <option value="" disabled>
                  Or link existing copy…
                </option>
                {linkableCopy.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Link
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-72">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Status</div>
        <form action={setContractStatus} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="contract_id" value={contract.id} />
          <Select name="status" defaultValue={contract.status}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </Select>
          <Button type="submit">Update status</Button>
        </form>
      </div>
    </div>
  );
}

