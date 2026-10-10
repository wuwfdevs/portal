"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ThemeStatus } from "@/lib/sourcework/themes";
import { decideMerge, reviewTheme } from "../theme-actions";

/**
 * Accept / Edit / Reject for a suggested theme, and "Put back" for a rejected
 * one. Edit is a link to the theme page's edit form (saving an edit accepts a
 * suggestion, as it does for a data point). Every decision is a plain write
 * followed by a refresh; nothing is deleted.
 */
export function ThemeDecisionButtons({
  themeId,
  editHref,
  status,
  size = "sm",
}: {
  themeId: string;
  editHref: string;
  status: ThemeStatus;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "accept" | "reject" | "undo") {
    setBusy(true);
    setError(null);
    const result = await reviewTheme({ id: themeId, decision });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const touch = "max-md:min-h-11 max-md:px-4";

  if (status === "rejected") {
    return (
      <div>
        <Button
          type="button"
          variant="link"
          onClick={() => void decide("undo")}
          disabled={busy}
          className={`text-brand-link max-md:min-h-11`}
        >
          Put back for review
        </Button>
        {error && <Error text={error} />}
      </div>
    );
  }
  if (status === "accepted") return null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 max-md:gap-2">
        <Button
          type="button"
          size={size}
          onClick={() => void decide("accept")}
          disabled={busy}
          className={touch}
        >
          Accept
        </Button>
        <Link
          href={editHref}
          className={`inline-flex items-center rounded border border-brand-link px-3 py-1.5 text-xs font-bold text-brand-link hover:bg-brand-surface ${touch}`}
        >
          Edit
        </Link>
        <Button
          type="button"
          variant="link"
          onClick={() => void decide("reject")}
          disabled={busy}
          className="px-1.5 text-xs font-semibold text-ink-500 max-md:ml-auto max-md:min-h-11 max-md:text-sm"
        >
          Reject
        </Button>
      </div>
      {error && <Error text={error} />}
    </div>
  );
}

/** Accept / Reject for a merge suggestion. */
export function MergeDecisionButtons({ suggestionId }: { suggestionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const result = await decideMerge({ id: suggestionId, decision });
    setBusy(false);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 max-md:gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void decide("accept")}
          disabled={busy}
          className="max-md:min-h-11 max-md:px-4"
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => void decide("reject")}
          disabled={busy}
          className="px-1.5 text-xs font-semibold text-ink-500 max-md:ml-auto max-md:min-h-11 max-md:text-sm"
        >
          Reject
        </Button>
      </div>
      {error && <Error text={error} />}
    </div>
  );
}

function Error({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-1.5 text-xs text-danger">
      {text}
    </p>
  );
}
