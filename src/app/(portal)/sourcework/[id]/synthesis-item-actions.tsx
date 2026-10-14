"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setThemeDismissed, trackSynthesisItem } from "./synthesis-actions";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(call: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }
  return { pending, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-1 text-xs text-danger">
      {error}
    </p>
  ) : null;
}

/**
 * Turns a pattern or an open point into a research question, so the next Analyze listens for it in
 * every source. The wording is a starting point (it is edited on the Setup tab like any question).
 * The item then reads "Tracking" and cannot be tracked twice.
 */
export function TrackItemButton({
  projectId,
  expectVersion,
  kind,
  itemId,
  text,
  label,
  variant = "secondary",
}: {
  projectId: string;
  expectVersion: number;
  kind: "theme" | "gap";
  itemId: string;
  text: string;
  label: string;
  variant?: "secondary" | "ghost";
}) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() =>
          run(() => trackSynthesisItem({ projectId, expectVersion, kind, itemId, text }))
        }
      >
        {pending ? "Adding…" : label}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function DismissThemeButton({
  projectId,
  expectVersion,
  themeId,
  dismissed,
}: {
  projectId: string;
  expectVersion: number;
  themeId: string;
  dismissed: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        touch
        disabled={pending}
        onClick={() =>
          run(() => setThemeDismissed({ projectId, expectVersion, themeId, dismissed: !dismissed }))
        }
      >
        {dismissed ? "Restore" : "Dismiss"}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
