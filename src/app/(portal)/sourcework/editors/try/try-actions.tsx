"use client";

import Link from "next/link";
import { validatePromptBody, type PromptSlot } from "@/lib/sourcework/prompts";
import { publishPrompt } from "../actions";
import { PublishButton, PublishNote, PublishStatus, usePublish } from "../publish-control";

/** Publish (the saved draft) and Back to editing, under a trial's result. */
export function TryActions({ slot, draftBody }: { slot: PromptSlot; draftBody: string }) {
  const editorHref = `/sourcework/editors?slot=${slot}`;
  const publish = usePublish({
    run: async (note) => {
      const checked = validatePromptBody(slot, draftBody);
      if (!checked.ok) return checked;
      return publishPrompt({ slot, body: checked.body, note });
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <PublishNote control={publish} id={`try-${slot}`} />
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
        successMessage={(version) => `Published as v${version}. It is now live for every project.`}
      >
        <Link href={editorHref} className="text-xs font-bold underline">
          Open the guide
        </Link>
      </PublishStatus>
    </div>
  );
}
