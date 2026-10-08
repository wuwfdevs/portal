"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import { reindexProjectSearch } from "../actions";
import { removeSourceFromProject, deleteSourceEntirely } from "./source-actions";
import { projectPath } from "@/lib/transcription/links";

/**
 * A source's own actions, on the source screen. Rebuild the search index, and
 * the two ways out, each with its consequence read in the menu itself
 * (ActionMenu's `confirm` step) rather than in a panel the page has to make
 * room for:
 *
 * - Remove from this project: detaches the source from the project it was
 *   opened from. Safe — the source and every other project's use of it are
 *   untouched. Only offered when there is a project to detach from.
 * - Delete: permanently deletes the source, its transcript and every excerpt
 *   made from it, in every project that references it.
 *
 * Rebuild search index is the Phase 5 backfill for sources transcribed before
 * search existed, or a manual re-run after a round of corrections. It reports
 * what actually happened, including the case that matters most — chunks built
 * but embeddings skipped — since silence there would look identical to success.
 */
export function SourceActionsMenu({
  projectId,
  sourceId,
  sourceTitle,
  otherProjectCount,
}: {
  /** The project this source was opened from; null when it wasn't (or is attached to none). */
  projectId: string | null;
  sourceId: string;
  sourceTitle: string;
  /** How many *other* projects also reference this source — shapes the consequence text. */
  otherProjectCount: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleReindex() {
    setMessage("Rebuilding search index…");
    const result = await reindexProjectSearch(projectId, sourceId);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    const chunks = result.chunks ?? 0;
    if (result.embeddingError) {
      setMessage(
        `Indexed ${chunks} passage${chunks === 1 ? "" : "s"} for keyword search, but topic search couldn't be built. It will retry on the next edit.`,
      );
    } else if (result.embedded) {
      setMessage(`Indexed ${chunks} passage${chunks === 1 ? "" : "s"}, ready to search.`);
    } else {
      setMessage(
        `Indexed ${chunks} passage${chunks === 1 ? "" : "s"} for keyword search. Topic search needs an embeddings key.`,
      );
    }
    router.refresh();
  }

  async function handleDetach() {
    if (!projectId) return { error: "This source isn't opened from a project." };
    const result = await removeSourceFromProject(projectId, sourceId);
    if (result.error) return { error: result.error };
    router.push(projectPath(projectId));
  }

  async function handleDeleteEntirely() {
    const result = await deleteSourceEntirely(sourceId);
    if (result.error) return { error: result.error };
    router.push(projectId ? projectPath(projectId) : "/sourcework?tab=sources");
  }

  const others =
    otherProjectCount > 0
      ? `${otherProjectCount} other project${otherProjectCount === 1 ? "" : "s"}`
      : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <ActionMenu
        label="Source actions"
        sheetHeading={<span className="font-semibold">{sourceTitle}</span>}
        items={[
          { label: "Rebuild search index", onClick: handleReindex },
          ...(projectId
            ? [
                {
                  label: "Remove from this project…",
                  dividerBefore: true,
                  onClick: handleDetach,
                  confirm: {
                    message: (
                      <>
                        Keeps the recording, its transcript and its excerpts. “{sourceTitle}” stays
                        in the library{others ? ` and in ${others}` : ""}.
                      </>
                    ),
                    confirmLabel: "Remove from this project",
                  },
                },
              ]
            : []),
          {
            label: "Delete source…",
            variant: "danger" as const,
            dividerBefore: !projectId,
            onClick: handleDeleteEntirely,
            confirm: {
              message: (
                <>
                  <strong>This can’t be undone.</strong> Permanently deletes “{sourceTitle}”, its
                  transcript, and every excerpt made from it
                  {others ? `, and removes it from ${others}` : ""}.
                </>
              ),
              confirmLabel: "Yes, delete permanently",
            },
          },
        ]}
      />
      {message && <span className="max-w-xs text-right text-xs text-ink-400">{message}</span>}
    </div>
  );
}
