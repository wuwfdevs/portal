"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/input";
import { isValidMoveDestination, type RelocatableItemKind } from "@/lib/log/mid-broadcast";
import type { LogContentType } from "@/lib/database.types";

/**
 * Relocating a rundown item — reordering within a break, or moving it to a
 * different one — as plain drag-and-drop, the same @dnd-kit/core +
 * @dnd-kit/sortable multi-container pattern dnd-kit's own docs use.
 * @dnd-kit/core alone (already a dependency, see the two kanban boards) only
 * covers moving *between* containers; reordering *within* one needs
 * @dnd-kit/sortable, which this module is what actually needs it for.
 *
 * Every item also carries an always-visible "Move to…" <select>, same
 * reasoning as academic-partnerships/kanban-board.tsx's: it's how a
 * keyboard or screen-reader user, or anyone on a touch device where drag is
 * unreliable, moves an item at all — not a fallback bolted on for
 * compliance, the primary path for a real share of hosts. The select is
 * coarser than drag (it always appends to the end of the target break,
 * where drag can drop anywhere) — matching the kanban board's own select,
 * which doesn't offer a position within a column either.
 */

export interface BreakBoardItem {
  id: string;
  kind: RelocatableItemKind | "underwriting_credit";
  contentType: LogContentType | null;
  draggable: boolean;
  label: string;
  node: ReactNode;
}

export interface BreakBoardBreak {
  id: string;
  scheduledAt: string;
  /** Plain-text label for the "Move to…" select's <option> — headerNode is a rendered node, not usable there. */
  label: string;
  permittedContentTypes: string[];
  allowMultiple: boolean;
  headerNode: ReactNode;
  statusNode: ReactNode;
  fillControlsNode: ReactNode;
  isCurrent: boolean;
  items: BreakBoardItem[];
}

export function RundownBreaksBoard({
  breaks: initialBreaks,
  live,
  nowISO,
  relocateItem,
}: {
  breaks: BreakBoardBreak[];
  live: boolean;
  nowISO: string;
  relocateItem: (
    itemId: string,
    destinationBreakId: string,
    orderedItemIds: string[],
  ) => Promise<{ error?: string }>;
}) {
  const itemsById = useMemo(() => {
    const map = new Map<string, BreakBoardItem>();
    for (const brk of initialBreaks) for (const item of brk.items) map.set(item.id, item);
    return map;
  }, [initialBreaks]);

  const [order, setOrder] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(initialBreaks.map((brk) => [brk.id, brk.items.map((item) => item.id)])),
  );
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function containerOf(itemId: string): string | undefined {
    return Object.keys(order).find((breakId) => order[breakId]!.includes(itemId));
  }

  function eligibleDestinations(itemId: string): BreakBoardBreak[] {
    const item = itemsById.get(itemId);
    const sourceBreakId = containerOf(itemId);
    if (!item || !sourceBreakId || item.kind === "underwriting_credit") return [];
    const kind: RelocatableItemKind = item.kind;
    const contentType = item.contentType;
    return initialBreaks.filter((brk) =>
      isValidMoveDestination(
        {
          id: brk.id,
          scheduled_at: brk.scheduledAt,
          permitted_content_types: brk.permittedContentTypes,
          allow_multiple: brk.allowMultiple,
          item_count: order[brk.id]?.length ?? 0,
        },
        sourceBreakId,
        kind,
        contentType,
        live ? nowISO : null,
      ),
    );
  }

  function moveItem(itemId: string, destinationBreakId: string, beforeItemId: string | null) {
    const previous = order;
    const sourceBreakId = containerOf(itemId);
    if (!sourceBreakId) return;
    if (sourceBreakId === destinationBreakId && beforeItemId === itemId) return;

    const next: Record<string, string[]> = { ...order };
    next[sourceBreakId] = next[sourceBreakId]!.filter((id) => id !== itemId);

    const target = sourceBreakId === destinationBreakId ? next[sourceBreakId]! : [...next[destinationBreakId]!];
    const insertAt = beforeItemId ? target.indexOf(beforeItemId) : target.length;
    target.splice(insertAt === -1 ? target.length : insertAt, 0, itemId);
    next[destinationBreakId] = target;
    setOrder(next);

    startTransition(async () => {
      const result = await relocateItem(itemId, destinationBreakId, next[destinationBreakId]!);
      if (result.error) setOrder(previous);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const overId = String(over.id);
    if (itemId === overId) return;

    const sourceBreakId = containerOf(itemId);
    const destinationBreakId = order[overId] ? overId : containerOf(overId);
    if (!sourceBreakId || !destinationBreakId) return;

    // A same-break reorder never needs the eligibility check below — the
    // item is already there, dropping doesn't add capacity pressure. A
    // cross-break drop does, and dnd-kit lets you drop onto another item's
    // position even in a break the eligibility check would reject (e.g.
    // already full, wrong content type) — the server would reject it too,
    // but checking here avoids the flash-then-revert.
    if (destinationBreakId !== sourceBreakId) {
      const eligible = eligibleDestinations(itemId).some((brk) => brk.id === destinationBreakId);
      if (!eligible) return;
    }

    const beforeItemId = order[overId] ? null : overId;
    moveItem(itemId, destinationBreakId, beforeItemId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <ol className="flex flex-col gap-4">
        {initialBreaks.map((brk) => {
          const itemIds = order[brk.id] ?? [];
          return (
            <BreakDropZone key={brk.id} brk={brk} itemIds={itemIds}>
              {itemIds.length > 0 && (
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-3 px-5 py-4">
                    {itemIds.map((itemId) => {
                      const item = itemsById.get(itemId);
                      if (!item) return null;
                      return (
                        <SortableItem
                          key={itemId}
                          item={item}
                          destinations={item.draggable ? eligibleDestinations(itemId) : []}
                          onMoveTo={(destinationBreakId) => moveItem(itemId, destinationBreakId, null)}
                        />
                      );
                    })}
                  </ul>
                </SortableContext>
              )}
              {brk.fillControlsNode}
            </BreakDropZone>
          );
        })}
      </ol>
    </DndContext>
  );
}

function BreakDropZone({
  brk,
  itemIds,
  children,
}: {
  brk: BreakBoardBreak;
  itemIds: string[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: brk.id, disabled: itemIds.length > 0 && !brk.allowMultiple });

  return (
    <li
      ref={setNodeRef}
      id={brk.isCurrent ? "current-break" : undefined}
      className={cn(
        brk.isCurrent ? "rounded border-2 border-brand-primary" : "rounded border border-line",
        isOver && "bg-brand-surface/30",
      )}
    >
      {brk.headerNode}
      {brk.statusNode}
      {children}
    </li>
  );
}

function SortableItem({
  item,
  destinations,
  onMoveTo,
}: {
  item: BreakBoardItem;
  destinations: BreakBoardBreak[];
  onMoveTo: (destinationBreakId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !item.draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("rounded border border-line/70 bg-panel-50/50 p-3", isDragging && "opacity-50")}
    >
      {item.draggable && (
        <div className="mb-1.5 flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder or move ${item.label}. Press space to pick up and arrow keys to move, or use the Move to menu.`}
            className="touch-none cursor-grab rounded px-1 text-ink-300 hover:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-surface active:cursor-grabbing"
          >
            ⠿
          </button>
          {destinations.length > 0 && (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Move {item.label} to</span>
              <Select
                value=""
                onChange={(event) => event.target.value && onMoveTo(event.target.value)}
                className="w-auto py-1 text-xs"
              >
                <option value="">Move to…</option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      )}
      {item.node}
    </li>
  );
}
