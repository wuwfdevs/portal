"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QUESTION_MAX } from "@/lib/sourcework/research";
import { addResearchQuestion } from "../research-actions";

/**
 * Turns an emerging theme into a research question, so the next Analyze listens for it in every
 * source. The wording is a starting point (it is edited on the Setup tab like any question); the
 * theme itself stays where it is.
 */
export function TrackThemeButton({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);

  async function track() {
    setBusy(true);
    setState(null);
    const question = `What do the sources say about ${label.replace(/[.?!]+$/, "").toLowerCase()}?`;
    const result = await addResearchQuestion({
      projectId,
      question: question.slice(0, QUESTION_MAX),
    });
    setBusy(false);
    if (!result.ok) {
      setState({ ok: false, text: result.error });
      return;
    }
    setState({
      ok: true,
      text: "Added as a research question. Edit its wording on the Setup tab, then Analyze again: passages already accepted or rejected are not suggested a second time, so the new findings come from what is still undecided.",
    });
    router.refresh();
  }

  return (
    <div className="mt-2">
      {state?.ok ? (
        <p role="status" className="text-xs text-ink-500">
          {state.text}
        </p>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={track} disabled={busy}>
          Track as a research question
        </Button>
      )}
      {state && !state.ok && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.text}
        </p>
      )}
    </div>
  );
}
