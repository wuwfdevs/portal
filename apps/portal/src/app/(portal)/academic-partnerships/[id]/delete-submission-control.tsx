"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteSubmission } from "../actions";

/**
 * Coordinator-only, permanent delete for one inquiry — a "danger zone"
 * control on the submission detail screen, not the kanban card: this is a
 * rarer, harder-to-reverse action than the ordinary stage/disposition moves
 * every member already has from the board, so it stays off a surface built
 * for quick drags. Two-step confirm before anything happens.
 */
export function DeleteSubmissionControl({
  submissionId,
  facultyName,
}: {
  submissionId: string;
  facultyName: string;
}) {
  const router = useRouter();

  return (
    <ConfirmAction
      title="Danger zone"
      label="Delete this inquiry"
      confirmLabel="Yes, delete permanently"
      message={
        <>
          This permanently deletes &ldquo;{facultyName}&rdquo;&apos;s inquiry, its notes, and its
          activity history. This can&apos;t be undone.
        </>
      }
      onConfirm={async () => {
        const result = await deleteSubmission(submissionId);
        if (result.error) return { error: result.error };
        router.push("/academic-partnerships");
      }}
    />
  );
}
