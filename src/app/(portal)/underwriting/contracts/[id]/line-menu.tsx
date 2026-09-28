"use client";

import { useState } from "react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { cancelScheduleLine, removeDraftScheduleLine } from "../../contract-actions";

/**
 * A schedule line's "⋮" menu (docs/underwriting-traffic-redesign.md §11.6):
 * only what is rare or destructive. Auto-fill for this one line submits the
 * hidden form the card renders (`autoFillFormId`, via the button's `form`
 * attribute); Edit is a link when the line can still be rewritten and a
 * greyed item saying why otherwise; Cancel from a date and Remove line open
 * a confirm step below the row instead of acting on the click. Which
 * confirm is open is the only state here.
 */
export function LineMenu({
  label,
  contractId,
  lineId,
  autoFillFormId,
  edit,
  canCancel,
  canRemove,
  defaultCancelFrom,
}: {
  label: string;
  contractId: string;
  lineId: string;
  /** The id of the card's hidden auto-fill form; null hides the item. */
  autoFillFormId: string | null;
  edit: { href: string } | { reason: string } | null;
  canCancel: boolean;
  canRemove: boolean;
  /** Today, station-local — the cancel date's default. */
  defaultCancelFrom: string;
}) {
  const [confirm, setConfirm] = useState<"cancel" | "remove" | null>(null);

  const items: ActionMenuItem[] = [];
  if (autoFillFormId) items.push({ label: "Auto-fill this line", formId: autoFillFormId });
  if (edit) {
    items.push(
      "href" in edit
        ? { label: "Edit line", href: edit.href }
        : { label: "Edit line", disabled: true, hint: edit.reason },
    );
  }
  if (canCancel) {
    items.push({
      label: "Cancel from a date…",
      variant: "danger",
      dividerBefore: items.length > 0,
      onClick: () => setConfirm("cancel"),
    });
  }
  if (canRemove) {
    items.push({
      label: "Remove line…",
      variant: "danger",
      dividerBefore: items.length > 0 && !canCancel,
      onClick: () => setConfirm("remove"),
    });
  }

  return (
    <>
      <ActionMenu label={label} items={items} />
      {confirm === "cancel" && (
        <div className="basis-full">
          <form
            action={cancelScheduleLine}
            className="flex flex-wrap items-end gap-3 rounded border border-danger/30 bg-danger/[0.04] p-3"
          >
            <input type="hidden" name="contract_id" value={contractId} />
            <input type="hidden" name="schedule_line_id" value={lineId} />
            <div className="min-w-[12rem]">
              <Label htmlFor={`cancel_from_${lineId}`}>Cancel this line from</Label>
              <Input
                id={`cancel_from_${lineId}`}
                name="cancelled_from"
                type="date"
                defaultValue={defaultCancelFrom}
                autoFocus
              />
              <FieldHint>
                Demand still open on or after this date is cancelled and its scheduled credits are
                cleared. Credits before it, and their history, stand.
              </FieldHint>
            </div>
            <Button type="submit" variant="secondary">
              Cancel line
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Keep line
            </Button>
          </form>
        </div>
      )}
      {confirm === "remove" && (
        <div className="basis-full">
          <form
            action={removeDraftScheduleLine}
            className="flex flex-wrap items-center gap-3 rounded border border-danger/30 bg-danger/[0.04] p-3"
          >
            <input type="hidden" name="contract_id" value={contractId} />
            <input type="hidden" name="schedule_line_id" value={lineId} />
            <span className="text-xs text-ink-700">
              Nothing has scheduled from this line, so it goes away with no history to keep.
            </span>
            <Button type="submit" variant="secondary">
              Remove line
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Keep line
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
