"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PROMPT_NOTE_MAX, validatePromptBody, type PromptSlot } from "@/lib/sourcework/prompts";
import { publishPrompt } from "./actions";

/**
 * "Publish…": asks for a one-line note and makes the text the slot's next
 * version. `getBody` returns the text to publish (the editor flushes its
 * autosave first); the body is checked here too so the error sits by the text.
 */
export function PublishPanel({
  slot,
  getBody,
  onPublished,
  onClose,
}: {
  slot: PromptSlot;
  getBody: () => Promise<string> | string;
  onPublished: (version: number) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function publish() {
    setError(null);
    startTransition(async () => {
      const body = await getBody();
      const checked = validatePromptBody(slot, body);
      if (!checked.ok) {
        setError(checked.error);
        return;
      }
      const result = await publishPrompt({ slot, body: checked.body, note });
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
        <Label htmlFor={`note-${slot}`}>What changed? (optional)</Label>
        <Input
          id={`note-${slot}`}
          value={note}
          maxLength={PROMPT_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Asks for more detail on places"
          disabled={pending}
        />
        <p className="mt-1 text-xs text-ink-400">
          One line, shown in History. Publishing changes what every project&rsquo;s next run says;
          the previous version stays available to make live again.
        </p>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={publish} disabled={pending} className="max-sm:min-h-12">
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
