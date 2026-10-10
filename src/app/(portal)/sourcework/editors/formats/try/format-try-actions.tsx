"use client";

import Link from "next/link";
import { validateFormatSpec, type FormatSpec } from "@/lib/sourcework/piece-formats";
import { publishFormat } from "../actions";
import { PublishButton, PublishNote, PublishStatus, usePublish } from "../../publish-control";

/** Publish (the saved draft) and Back to editing, under a format trial's result. */
export function FormatTryActions({
  formatId,
  draftSpec,
}: {
  formatId: string;
  draftSpec: FormatSpec;
}) {
  const editorHref = `/sourcework/editors/formats?format=${formatId}`;
  const publish = usePublish({
    run: async (note) => {
      const checked = validateFormatSpec(draftSpec);
      if (!checked.ok) return checked;
      return publishFormat({ formatId, spec: checked.spec, note });
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <PublishNote
        control={publish}
        id={`format-try-${formatId}`}
        placeholder="Shorter setup; asks for a second voice"
        consequence="Shown in History. Publishing changes what every reporter's next draft follows; the previous version stays available to make live again."
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <PublishButton control={publish} className="max-sm:min-h-12" />
        <Link
          href={editorHref}
          className="inline-flex items-center justify-center rounded border border-brand-link px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface max-sm:min-h-12"
        >
          Back to editing
        </Link>
      </div>
      <PublishStatus
        control={publish}
        successMessage={(version) => `Published as v${version}. Reporters' next drafts follow it.`}
      >
        <Link href={editorHref} className="text-xs font-bold underline">
          Open the format
        </Link>
      </PublishStatus>
    </div>
  );
}
