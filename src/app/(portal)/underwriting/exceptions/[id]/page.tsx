import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { CardHeader } from "@/components/ui/section-heading";
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
import { isClosedToUnderwriting } from "@/lib/log/underwriting-hours";
import { loadUnderwritingHours } from "@/lib/log/underwriting-hours-queries";
import { describeMakegoodState } from "@/lib/underwriting/makegoods";
import { exceptionStep, RESOLUTION_ACTION_LABEL } from "@/lib/underwriting/exception-filters";
import { recordMakegoodApproval, resolveException } from "../../exception-actions";
import {
  cancelMakegoodAction,
  createMakegood,
  scheduleMakegoodAction,
} from "../../makegood-actions";
import type { UwResolutionAction } from "@/lib/database.types";
import { TextLink } from "@/components/ui/primary-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { EXCEPTION_STEP_STATUS, MAKEGOOD_STATUS } from "@/lib/underwriting/status";

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

  const steps = [
    { label: "What happened" },
    ...(needsAgency ? [{ label: "Agency's answer" }] : []),
    { label: "Decide" },
    { label: "Makegood" },
    { label: "Resolved" },
  ];
  const stepIndex = (label: string) => steps.findIndex((item) => item.label === label);
  const current =
    step === "agency"
      ? stepIndex("Agency's answer")
      : step === "decision"
        ? stepIndex("Decide")
        : step === "resolved"
          ? steps.length
          : stepIndex("Makegood");

  const decisionDefault =
    exception.resolution_action ?? (activeMakegood ? "schedule_makegood" : undefined);
  const decisionOption = (action: UwResolutionAction): ChoiceCardOption<UwResolutionAction> => ({
    value: action,
    title: RESOLUTION_ACTION_LABEL[action],
    description: DECISION_DESCRIPTION[action],
  });
  const common = COMMON_DECISIONS.filter(
    (action) => action !== "waive" || isManager || exception.resolution_action === "waive",
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        back={{ href: "/underwriting/exceptions", label: "Exceptions" }}
        title={exception.contract.underwriter.name}
        badge={<StatusBadge map={EXCEPTION_STEP_STATUS} value={step} />}
        description={
          <>
            <TextLink href={`/underwriting/contracts/${exception.contract.id}`}>
              {orderNumberLabel(exception.contract.contract_identifier)}
            </TextLink>{" "}
            · {exception.scheduleLine.label || describeScheduleLine(exception.scheduleLine)}
          </>
        }
      />

      <Steps steps={steps} current={current} label="Where this exception stands" />

      {error && <Alert>{error}</Alert>}

      <Card>
        <CardHeader>What happened</CardHeader>
        <DescriptionList
          columns={3}
          className="p-5"
          items={[
            { label: "Scheduled", value: formatPlacementTime(exception.original_scheduled_at) },
            {
              label: "Host recorded",
              value: `${exception.host_action.replace(/_/g, " ")}${
                exception.host_reason ? ` · ${exception.host_reason.replace(/_/g, " ")}` : ""
              }`,
            },
            ...(exception.placement
              ? [
                  {
                    label: "Break",
                    value: `${exception.placement.program_name}${
                      exception.placement.break_label ? ` · ${exception.placement.break_label}` : ""
                    }`,
                  },
                ]
              : []),
            ...(exception.broadcastEvent?.notes
              ? [{ label: "Host notes", value: exception.broadcastEvent.notes }]
              : []),
          ]}
        />
      </Card>

      {needsAgency && (
        <Card id="agency" className="scroll-mt-4">
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
        </Card>
      )}

      <Card id="makegood" className="scroll-mt-4">
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
      </Card>

      <Card id="resolve" className="scroll-mt-4">
        <h3 className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          {open ? "Decide" : "Decision"}
        </h3>
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
              options={common.map(decisionOption)}
            />
            {!isManager && <FieldHint>Waiving a credit needs an underwriting manager.</FieldHint>}
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
                <Button
                  type="submit"
                  name="resolution_status"
                  value="open"
                  variant={activeMakegood ? "primary" : "secondary"}
                >
                  Save
                </Button>
                {!activeMakegood && (
                  <Button type="submit" name="resolution_status" value="resolved">
                    Save and resolve
                  </Button>
                )}
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
      </Card>
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
  const awaiting = state === "awaiting_slot";
  const blockedByAgency = approval === "pending" || approval === "declined";

  return (
    <li className="flex flex-col gap-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusBadge map={MAKEGOOD_STATUS} value={state} />
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
          <>
            <p className="text-xs text-ink-500">
              The next auto-fill places it first, ahead of regular credits, in the first eligible
              break. It counts toward the period the original credit missed.
            </p>
            <details className="rounded border border-dashed border-line px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand-link">
                Pick a break now
              </summary>
              <PickBreak
                makegood={makegood}
                exceptionId={exceptionId}
                contractId={contractId}
                linkedCopy={linkedCopy}
              />
            </details>
          </>
        ))}
    </li>
  );
}

async function PickBreak({
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
      <p className="mt-3 text-xs text-danger">
        {makegood.placeable ? makegood.placeable.message : "Could not check for eligible breaks."}
      </p>
    );
  }
  if (makegood.placeable.breaks.length === 0) {
    return (
      <p className="mt-3 text-xs text-ink-500">
        No eligible open breaks right now — auto-fill generates the rundowns it needs, so leaving it
        for auto-fill is the way forward.
      </p>
    );
  }
  if (linkedCopy.length === 0) {
    return (
      <p className="mt-3 text-xs text-ink-500">
        Link copy to{" "}
        <TextLink href={`/underwriting/contracts/${contractId}?tab=copy`}>this contract</TextLink>{" "}
        before scheduling a makegood.
      </p>
    );
  }
  // A hand-picked slot may be in hours closed to underwriting (the rule
  // reaches automation only), but the option says so.
  const underwritingHours = await loadUnderwritingHours();
  return (
    <form action={scheduleMakegoodAction} className="mt-3 flex flex-col gap-3">
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
              hint: isClosedToUnderwriting(
                brk.scheduled_at,
                underwritingHours.weekly,
                underwritingHours.changes,
              )
                ? `${brk.remaining_seconds}s remaining · closed to underwriting`
                : `${brk.remaining_seconds}s remaining`,
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
