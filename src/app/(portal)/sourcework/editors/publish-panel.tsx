"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PROMPT_NOTE_MAX } from "@/lib/sourcework/prompts";

/**
 * "Publish…": asks for a one-line note and publishes. Shared by the prompts and the piece
 * formats; `publish` does the checking and the write and returns the new version or an
 * error, which shows here, by the button.
 */
export function PublishPanel({
  id,
  publish,
  onPublished,
  onClose,
  placeholder = "Asks for more detail on places",
  consequence = "Publishing changes what every project’s next run says; the previous version stays available to make live again.",
}: {
  /** Unique per editor, for the note field's id. */
  id: string;
  publish: (note: string) => Promise<{ ok: true; version: number } | { ok: false; error: string }>;
  onPublished: (version: number) => void;
  onClose: () => void;
  placeholder?: string;
  consequence?: string;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await publish(note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onPublished(result.version);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-line bg-white p-4">
      <div>
        <Label htmlFor={`note-${id}`}>What changed? (optional)</Label>
        <Input
          id={`note-${id}`}
          value={note}
          maxLength={PROMPT_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
          disabled={pending}
        />
        <p className="mt-1 text-xs text-ink-400">One line, shown in History. {consequence}</p>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={run} disabled={pending} className="max-sm:min-h-12">
          {pending ? "Publishing…" : "Publish"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={pending}
          className="max-sm:min-h-12"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
