"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { deleteProject } from "./actions";

/**
 * Deleting a project takes the source recording, its transcript, and every
 * clip cut from it, and none of that comes back — so it asks first. Only
 * the uploader sees this at all (see deleteProject's ownership check).
 */
export function DeleteProjectButton({
  projectId,
  label = "Delete this project",
  warning = "This permanently deletes the recording, its transcript, and every clip made from it.",
}: {
  projectId: string;
  label?: string;
  warning?: string;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsConfirming(true)}
        className="mt-4"
      >
        {label}
      </Button>
    );
  }

  return (
    <form
      action={deleteProject}
      className="mt-4 rounded border border-danger/30 bg-danger/[0.04] p-3"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <p className="mb-2.5 text-xs leading-relaxed text-ink-700">{warning}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ConfirmButton />
        <Button type="button" variant="ghost" onClick={() => setIsConfirming(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-danger px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:bg-panel-100 disabled:text-ink-400"
    >
      {pending ? "Deleting…" : "Yes, delete permanently"}
    </button>
  );
}
