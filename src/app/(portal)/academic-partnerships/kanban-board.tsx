"use client";

import { useState, useTransition } from "react";
import { KanbanBoardField } from "@/components/ui/kanban-board-field";
import { STAGES, STAGE_LABEL } from "@/lib/academic-partnerships/pipeline";
import type { SubmissionListItem } from "@/lib/academic-partnerships/queries";
import type { ApStage } from "@/lib/database.types";
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
  const [items, setItems] = useState(submissions);
  const [, startTransition] = useTransition();

  function move(submission: SubmissionListItem, stage: ApStage) {
    const previous = items;
    setItems((current) =>
      current.map((item) =>
        item.id === submission.id
          ? { ...item, stage, stage_changed_at: new Date().toISOString() }
          : item,
      ),
    );
    startTransition(async () => {
      const result = await setSubmissionStage(submission.id, stage);
      if (result.error) setItems(previous);
    });
  }

  return (
    <KanbanBoardField
      columns={COLUMNS}
      items={items}
      getColumn={(submission) => submission.stage}
      renderCard={(submission) => <SubmissionCard submission={submission} />}
      itemLabel={(submission) => `${submission.faculty_name}'s submission`}
      onMove={move}
    />
  );
}
