"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PromptSlot } from "@/lib/sourcework/prompts";
import { PublishPanel } from "../publish-panel";

/** Publish… (the saved draft) and Back to editing, under a trial's result. */
export function TryActions({ slot, draftBody }: { slot: PromptSlot; draftBody: string }) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
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
          href={`/sourcework/editors?slot=${slot}`}
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
          slot={slot}
          getBody={() => draftBody}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            router.push(`/sourcework/editors?slot=${slot}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
