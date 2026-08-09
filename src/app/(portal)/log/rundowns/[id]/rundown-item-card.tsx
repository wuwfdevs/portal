"use client";

import { useState, type ReactNode } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { CheckIcon, CloseIcon, EditIcon, RemoveIcon } from "./item-card-icons";

// Replaces the old "Remove" text link + a nested <details> "Adjust for this
// airing" form — both real clutter on a card that's otherwise just trying to
// show what's playing next. Edit and Remove are now small corner glyphs
// (block-editor convention: a hover/always-visible icon in the card's own
// corner, not a separate control below it), and clicking Edit turns the card
// itself into the editable form in place, rather than expanding a second
// form underneath the read view.
export function RundownItemCard({
  rundownId,
  itemId,
  title,
  durationSeconds,
  editable,
  removable,
  overrideScript,
  overrideDurationSeconds,
  updateItemOverridesAction,
  removeRundownItemAction,
  readView,
  midBroadcastActions,
}: {
  rundownId: string;
  itemId: string;
  title: string;
  /** Null when the read view already shows its own duration (the live CopyDisplay doesn't). */
  durationSeconds: number | null;
  editable: boolean;
  removable: boolean;
  overrideScript: string | null;
  overrideDurationSeconds: number | null;
  updateItemOverridesAction: (formData: FormData) => void;
  removeRundownItemAction: (formData: FormData) => void;
  readView: ReactNode;
  midBroadcastActions: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `override-form-${itemId}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              id={formId}
              action={updateItemOverridesAction}
              onSubmit={() => setEditing(false)}
              className="flex flex-col gap-2"
            >
              <input type="hidden" name="rundown_id" value={rundownId} />
              <input type="hidden" name="item_id" value={itemId} />
              <span className="text-sm font-semibold text-ink-900">{title}</span>
              <Textarea
                name="override_script"
                rows={3}
                placeholder="Script for this airing only"
                defaultValue={overrideScript ?? ""}
              />
              <Input
                name="override_duration_seconds"
                type="number"
                min={1}
                placeholder="Duration (s)"
                defaultValue={overrideDurationSeconds ?? ""}
                className="w-32"
              />
            </form>
          ) : (
            readView
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button
                type="submit"
                form={formId}
                className="rounded p-1 text-brand-link hover:bg-brand-surface"
                aria-label="Save changes"
              >
                <CheckIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded p-1 text-ink-500 hover:bg-panel-100"
                aria-label="Cancel editing"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              {durationSeconds !== null && (
                <span className="mr-1 font-mono text-xs font-semibold text-ink-900">
                  {durationSeconds}s
                </span>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded p-1 text-ink-500 hover:bg-panel-100"
                  aria-label={`Edit ${title}`}
                >
                  <EditIcon className="h-3.5 w-3.5" />
                </button>
              )}
              {removable && (
                <form action={removeRundownItemAction}>
                  <input type="hidden" name="rundown_id" value={rundownId} />
                  <input type="hidden" name="item_id" value={itemId} />
                  <button
                    type="submit"
                    className="rounded p-1 text-ink-500 hover:bg-danger/10 hover:text-danger"
                    aria-label={`Remove ${title}`}
                  >
                    <RemoveIcon className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {!editing && midBroadcastActions}
    </div>
  );
}
