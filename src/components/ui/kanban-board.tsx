"use client";

import type { ReactNode } from "react";
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

export interface KanbanColumn<C extends string> {
  id: C;
  label: string;
}

export interface KanbanBoardProps<T extends { id: string }, C extends string> {
  columns: KanbanColumn<C>[];
  items: T[];
  getColumn: (item: T) => C;
  renderCard: (item: T) => ReactNode;
  /** Plain-text name of a card, for its drag and "Move to" labels. */
  itemLabel: (item: T) => string;
  /**
   * Called for every requested move, drag or select. The parent owns the
   * items (so it can update optimistically and roll back) and is where any
   * rule about legal moves, or a prompt before one, belongs.
   */
  onMove: (item: T, to: C) => void;
  /** Columns the card may move to; defaults to every column. The current column is always listed. */
  targetsFor?: (item: T) => C[];
  emptyText?: (column: KanbanColumn<C>) => string;
}

/**
 * A drag-and-drop board whose cards move *between* columns, not to a position
 * within one — so plain useDraggable/useDroppable is enough and
 * @dnd-kit/sortable is not needed. Every card also carries a "Move to…"
 * <select>, always visible: it is how a keyboard or screen-reader user, or
 * anyone on a touch device where drag is unreliable, moves a card at all.
 *
 * Import this only through kanban-board-field.tsx: @dnd-kit generates ids from
 * a counter that isn't synchronized between server and client render, which
 * produces a real hydration mismatch if this is server-rendered.
 */
export function KanbanBoard<T extends { id: string }, C extends string>({
  columns,
  items,
  getColumn,
  renderCard,
  itemLabel,
  onMove,
  targetsFor,
  emptyText,
}: KanbanBoardProps<T, C>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const item = items.find((candidate) => candidate.id === String(active.id));
    const to = over.id as C;
    if (!item || getColumn(item) === to) return;
    onMove(item, to);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => {
          const columnItems = items.filter((item) => getColumn(item) === column.id);
          return (
            <Column key={column.id} column={column} count={columnItems.length}>
              {columnItems.length === 0 ? (
                <p className="rounded border border-dashed border-line px-2.5 py-3 text-center text-xs text-ink-400">
                  {emptyText ? emptyText(column) : "Empty"}
                </p>
              ) : (
                columnItems.map((item) => (
                  <DraggableCard
                    key={item.id}
                    id={item.id}
                    label={itemLabel(item)}
                    current={column.id}
                    columns={columns}
                    targets={targetsFor ? targetsFor(item) : undefined}
                    onMove={(to) => onMove(item, to)}
                  >
                    {renderCard(item)}
                  </DraggableCard>
                ))
              )}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column<C extends string>({
  column,
  count,
  children,
}: {
  column: KanbanColumn<C>;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded border border-line bg-panel-50 p-2.5",
        isOver && "border-brand-primary bg-brand-surface/40",
      )}
    >
      <h2 className="flex items-center justify-between px-0.5 text-xs font-bold uppercase tracking-wide text-ink-500">
        {column.label}
        <span className="font-normal text-ink-400">{count}</span>
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DraggableCard<C extends string>({
  id,
  label,
  current,
  columns,
  targets,
  onMove,
  children,
}: {
  id: string;
  label: string;
  current: C;
  columns: KanbanColumn<C>[];
  targets?: C[];
  onMove: (to: C) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const options = columns.filter(
    (column) => column.id === current || !targets || targets.includes(column.id),
  );

  return (
    <div
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      {...attributes}
      {...listeners}
      aria-label={`${label}. Press space to pick up and arrow keys to move between columns, or use the Move to menu below.`}
      // Draggable from anywhere on the card, not just a handle. The pointer
      // sensor's distance constraint is what lets a plain click still reach a
      // <Link> inside the card: a pointerdown with only a few pixels of
      // movement never becomes a drag.
      className={cn(
        "touch-none rounded focus:outline-none focus:ring-2 focus:ring-brand-surface",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
      )}
    >
      <div aria-hidden="true" className="px-0.5 pb-1 text-ink-300">
        ⠿
      </div>
      {children}
      {options.length > 1 && (
        <label className="mt-1.5 block w-max">
          <span className="sr-only">Move {label} to</span>
          <Select
            compact
            value={current}
            onChange={(event) => onMove(event.target.value as C)}
            className="text-xs"
          >
            {options.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </Select>
        </label>
      )}
    </div>
  );
}
