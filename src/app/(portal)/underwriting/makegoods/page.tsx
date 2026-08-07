import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { listMakegoods } from "@/lib/underwriting/queries";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import { describeMakegoodState, MAKEGOOD_STATE_LABEL, type MakegoodDisplayState } from "@/lib/underwriting/makegoods";
import { cancelMakegoodAction, scheduleMakegoodAction } from "../makegood-actions";

const STATE_VARIANT: Record<MakegoodDisplayState, BadgeVariant> = {
  awaiting_slot: "warning",
  slot_scheduled: "accent",
  aired: "success",
  cancelled: "muted",
};

/**
 * Workflow F (docs/underwriting-design.md §3F, §4) — every makegood, newest
 * first. A makegood created from the exception page starts here awaiting a
 * slot; picking one goes through the identical eligibility check as the
 * contract page's own "Place a credit" form, since both call
 * log_place_underwriting_credit(). Once aired (Slice 4's own
 * uw_update_makegood_from_broadcast_event trigger) or cancelled, a makegood
 * is read-only here.
 */
export default async function MakegoodsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const makegoods = await listMakegoods();

  if (makegoods.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No makegoods yet — they&apos;re created from an exception&apos;s detail page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <ul className="flex flex-col gap-4">
        {makegoods.map((makegood) => {
          const state = describeMakegoodState(makegood);
          return (
            <li key={makegood.id} className="rounded border border-line p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/underwriting/contracts/${makegood.contract.id}`}
                  className="text-sm font-semibold text-brand-link"
                >
                  {makegood.contract.underwriter_name}
                </Link>
                <Badge variant={STATE_VARIANT[state]}>{MAKEGOOD_STATE_LABEL[state]}</Badge>
              </div>
              <p className="mb-3 text-xs text-ink-500">
                {makegood.obligation.description} · resolving{" "}
                <Link href={`/underwriting/exceptions/${makegood.exception.id}`} className="font-semibold text-brand-link">
                  the exception from {formatPlacementTime(makegood.exception.original_scheduled_at)}
                </Link>
              </p>

              {makegood.placement && (
                <p className="mb-3 text-xs text-ink-700">
                  {makegood.placement.program_name} — {formatPlacementTime(makegood.placement.scheduled_at)}
                  {makegood.placement.clock_slot_label ? ` (${makegood.placement.clock_slot_label})` : ""}
                  {makegood.placement.override_reason && (
                    <span className="ml-2 text-warning-fg">override: {makegood.placement.override_reason}</span>
                  )}
                </p>
              )}

              {state === "awaiting_slot" &&
                (!makegood.placeable || !makegood.placeable.ok ? (
                  <p className="text-xs text-danger">
                    {makegood.placeable ? makegood.placeable.message : "Could not check for eligible slots."}
                  </p>
                ) : makegood.placeable.items.length === 0 ? (
                  <p className="text-xs text-ink-500">
                    No eligible open slots right now — a rundown must exist for an eligible program first.
                  </p>
                ) : makegood.linkedCopy.length === 0 ? (
                  <p className="text-xs text-ink-500">
                    Link copy to{" "}
                    <Link href={`/underwriting/contracts/${makegood.contract.id}`} className="font-semibold text-brand-link">
                      this contract
                    </Link>{" "}
                    before scheduling a makegood.
                  </p>
                ) : (
                  <form
                    action={scheduleMakegoodAction}
                    className="flex flex-col gap-3 rounded border border-dashed border-line p-3"
                  >
                    <input type="hidden" name="makegood_id" value={makegood.id} />
                    <input type="hidden" name="obligation_id" value={makegood.obligation_id} />
                    <div>
                      <Label htmlFor={`rundown_item_${makegood.id}`}>Open slot</Label>
                      <Select id={`rundown_item_${makegood.id}`} name="rundown_item_id" defaultValue="">
                        <option value="" disabled>
                          Choose a slot…
                        </option>
                        {makegood.placeable.items.map((item) => (
                          <option key={item.rundown_item_id} value={item.rundown_item_id}>
                            {item.program_name} — {formatPlacementTime(item.scheduled_at)}
                            {item.clock_slot_label ? ` (${item.clock_slot_label})` : ""} · {item.slot_duration_seconds}s
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`copy_${makegood.id}`}>Copy</Label>
                      <Select id={`copy_${makegood.id}`} name="copy_id" defaultValue="">
                        <option value="" disabled>
                          Choose copy…
                        </option>
                        {makegood.linkedCopy.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.cart_identifier ?? item.id.slice(0, 8)} ({item.approval_status})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`override_${makegood.id}`}>Override reason</Label>
                      <Input id={`override_${makegood.id}`} name="override_reason" />
                      <FieldHint>
                        Only needed if the copy isn&apos;t approved or is outside its effective dates — and only a
                        manager&apos;s override is actually honored.
                      </FieldHint>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit">Schedule makegood</Button>
                    </div>
                  </form>
                ))}

              {(state === "awaiting_slot" || state === "slot_scheduled") && (
                <form action={cancelMakegoodAction} className="mt-2">
                  <input type="hidden" name="makegood_id" value={makegood.id} />
                  <Button type="submit" variant="ghost">
                    Cancel makegood
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
