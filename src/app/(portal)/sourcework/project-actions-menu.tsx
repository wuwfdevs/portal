"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { deleteProject } from "./actions";

/**
 * The project's own action(s) — separate from anything scoped to one of its
 * sources (see SourceActionsMenu). Lives in the page header so it stays a
 * project-level control regardless of which source is on screen or what
 * state it's in, rather than being bolted onto whichever source's workspace
 * happens to be rendered — a project deletion isn't a "when you're looking
 * at this source" action, it's a "this project" one.
 *
 * Deleting a project takes the recording, its transcript, and every excerpt
 * cut from it, and none of that comes back — so it asks first. Only the
 * uploader sees this at all (see deleteProject's ownership check).
 */
export function ProjectActionsMenu({
  projectId,
  label,
  warning,
}: {
  projectId: string;
  label: string;
  warning: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <ActionMenu items={[{ label, onClick: () => setConfirming(true), variant: "danger" }]} />
      {confirming && (
        <form
          action={deleteProject}
          className="w-full max-w-xs rounded border border-danger/30 bg-danger/[0.04] p-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <p className="mb-2.5 text-left text-xs leading-relaxed text-ink-700">{warning}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <ConfirmButton />
          </div>
        </form>
      )}
    </div>
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
