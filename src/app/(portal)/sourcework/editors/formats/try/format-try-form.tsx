"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-draft-prompt";
import type { FormatTrialSample } from "@/lib/sourcework/piece-format-queries";

/** Picks a project (and an optional direction) and drafts a piece from it with the live format and the draft. */
export function FormatTryForm({
  formatId,
  samples,
  initialProjectId,
  hasLive,
  canRun,
}: {
  formatId: string;
  samples: FormatTrialSample[];
  initialProjectId: string;
  hasLive: boolean;
  canRun: boolean;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [direction, setDirection] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/sourcework/editors/format-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formatId, projectId, direction }),
      });
      const data = (await response.json().catch(() => null)) as
        { ok: true; trialId: string } | { ok: false; error: string } | null;
      if (data?.ok) {
        router.push(`/sourcework/editors/formats/try?format=${formatId}&trial=${data.trialId}`);
        router.refresh();
        setRunning(false);
        return;
      }
      setError(
        data && "error" in data
          ? data.error
          : "The trial didn't finish. Check Recent trials in a minute, or run it again.",
      );
    } catch {
      setError("The trial didn't finish. Check your connection, then run it again.");
    }
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-4 rounded border border-line bg-white p-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <Label htmlFor="format-trial-project">Project (supplies the themes and excerpts)</Label>
            <Select
              id="format-trial-project"
              value={projectId}
              disabled={running}
              onChange={(event) => setProjectId(event.target.value)}
              className="max-lg:min-h-12"
            >
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.title} · {sample.excerptCount}{" "}
                  {sample.excerptCount === 1 ? "excerpt" : "excerpts"}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => void run()}
            disabled={running || !canRun}
            className="max-lg:min-h-12 max-lg:w-full"
          >
            {hasLive ? "Run both" : "Run the draft"}
          </Button>
        </div>
        <div>
          <Label htmlFor="format-trial-direction">
            Direction <span className="font-normal text-ink-400">(optional, used by both)</span>
          </Label>
          <Textarea
            id="format-trial-direction"
            rows={2}
            value={direction}
            maxLength={DIRECTION_MAX}
            disabled={running}
            onChange={(event) => setDirection(event.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-ink-400">
        {hasLive
          ? "Uses two drafting runs on the project's accepted themes and excerpts."
          : "This format isn't published yet, so only your draft runs."}
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      {running && (
        <BusyPanel
          title={
            hasLive ? "Drafting with the live format and your draft" : "Drafting with your draft"
          }
          hint="This can take a minute or two"
          note="Nothing is added to the project, and leaving this page does not lose the result: it is kept under Recent trials."
        />
      )}
    </div>
  );
}
