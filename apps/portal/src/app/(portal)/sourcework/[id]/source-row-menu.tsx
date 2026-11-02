"use client";

import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import { removeSourceFromProject } from "./source-actions";

/**
 * A source row's own actions on the project's Sources tab. Opening is the row link; the one thing
 * worth doing from the list is taking a source out of this project, which keeps the recording, its
 * transcript and its excerpts in the library (the destructive "Delete source…" stays on the source's
 * own screen, where its consequences are read in full).
 */
export function SourceRowMenu({
  projectId,
  sourceId,
  sourceTitle,
  href,
}: {
  projectId: string;
  sourceId: string;
  sourceTitle: string;
  href: string;
}) {
  const router = useRouter();
  return (
    <ActionMenu
      label={`Actions for ${sourceTitle}`}
      trigger="quiet"
      sheetHeading={<span className="font-semibold">{sourceTitle}</span>}
      items={[
        { label: "Open source", href },
        {
          label: "Remove from this project…",
          dividerBefore: true,
          onClick: async () => {
            const result = await removeSourceFromProject(projectId, sourceId);
            if (result.error) return { error: result.error };
            router.refresh();
          },
          confirm: {
            message: (
              <>
                Keeps the recording, its transcript and its excerpts. “{sourceTitle}” stays in the
                library and in any other project that uses it.
              </>
            ),
            confirmLabel: "Remove from this project",
          },
        },
      ]}
    />
  );
}
