"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { synthesisSummary } from "@/lib/sourcework/synthesis-view";

type Outcome = Parameters<typeof synthesisSummary>[0];

/**
 * Starts a synthesis run and shows it working. One request is the whole run (the model may check the
 * transcripts as it goes), so the panel is a time hint and a sliding bar rather than a percentage.
 */
export function SynthesizeButton({
  projectId,
  label,
  disabled,
  alreadyRunning,
}: {
  projectId: string;
  label: string;
  disabled?: boolean;
  /** A run started elsewhere is still going; wait for it instead of starting another. */
  alreadyRunning?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sourcework/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const result = (await response.json().catch(() => null)) as
        ({ ok: true } & Outcome) | { ok: false; error: string } | null;
      if (result?.ok) {
        setMessage({ ok: true, text: synthesisSummary(result) });
        startTransition(() => router.refresh());
      } else {
        setMessage({
          ok: false,
          text: result?.error ?? "Synthesis didn't finish. Try again.",
        });
      }
    } catch {
      setMessage({
        ok: false,
        text: "Synthesis didn't finish. Check your connection and try again.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" ai onClick={run} disabled={disabled || running || alreadyRunning}>
          {running ? "Synthesizing…" : label}
        </Button>
      </div>
      {running && (
        <BusyPanel
          title="Reading the findings"
          hint="This can take a few minutes"
          note="You can leave this tab open and come back. Nothing is changed until it finishes, and earlier versions are kept."
        />
      )}
      {!running && alreadyRunning && (
        <Alert variant="info">
          A synthesis is already being written for this project. This page updates when it finishes.
        </Alert>
      )}
      {message && <Alert variant={message.ok ? "success" : "danger"}>{message.text}</Alert>}
    </div>
  );
}
