import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceCards, type ChoiceCardOption } from "@/components/ui/choice-cards";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Steps } from "@/components/ui/steps";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import {
  getExceptionDetail,
  getExceptionMakegoodContext,
  type ExceptionMakegood,
  type UwCopyRow,
} from "@/lib/underwriting/queries";
import { describeScheduleLine } from "@/lib/underwriting/demand";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import { describeMakegoodState, type MakegoodDisplayState } from "@/lib/underwriting/makegoods";
import {
  EXCEPTION_FILTER_LABEL,
  exceptionStep,
  RESOLUTION_ACTION_LABEL,
  type ExceptionStep,
} from "@/lib/underwriting/exception-filters";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { MakegoodScheduling } from "./makegood-scheduling";
import { recordMakegoodApproval, resolveException } from "../../exception-actions";
import {
  cancelMakegoodAction,
  createMakegood,
  scheduleMakegoodAction,
} from "../../makegood-actions";
import type { UwResolutionAction } from "@/lib/database.types";

const STEP_VARIANT: Record<ExceptionStep, BadgeVariant> = {
  decision: "warning",
  agency: "accent",
  awaiting_break: "warning",
  makegood_scheduled: "accent",
  resolved: "success",
};

const MAKEGOOD_STATE: Record<MakegoodDisplayState, { label: string; variant: BadgeVariant }> = {
  awaiting_slot: { label: "Awaiting a break", variant: "warning" },
  slot_scheduled: { label: "Scheduled", variant: "accent" },
  aired: { label: "Aired", variant: "success" },
  cancelled: { label: "Cancelled", variant: "muted" },
};

const COMMON_DECISIONS: UwResolutionAction[] = [
  "schedule_makegood",
  "accept_alternate",
  "waive",
  "closed",
];
const MORE_DECISIONS: UwResolutionAction[] = ["reassign", "clarification_requested", "corrected"];
const DECISION_DESCRIPTION: Partial<Record<UwResolutionAction, string>> = {
  schedule_makegood: "Air a replacement. Resolves itself when the makegood airs.",
  accept_alternate: "It aired close enough to count as delivered.",
  waive: "The credit is not owed. Managers only.",
  closed: "Recorded in error, or nothing to do.",
  reassign: "Move the obligation to another line.",
  clarification_requested: "Waiting on the underwriter or the host.",
  corrected: "The host's record was wrong; it aired as ordered.",
};

/**
 * One missed credit, laid out in the order the work happens
 * (docs/underwriting-traffic-redesign.md §17): what happened, the agency's
 * answer when the order needs one, the makegood — created and, if wanted,
 * placed here — and the decision. The Makegoods list that used to hold the
 * break picker is gone; auto-fill places a makegood unless someone picks a
 * break here.
 */
export default async function ExceptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [{ isManager }, exception] = await Promise.all([
    requireUnderwritingAccess(),
    getExceptionDetail(id),
  ]);
  if (!exception) notFound();
  const { makegoods, linkedCopy } = await getExceptionMakegoodContext(exception);

  const step = exceptionStep({ ...exception, makegoods });
  const open = exception.resolution_status === "open";
  const needsAgency = exception.makegood_approval !== "not_required";
  const activeMakegood = makegoods.some((makegood) => makegood.status === "scheduled");

  // The board's four steps: the decision and the makegood are one step —
  // creating a makegood is the decision — and Resolve is where it ends,
  // usually by itself when the makegood airs.
  const steps = [
    { label: "What happened" },
    ...(needsAgency ? [{ label: "Agency approval" }] : []),
    { label: "Makegood" },
    { label: "Resolve" },
  ];
  const current =
    step === "agency"
      ? 1
      : step === "resolved"
        ? steps.length
        : steps.findIndex((item) => item.label === "Makegood");

  const decisionDefault =
    exception.resolution_action ?? (activeMakegood ? "schedule_makegood" : undefined);
  const decisionOption = (action: UwResolutionAction): ChoiceCardOption<UwResolutionAction> => ({
    value: action,
    title: RESOLUTION_ACTION_LABEL[action],
    description: DECISION_DESCRIPTION[action],
  });
  const common = COMMON_DECISIONS.map((action) =>
    action === "waive" && !isManager && exception.resolution_action !== "waive"
      ? {
          ...decisionOption(action),
          description: "The credit is not owed. Ask an underwriting manager.",
          disabled: true,
        }
      : decisionOption(action),
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href="/underwriting/exceptions" className="text-xs font-semibold text-brand-link">
          ← Exceptions
        </Link>
        <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">
            {exception.contract.underwriter.name}
          </h2>
          <Badge variant={STEP_VARIANT[step]}>
            {step === "decision" ? "Needs a decision" : EXCEPTION_FILTER_LABEL[step]}
          </Badge>
        </div>
        <p className="text-xs text-ink-500">
          <Link
            href={`/underwriting/contracts/${exception.contract.id}`}
            className="font-semibold text-brand-link"
          >
            {orderNumberLabel(exception.contract.contract_identifier)}
          </Link>{" "}
          · {exception.scheduleLine.label || describeScheduleLine(exception.scheduleLine)}
        </p>
      </div>

      <Steps steps={steps} current={current} label="Where this exception stands" />

      {error && <Alert>{error}</Alert>}

      <section className="rounded border border-line">
        <h3 className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          What happened
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
          <Fact label="Scheduled">{formatPlacementTime(exception.original_scheduled_at)}</Fact>
          <Fact label="Host recorded">
            {exception.host_action.replace(/_/g, " ")}
            {exception.host_reason ? ` · ${exception.host_reason.replace(/_/g, " ")}` : ""}
          </Fact>
          {exception.placement && (
            <Fact label="Break">
              {exception.placement.program_name}
              {exception.placement.break_label ? ` · ${exception.placement.break_label}` : ""}
            </Fact>
          )}
          {exception.broadcastEvent?.notes && (
            <div className="col-span-full">
              <dt className="text-xs text-ink-400">Host notes</dt>
              <dd className="text-ink-900">{exception.broadcastEvent.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      {needsAgency && (
        <section id="agency" className="scroll-mt-4 rounded border border-line">
          <h3 className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Agency&apos;s answer
          </h3>
          <form action={recordMakegoodApproval} className="flex flex-col gap-3 p-5">
            <input type="hidden" name="exception_id" value={exception.id} />
            <p className="text-xs text-ink-500">
              This order&apos;s makegoods must be approved by the agency. Nothing schedules a
              makegood for this exception until the answer is recorded here.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="makegood_approval">Agency&apos;s answer</Label>
                <Select
                  id="makegood_approval"
                  name="makegood_approval"
                  defaultValue={exception.makegood_approval}
                >
                  <option value="pending">Not answered yet</option>
                  <option value="approved">Approved</option>
                  <option value="declined">Declined</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="makegood_approval_note">Note</Label>
                <Input
                  id="makegood_approval_note"
                  name="makegood_approval_note"
                  defaultValue={exception.makegood_approval_note ?? ""}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary">
                Record answer
              </Button>
            </div>
          </form>
        </section>
      )}

      <section id="makegood" className="scroll-mt-4 rounded border border-line">
        <h3 className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Makegood
        </h3>
        {makegoods.length > 0 && (
          <ul className="divide-y divide-line">
            {makegoods.map((makegood) => (
              <MakegoodItem
                key={makegood.id}
                makegood={makegood}
                exceptionId={exception.id}
                approval={exception.makegood_approval}
                contractId={exception.contract.id}
                linkedCopy={linkedCopy}
              />
            ))}
          </ul>
        )}
        {open && !activeMakegood && (
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-ink-500">
              {exception.makegood_approval === "pending"
                ? "Record the agency's answer first. A makegood can be created now but won't be scheduled until then."
                : exception.makegood_approval === "declined"
                  ? "The agency declined a makegood for this credit."
                  : makegoods.length === 0
                    ? "Auto-fill places a makegood in the next eligible break, ahead of regular credits. You can pick the break yourself once it's created."
                    : "Every earlier makegood was cancelled or has aired."}
            </p>
            {exception.makegood_approval !== "declined" && (
              <form action={createMakegood} className="shrink-0">
                <input type="hidden" name="exception_id" value={exception.id} />
                <Button type="submit" variant="secondary">
                  {makegoods.length === 0 ? "Create a makegood" : "Create another makegood"}
                </Button>
              </form>
            )}
          </div>
        )}
        {makegoods.length === 0 && !open && (
          <p className="px-5 py-4 text-sm text-ink-500">No makegood was needed.</p>
        )}
      </section>

      <section id="resolve" className="scroll-mt-4 rounded border border-line">
        <h3 className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Resolve</h3>
        <form action={resolveException} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="exception_id" value={exception.id} />
          <input
            type="hidden"
            name="recommended_action"
            value={exception.recommended_action ?? ""}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-bold text-ink-700">Decision</legend>
            <ChoiceCards
              name="resolution_action"
              columns={2}
              defaultValue={decisionDefault}
              options={common}
            />
            <details
              className="text-sm"
              open={
                exception.resolution_action !== null &&
                MORE_DECISIONS.includes(exception.resolution_action)
              }
            >
              <summary className="cursor-pointer font-semibold text-brand-link">
                More decisions: reassign, ask for clarification, correct the record
              </summary>
              <ChoiceCards
                name="resolution_action"
                columns={3}
                defaultValue={decisionDefault}
                options={MORE_DECISIONS.map(decisionOption)}
                className="mt-2"
              />
            </details>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[14rem_1fr]">
            <div>
              <Label htmlFor="compliance_judgment">Did it meet the contract?</Label>
              <Select
                id="compliance_judgment"
                name="compliance_judgment"
                defaultValue={exception.compliance_judgment}
              >
                <option value="pending">Not yet judged</option>
                <option value="compliant">Yes</option>
                <option value="noncompliant">No</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="resolution_notes">Notes</Label>
              <Textarea
                id="resolution_notes"
                name="resolution_notes"
                rows={2}
                defaultValue={exception.resolution_notes ?? ""}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {open && activeMakegood && (
              <span className="text-xs text-ink-500">Resolves itself when the makegood airs.</span>
            )}
            {open ? (
              <>
                <Button type="submit" name="resolution_status" value="open" variant="secondary">
                  Save
                </Button>
                <Button
                  type="submit"
                  name="resolution_status"
                  value="resolved"
                  disabled={activeMakegood}
                >
                  Save and resolve
                </Button>
              </>
            ) : (
              <>
                <Button type="submit" name="resolution_status" value="open" variant="ghost">
                  Reopen
                </Button>
                <Button type="submit" name="resolution_status" value="resolved">
                  Save
                </Button>
              </>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  );
}

function MakegoodItem({
  makegood,
  exceptionId,
  approval,
  contractId,
  linkedCopy,
}: {
  makegood: ExceptionMakegood;
  exceptionId: string;
  approval: string;
  contractId: string;
  linkedCopy: UwCopyRow[];
}) {
  const state = describeMakegoodState(makegood);
  const shown = MAKEGOOD_STATE[state];
  const awaiting = state === "awaiting_slot";
  const blockedByAgency = approval === "pending" || approval === "declined";

  return (
    <li className="flex flex-col gap-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant={shown.variant}>{shown.label}</Badge>
        {makegood.placement ? (
          <span className="text-ink-700">
            {makegood.placement.program_name} —{" "}
            {formatPlacementTime(makegood.placement.scheduled_at)}
            {makegood.placement.break_label ? ` (${makegood.placement.break_label})` : ""}
            {makegood.placement.override_reason && (
              <span className="ml-2 text-warning-fg">
                override: {makegood.placement.override_reason}
              </span>
            )}
          </span>
        ) : makegood.scheduled_for ? (
          <span className="text-ink-700">{formatPlacementTime(makegood.scheduled_for)}</span>
        ) : null}
        <span className="text-xs text-ink-500">
          Created {formatStationTimestamp(makegood.created_at)}. It counts toward the period the
          original credit missed.
        </span>
        <span className="flex-1" />
        {(state === "awaiting_slot" || state === "slot_scheduled") && (
          <form action={cancelMakegoodAction}>
            <input type="hidden" name="makegood_id" value={makegood.id} />
            <input type="hidden" name="exception_id" value={exceptionId} />
            <Button type="submit" variant="ghost" className="py-1 text-xs">
              Cancel this makegood
            </Button>
          </form>
        )}
      </div>

      {awaiting &&
        (blockedByAgency ? (
          <p className="text-xs text-warning-fg">
            {approval === "pending"
              ? "Waiting on the agency — record its answer above before this can be scheduled."
              : "The agency declined this makegood."}
          </p>
        ) : (
          <MakegoodScheduling id={makegood.id}>
            <PickBreak
              makegood={makegood}
              exceptionId={exceptionId}
              contractId={contractId}
              linkedCopy={linkedCopy}
            />
          </MakegoodScheduling>
        ))}
    </li>
  );
}

function PickBreak({
  makegood,
  exceptionId,
  contractId,
  linkedCopy,
}: {
  makegood: ExceptionMakegood;
  exceptionId: string;
  contractId: string;
  linkedCopy: UwCopyRow[];
}) {
  if (!makegood.placeable || !makegood.placeable.ok) {
    return (
      <p className="text-xs text-danger">
        {makegood.placeable ? makegood.placeable.message : "Could not check for eligible breaks."}
      </p>
    );
  }
  if (makegood.placeable.breaks.length === 0) {
    return (
      <p className="text-xs text-ink-500">
        No eligible open breaks right now — auto-fill generates the rundowns it needs, so leaving it
        for auto-fill is the way forward.
      </p>
    );
  }
  if (linkedCopy.length === 0) {
    return (
      <p className="text-xs text-ink-500">
        Link copy to{" "}
        <Link
          href={`/underwriting/contracts/${contractId}?tab=copy`}
          className="font-semibold text-brand-link"
        >
          this contract
        </Link>{" "}
        before scheduling a makegood.
      </p>
    );
  }
  return (
    <form action={scheduleMakegoodAction} className="flex flex-col gap-3">
      <input type="hidden" name="makegood_id" value={makegood.id} />
      <input type="hidden" name="exception_id" value={exceptionId} />
      <input type="hidden" name="schedule_line_id" value={makegood.schedule_line_id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label htmlFor={`break_${makegood.id}`}>Open break</Label>
          <SearchableSelect
            id={`break_${makegood.id}`}
            name="break_id"
            required
            placeholder="Type a program or date…"
            options={makegood.placeable.breaks.map((brk) => ({
              id: brk.break_id,
              label: `${brk.program_name} — ${formatPlacementTime(brk.scheduled_at)} (${brk.label})`,
              hint: `${brk.remaining_seconds}s remaining`,
            }))}
          />
        </div>
        <div>
          <Label htmlFor={`copy_${makegood.id}`}>Copy</Label>
          <Select id={`copy_${makegood.id}`} name="copy_id" defaultValue="">
            <option value="">Next in rotation</option>
            {linkedCopy.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.approval_status})
              </option>
            ))}
          </Select>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-brand-link">
          Use copy that isn&apos;t approved or is out of date
        </summary>
        <div className="mt-2">
          <Label htmlFor={`override_${makegood.id}`}>Override reason</Label>
          <Input id={`override_${makegood.id}`} name="override_reason" />
          <FieldHint>Only a manager&apos;s override is honored.</FieldHint>
        </div>
      </details>
      <div className="flex justify-end">
        <Button type="submit">Schedule makegood</Button>
      </div>
    </form>
  );
}
