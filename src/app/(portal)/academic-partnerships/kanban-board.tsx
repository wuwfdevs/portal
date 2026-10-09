"use client";

import { Alert } from "@/components/ui/alert";
import { KanbanBoardField } from "@/components/ui/kanban-board-field";
import { STAGES, STAGE_LABEL } from "@/lib/academic-partnerships/pipeline";
import type { SubmissionListItem } from "@/lib/academic-partnerships/queries";
import type { ApStage } from "@/lib/database.types";
import { useOptimisticList } from "@/lib/use-optimistic-list";
import { setSubmissionStage } from "./actions";
import { SubmissionCard } from "./submission-card";

const COLUMNS = STAGES.map((stage) => ({ id: stage, label: STAGE_LABEL[stage] }));

/**
 * The pipeline board. Cards move *between* columns (a stage change), not to a
 * position within one, and to any stage — so this is the generic
 * components/ui/kanban-board.tsx with no `targetsFor`. See
 * docs/academic-partnerships-design.md §3 for why @dnd-kit/core is the one
 * dependency this module adds. This component owns the items, the optimistic
 * stage update, and the rollback when the action fails.
 */
export function KanbanBoard({ submissions }: { submissions: SubmissionListItem[] }) {
  const { items, apply, error } = useOptimisticList(submissions, { getId: (item) => item.id });

  function move(submission: SubmissionListItem, stage: ApStage) {
    apply(submission.id, { stage, stage_changed_at: new Date().toISOString() }, () =>
      setSubmissionStage(submission.id, stage),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      <KanbanBoardField
        columns={COLUMNS}
        items={items}
        getColumn={(submission) => submission.stage}
        renderCard={(submission) => <SubmissionCard submission={submission} />}
        itemLabel={(submission) => `${submission.faculty_name}'s submission`}
        onMove={move}
      />
    </div>
  );
}
