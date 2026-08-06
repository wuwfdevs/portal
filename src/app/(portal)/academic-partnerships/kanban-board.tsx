"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/input";
import { STAGES, STAGE_LABEL } from "@/lib/academic-partnerships/pipeline";
import type { SubmissionListItem } from "@/lib/academic-partnerships/queries";
import type { ApStage } from "@/lib/database.types";
import { setSubmissionStage } from "./actions";
import { SubmissionCard } from "./submission-card";

/**
 * The pipeline board. Cards move *between* columns (a stage change), not to a
 * position within one, so plain useDraggable/useDroppable is enough —
 * @dnd-kit/sortable is not needed. See docs/academic-partnerships-design.md
 * §3 for why this is the one new dependency this module adds.
 *
 * Every card also carries a "Move to…" <select>, always visible, never a
 * fallback bolted on for compliance: it is how a keyboard or screen-reader
 * user, or anyone on a touch device where drag is unreliable, moves a card
 * at all. A native <select> needs no JavaScript sensor to work, so it stays
 * even though @dnd-kit's own keyboard sensor also supports dragging. It's
 * shrink-wrapped (the wrapping <label> is w-max, not the <select> itself —
 * overriding the select's own w-full via a same-property className doesn't
 * reliably win the cascade without tailwind-merge, which this repo doesn't
 * use) so it reads as a small utility control rather than a full-width box
 * repeated under every card.
 */
export function KanbanBoard({ submissions }: { submissions: SubmissionListItem[] }) {
  const [items, setItems] = useState(submissions);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function move(id: string, stage: ApStage) {
    const previous = items;
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, stage, stage_changed_at: new Date().toISOString() } : item,
      ),
    );
    startTransition(async () => {
      const result = await setSubmissionStage(id, stage);
      if (result.error) setItems(previous);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const stage = over.id as ApStage;
    const submission = items.find((item) => item.id === active.id);
    if (!submission || submission.stage === stage) return;
    move(String(active.id), stage);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            items={items.filter((item) => item.stage === stage)}
            onMove={move}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  stage,
  items,
  onMove,
}: {
  stage: ApStage;
  items: SubmissionListItem[];
  onMove: (id: string, stage: ApStage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded border border-line bg-panel-50 p-2.5",
        isOver && "border-brand-primary bg-brand-surface/40",
      )}
    >
      <h2 className="flex items-center justify-between px-0.5 text-xs font-bold uppercase tracking-wide text-ink-500">
        {STAGE_LABEL[stage]}
        <span className="font-normal text-ink-400">{items.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="rounded border border-dashed border-line px-2.5 py-3 text-center text-xs text-ink-400">
            Empty
          </p>
        ) : (
          items.map((item) => <DraggableCard key={item.id} submission={item} onMove={onMove} />)
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  submission,
  onMove,
}: {
  submission: SubmissionListItem;
  onMove: (id: string, stage: ApStage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: submission.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...attributes}
      {...listeners}
      aria-label={`${submission.faculty_name}'s submission. Press space to pick up and arrow keys to move between columns, or use the Move to menu below.`}
      // Draggable from anywhere on the card, not just a handle —
      // PointerSensor's activationConstraint (distance: 6, set in
      // KanbanBoard) is what lets a plain click still reach the <Link>
      // inside SubmissionCard: a pointerdown followed by only a few pixels
      // of movement never crosses the threshold to become a drag, so the
      // click passes through untouched. dnd-kit's own attributes make this
      // div a second, standard keyboard-drag entry point (Space to pick up,
      // arrow keys to move, Space to drop); the "Move to" select below is
      // the primary accessible path regardless of whether that works for a
      // given screen reader.
      className={cn(
        "touch-none rounded focus:outline-none focus:ring-2 focus:ring-brand-surface",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
      )}
    >
      <div aria-hidden="true" className="px-0.5 pb-1 text-ink-300">
        ⠿
      </div>
      <SubmissionCard submission={submission} />
      <label className="mt-1 block w-max">
        <span className="sr-only">Move {submission.faculty_name}&apos;s submission to</span>
        <Select
          value={submission.stage}
          onChange={(event) => onMove(submission.id, event.target.value as ApStage)}
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
