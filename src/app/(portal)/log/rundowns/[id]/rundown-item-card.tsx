"use client";

import { useRef, useState, type ReactNode } from "react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { CheckIcon, CloseIcon, DotsIcon, EditIcon, RemoveIcon } from "./item-card-icons";

// Replaces what used to be a "Remove" text link + a nested <details>
// "Adjust for this airing" form, then (briefly) two separate corner icons
// plus a third "Move to…" select living outside the card entirely next to
// the drag handle. All three actions — edit, move, remove — now live behind
// one "⋮" menu, using <details>/<summary> rather than custom ARIA menu
// semantics, matching every other disclosure in this codebase (the Missed
// reason picker, "Full forecast," etc.). The drag handle stays separate and
// visible on its own — dragging needs a direct grab target, it isn't a menu
// action — but its non-drag alternative (the destination select) is now a
// menu item here instead of its own always-visible row.
//
// Clicking Edit turns the card itself into the editable form in place,
// rather than expanding a second form underneath the read view.

export interface RundownItemCardBaseProps {
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
}

export interface MoveDestinationOption {
  id: string;
  label: string;
}

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
  moveDestinations,
  onMoveTo,
}: RundownItemCardBaseProps & {
  /** Null (not just empty) when this item can't be moved at all (e.g. underwriting credits) — no menu item renders either way if empty. */
  moveDestinations: MoveDestinationOption[] | null;
  onMoveTo: ((destinationBreakId: string) => void) | null;
}) {
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const formId = `override-form-${itemId}`;
  const canMove = moveDestinations !== null && moveDestinations.length > 0 && onMoveTo !== null;
  const hasMenu = editable || removable || canMove;

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

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
              {hasMenu && (
                <details ref={menuRef} className="relative">
                  <summary
                    aria-label={`Actions for ${title}`}
                    className="flex list-none items-center rounded p-1 text-ink-500 hover:bg-panel-100 [&::-webkit-details-marker]:hidden"
                  >
                    <DotsIcon className="h-3.5 w-3.5" />
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-52 rounded border border-line bg-white p-1 shadow-md">
                    {editable && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(true);
                          closeMenu();
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-ink-700 hover:bg-panel-50"
                      >
                        <EditIcon className="h-3.5 w-3.5" /> Edit for this airing
                      </button>
                    )}
                    {canMove && (
                      <label className="block px-2 py-1.5 text-xs font-semibold text-ink-700">
                        <span className="mb-1 block">Move to…</span>
                        <Select
                          value=""
                          onChange={(event) => {
                            if (event.target.value) {
                              onMoveTo(event.target.value);
                              closeMenu();
                            }
                          }}
                          className="w-full py-1 text-xs font-normal"
                        >
                          <option value="">Choose a break…</option>
                          {moveDestinations.map((destination) => (
                            <option key={destination.id} value={destination.id}>
                              {destination.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                    {removable && (
                      <form action={removeRundownItemAction} onSubmit={closeMenu}>
                        <input type="hidden" name="rundown_id" value={rundownId} />
                        <input type="hidden" name="item_id" value={itemId} />
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-danger hover:bg-danger/10"
                        >
                          <RemoveIcon className="h-3.5 w-3.5" /> Remove
                        </button>
                      </form>
                    )}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      {!editing && midBroadcastActions}
    </div>
  );
}
