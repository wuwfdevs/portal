"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
  deletionConfirmLabel,
  previewList,
  type DeletionPlan,
} from "@/lib/transcription/project-deletion";
import { deleteProject } from "./actions";
import { pluralize } from "@/lib/format";

/**
 * The portal's two-step Danger zone for deleting a project, with the second
 * step naming what goes and what stays: sources only this project uses are
 * removed with their transcripts and excerpts, and ones another project also
 * uses stay in the library. Long lists show five by title and fold the rest
 * into a count, so a 30-source warning is as readable as a 1-source one.
 */
export function DeleteProjectPanel({
  projectId,
  projectTitle,
  plan,
}: {
  projectId: string;
  projectTitle: string;
  plan: DeletionPlan;
}) {
  const router = useRouter();
  const removed = previewList(plan.removed);
  const kept = previewList(plan.kept);

  return (
    <ConfirmAction
      title="Danger zone"
      label="Delete this project"
      confirmLabel={deletionConfirmLabel(plan)}
      className="mt-10"
      message={
        <div className="flex flex-col gap-3 text-left">
          <p>
            Deleting <strong>{projectTitle}</strong> cannot be undone.
          </p>
          {plan.removed.length === 0 ? (
            <p>
              The project and its notes are removed. It has no sources of its own, so nothing else
              goes.
            </p>
          ) : (
            <div className="rounded border border-danger/30 bg-danger/[0.06] px-3 py-2">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-danger">
                Removed
              </div>
              <ul className="list-disc pl-5">
                {removed.shown.map((source) => (
                  <li key={source.id}>
                    <strong>{source.title}</strong>: the file, its transcript or text, and{" "}
                    {pluralize(source.excerptCount, "excerpt")}.
                  </li>
                ))}
                {removed.more > 0 && <li>and {removed.more} more sources like these</li>}
              </ul>
            </div>
          )}
          {plan.kept.length > 0 && (
            <div className="rounded border border-line bg-panel-50 px-3 py-2">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">
                Stays in the library
              </div>
              <ul className="list-disc pl-5">
                {kept.shown.map((source) => (
                  <li key={source.id}>
                    <strong>{source.title}</strong>, because another project also uses it
                  </li>
                ))}
                {kept.more > 0 && <li>and {kept.more} more</li>}
              </ul>
            </div>
          )}
        </div>
      }
      onConfirm={async () => {
        const result = await deleteProject(projectId);
        if (result.error) return result;
        router.push("/sourcework");
      }}
    />
  );
}
