"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import type { QuoteSampleProject } from "@/lib/sourcework/quote-trials";

/** Picks a sample (project, then one of its accepted themes) and runs the live guide and the draft on it. */
export function QuoteTryForm({
  samples,
  initialProjectId,
  initialThemeId,
  recentSamples,
  canRun,
}: {
  samples: QuoteSampleProject[];
  initialProjectId: string;
  initialThemeId: string;
  /** Theme titles the editor tried lately, newest first. */
  recentSamples: string[];
  canRun: boolean;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [themeId, setThemeId] = useState(initialThemeId);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = samples.find((entry) => entry.id === projectId) ?? samples[0]!;

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/sourcework/editors/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: "quote_quality", projectId, themeId }),
      });
      const data = (await response.json().catch(() => null)) as
        { ok: true; trialId: string } | { ok: false; error: string } | { error: string } | null;
      if (data && "ok" in data && data.ok) {
        router.push(`/sourcework/editors/try?slot=quote_quality&trial=${data.trialId}`);
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
      <div className="flex flex-col gap-4 rounded border border-line bg-white p-4 sm:px-5 lg:flex-row lg:items-end">
        <div className="flex-1">
          <Label htmlFor="trial-project">Project</Label>
          <Select
            id="trial-project"
            value={project.id}
            disabled={running}
            onChange={(event) => {
              const next = samples.find((entry) => entry.id === event.target.value)!;
              setProjectId(next.id);
              setThemeId(next.themes[0]!.id);
            }}
            className="max-lg:min-h-12"
          >
            {samples.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <Label htmlFor="trial-theme">Theme</Label>
          <Select
            id="trial-theme"
            value={themeId}
            disabled={running}
            onChange={(event) => setThemeId(event.target.value)}
            className="max-lg:min-h-12"
          >
            {project.themes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          onClick={() => void run()}
          disabled={running || !canRun}
          className="max-lg:min-h-12"
        >
          Run both
        </Button>
      </div>
      <p className="text-xs text-ink-400">
        Uses two quote runs.
        {recentSamples.length > 0 && <> Recent samples: {recentSamples.join(", ")}.</>}
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      {running && (
        <BusyPanel
          title="Running the live guide and your draft"
          hint="This can take a few minutes"
          note="Both read the same theme at the same time. Nothing is added to any project, and leaving this page does not lose the result: it is kept under Recent trials."
        />
      )}
    </div>
  );
}
