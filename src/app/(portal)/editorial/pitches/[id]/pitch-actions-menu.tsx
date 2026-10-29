"use client";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Input } from "@/components/ui/input";

export const ADD_TO_SLATE_FORM_ID = "add-to-slate-form";
export const ARCHIVE_PITCH_FORM_ID = "archive-pitch-form";
export const RESTORE_PITCH_FORM_ID = "restore-pitch-form";

/**
 * The pitch page's ⋮ menu: the editor's less-frequent actions, each firing a
 * hidden `<form action={serverAction}>` the page declares, so the writes stay
 * ordinary Server Actions. Archive takes its optional reason inside the confirm
 * step — the input belongs to the archive form through its `form` attribute,
 * so it submits with it from wherever the menu renders (the sheet is portaled).
 */
export function PitchActionsMenu({
  pitchTitle,
  openMeetingLabel,
  canArchive,
  canRestore,
}: {
  pitchTitle: string;
  /** The open meeting's date, when the pitch can be added to its slate; null otherwise. */
  openMeetingLabel: string | null;
  canArchive: boolean;
  canRestore: boolean;
}) {
  const items: ActionMenuItem[] = [];

  if (openMeetingLabel) {
    items.push({
      label: "Add to the open slate",
      hint: `Meeting on ${openMeetingLabel}`,
      formId: ADD_TO_SLATE_FORM_ID,
    });
  }
  if (canRestore) {
    items.push({ label: "Restore to backlog", formId: RESTORE_PITCH_FORM_ID });
  }
  if (canArchive) {
    items.push({
      label: "Archive…",
      variant: "danger",
      dividerBefore: items.length > 0,
      confirm: {
        message: (
          <div className="flex flex-col gap-2.5">
            <p>
              Takes “{pitchTitle}” out of the backlog. It stays on the record and can be restored
              from this page.
            </p>
            <Input
              name="reason"
              form={ARCHIVE_PITCH_FORM_ID}
              placeholder="Reason (optional)"
              aria-label="Reason for archiving"
              maxLength={200}
            />
          </div>
        ),
        confirmLabel: "Archive pitch",
      },
      onClick: () => {
        const form = document.getElementById(ARCHIVE_PITCH_FORM_ID);
        if (form instanceof HTMLFormElement) form.requestSubmit();
      },
    });
  }

  if (items.length === 0) return null;
  return <ActionMenu label="Pitch actions" items={items} sheetHeading={pitchTitle} />;
}
