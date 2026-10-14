"use client";

import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  deletionConfirmLabel,
  previewList,
  type DeletionPlan,
} from "@/lib/transcription/project-deletion";
import { deleteProject } from "../actions";
import { pluralize } from "@/lib/format";

/**
 * The project's own actions, in the page header's ⋮ menu. Deleting is the rare one, so it sits
 * behind the menu rather than in a Danger zone under every tab, and it is offered only to the
 * person who started the project (`plan` is null for everyone else). Its confirm step names what
 * goes and what stays: sources only this project uses are removed with their transcripts and
 * excerpts, and ones another project also uses stay in the library. Long lists show five by title
 * and fold the rest into a count, so a 30-source warning is as readable as a 1-source one.
 */
export function ProjectActionsMenu({
  projectId,
  projectTitle,
  editHref,
  plan,
}: {
  projectId: string;
  projectTitle: string;
  /** The project screen with its title and background open for editing. */
  editHref: string;
  plan: DeletionPlan | null;
}) {
  const router = useRouter();

  return (
    <ActionMenu
      label="Project actions"
      sheetHeading={<span className="font-semibold">{projectTitle}</span>}
      items={[
        { label: "Edit title and background", href: editHref },
        ...(plan
          ? [
              {
                label: "Delete project…",
                variant: "danger" as const,
                dividerBefore: true,
                onClick: async () => {
                  const result = await deleteProject(projectId);
                  if (result.error) return result;
                  router.push("/sourcework");
                },
                confirm: {
                  message: <DeleteMessage projectTitle={projectTitle} plan={plan} />,
                  confirmLabel: deletionConfirmLabel(plan),
                },
              },
            ]
          : []),
      ]}
    />
  );
}

function DeleteMessage({ projectTitle, plan }: { projectTitle: string; plan: DeletionPlan }) {
  const removed = previewList(plan.removed);
  const kept = previewList(plan.kept);
  return (
    <div className="flex flex-col gap-3 text-left">
      <p>
        <strong>This can’t be undone.</strong> Deleting <strong>{projectTitle}</strong> removes the
        project and its notes.
      </p>
      {plan.removed.length === 0 ? (
        <p>It has no sources of its own, so nothing else goes.</p>
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
  );
}
