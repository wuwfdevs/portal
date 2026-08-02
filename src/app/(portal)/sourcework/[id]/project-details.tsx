"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import { updateProjectDetails } from "../actions";

/**
 * The project's title and background, editable in place.
 *
 * The background is the only context this tool carries about a recording
 * (design doc §3G), and it used to be writable exactly once — at upload,
 * before anyone had listened to a second of the audio. Putting it here means
 * it gets written when a reporter actually knows what they recorded, which is
 * the difference between a field that's filled in and one that isn't.
 *
 * Collapsed by default: the workspace's job is the transcript, and this is a
 * thing you do once per project.
 */
export function ProjectDetails({
  projectId,
  title,
  description,
}: {
  projectId: string;
  title: string;
  description: string | null;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const form = event.currentTarget;
    const result = await updateProjectDetails({
      projectId,
      title: (form.elements.namedItem("title") as HTMLInputElement).value,
      description: (form.elements.namedItem("description") as HTMLTextAreaElement).value,
    });

    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIsOpen(false);
    router.refresh();
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs font-semibold text-brand-link"
      >
        {description ? "Edit details" : "Add background"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex max-w-xl flex-col gap-3">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={title} required disabled={isSaving} />
      </div>
      <div>
        <Label htmlFor="description">Background</Label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={description ?? ""}
          placeholder="What was this recording — whose meeting, what was on the agenda, who the voices are, why we were there."
          disabled={isSaving}
          className="w-full rounded border border-line px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface disabled:bg-panel-50 sm:text-sm"
        />
        <FieldHint>
          Shown on every excerpt and search result from this recording, and used to find them — someone
          searching &ldquo;county commission&rdquo; in two years reaches this audio because of what
          you write here.
        </FieldHint>
      </div>

      {error && <FieldError>{error}</FieldError>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save details"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIsOpen(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
