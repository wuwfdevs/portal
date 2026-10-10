"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { validateFormatSpec, type FormatSpec } from "@/lib/sourcework/piece-formats";
import { publishFormat } from "../actions";
import { PublishPanel } from "../../publish-panel";

/** Publish… (the saved draft) and Back to editing, under a format trial's result. */
export function FormatTryActions({
  formatId,
  draftSpec,
}: {
  formatId: string;
  draftSpec: FormatSpec;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const editorHref = `/sourcework/editors/formats?format=${formatId}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={() => setPublishing(true)}
          disabled={publishing}
          className="max-sm:min-h-12"
        >
          Publish…
        </Button>
        <Link
          href={editorHref}
          className="inline-flex items-center justify-center rounded border border-brand-link px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface max-sm:min-h-12"
        >
          Back to editing
        </Link>
        <span className="text-[13px] text-ink-500 sm:ml-auto">
          Publishing asks for a one-line note about what changed.
        </span>
      </div>
      {publishing && (
        <PublishPanel
          id={`format-try-${formatId}`}
          consequence="Publishing changes what every reporter's next draft follows; the previous version stays available to make live again."
          publish={async (note) => {
            const checked = validateFormatSpec(draftSpec);
            if (!checked.ok) return checked;
            return publishFormat({ formatId, spec: checked.spec, note });
          }}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            router.push(editorHref);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
