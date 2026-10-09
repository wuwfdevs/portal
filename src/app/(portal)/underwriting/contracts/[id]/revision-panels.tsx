import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, CheckboxField } from "@/components/ui/input";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import type { RevisionActivationPreview } from "@/lib/underwriting/revisions";
import {
  activateRevisionAction,
  cancelDraftRevision,
  createRevisionFromCurrent,
} from "../../contract-actions";
import { SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { pluralize } from "@/lib/format";

/**
 * The Schedule tab's banner while a draft revision exists: what it is, one
 * sentence on what activating it changes, and — with `?activate=1` — the
 * full preview with Activate and Discard.
 */
export function DraftRevisionBanner({
  base,
  contractId,
  revisionId,
  name,
  effectiveFrom,
  draftLineCount,
  activation,
  expanded,
}: {
  base: string;
  contractId: string;
  revisionId: string;
  name: string;
  effectiveFrom: string;
  draftLineCount: number;
  activation: RevisionActivationPreview | null;
  expanded: boolean;
}) {
  const discardForm = (
    <form action={cancelDraftRevision}>
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="revision_id" value={revisionId} />
      <Button type="submit" variant="ghost">
        Discard draft
      </Button>
    </form>
  );

  return (
    <section
      aria-labelledby="draft-revision"
      className="rounded border border-warning-fg/30 bg-warning-bg/40 px-5 py-4 text-sm"
    >
      <h3 id="draft-revision" className="font-semibold text-ink-900">
        Draft revision &ldquo;{name}&rdquo; takes effect {effectiveFrom}
      </h3>
      {activation && (
        <p className="mt-1 text-[13px] text-ink-700">
          Activating it would clear{" "}
          {pluralize(activation.placementsToClear.length, "scheduled placement")} from that date and
          make its {pluralize(draftLineCount, "line")} the ones that schedule.
        </p>
      )}

      {expanded && activation ? (
        <div className="mt-3">
          <div className="mb-1 font-semibold text-ink-900">
            Activating &ldquo;{name}&rdquo; from {effectiveFrom} would:
          </div>
          <ul className="mb-3 list-disc pl-5 text-xs text-ink-700">
            <li>
              Supersede {activation.bucketsToSupersede.length} open demand bucket
              {activation.bucketsToSupersede.length === 1 ? "" : "s"} of the current revision (
              {activation.bucketsToSupersede.reduce((s, b) => s + b.quantity_required, 0)} credits
              still owed there).
            </li>
            <li>
              Clear {activation.placementsToClear.length} scheduled placement
              {activation.placementsToClear.length === 1 ? "" : "s"} dated on or after the effective
              date
              {activation.placementsToClear.length > 0 &&
                ` (${activation.placementsToClear
                  .slice(0, 4)
                  .map((p) => formatPlacementTime(p.scheduled_at))
                  .join(", ")}${activation.placementsToClear.length > 4 ? ", …" : ""})`}
              . {activation.placementsKept} earlier placement
              {activation.placementsKept === 1 ? "" : "s"} and every broadcast event stay with the
              old revision.
            </li>
            {activation.makegoodsLeftOpen > 0 && (
              <li>
                Leave {activation.makegoodsLeftOpen} makegood
                {activation.makegoodsLeftOpen === 1 ? "" : "s"} awaiting a slot open under the old
                revision — resolve or cancel them on the Makegoods screen.
              </li>
            )}
            {activation.draftBucketsDropped.length > 0 && (
              <li>
                Drop {activation.draftBucketsDropped.length} of the draft&apos;s own bucket
                {activation.draftBucketsDropped.length === 1 ? "" : "s"} that end before the
                effective date, so no period is counted twice.
              </li>
            )}
            <li>
              Make the draft&apos;s {pluralize(draftLineCount, "line")} the ones auto-fill and
              manual placement schedule from.
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <form action={activateRevisionAction}>
              <input type="hidden" name="contract_id" value={contractId} />
              <input type="hidden" name="revision_id" value={revisionId} />
              <Button type="submit">Activate revision</Button>
            </form>
            {discardForm}
            <TextLink href={base} className="text-[13px]">
              Close
            </TextLink>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SecondaryLink size="sm" href={`${base}?activate=1`}>
            Review and activate
          </SecondaryLink>
          {discardForm}
        </div>
      )}
    </section>
  );
}

/** "Revise the schedule" (`?revise=1`): starts a draft revision beside the current one. */
export function ReviseScheduleForm({ base, contractId }: { base: string; contractId: string }) {
  return (
    <section aria-labelledby="revise" className="rounded border border-line px-5 py-4">
      <h3 id="revise" className="text-sm font-bold text-ink-900">
        Revise the schedule
      </h3>
      <form
        action={createRevisionFromCurrent}
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <input type="hidden" name="contract_id" value={contractId} />
        <div>
          <Label htmlFor="revision_label">Label</Label>
          <Input
            id="revision_label"
            name="revision_label"
            placeholder="Revised order, Oct 1"
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="revision_effective_from">Takes effect</Label>
          <Input id="revision_effective_from" name="effective_from" type="date" required />
        </div>
        <div>
          <Label htmlFor="revision_received_at">Received</Label>
          <Input id="revision_received_at" name="received_at" type="date" />
        </div>
        <CheckboxField
          name="copy_lines"
          defaultChecked
          label="Start from a copy of the current lines"
          className="pb-2"
        />
        <Button type="submit" variant="secondary">
          Create draft
        </Button>
        <TextLink href={base} className="pb-2 text-[13px]">
          Cancel
        </TextLink>
      </form>
      <FieldHint>
        A draft is edited beside the current schedule and schedules nothing until it is activated.
        Activation changes future demand only — aired credits, broadcast events and exceptions stay
        with the revision they happened under.
      </FieldHint>
    </section>
  );
}

/** A revision's own label, or its position on the contract ("Revision 2"). */
export function revisionName(revision: { revision_label: string | null }, index: number): string {
  return revision.revision_label ?? `Revision ${index + 1}`;
}
