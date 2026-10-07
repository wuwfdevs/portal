"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { KanbanBoardProps } from "@/components/ui/kanban-board";

// The only thing that should import kanban-board.tsx. next/dynamic with
// ssr: false keeps it off the server render — @dnd-kit's generated ids come
// from a module-level counter that isn't synchronized between server and
// client, which is a real hydration mismatch otherwise. Mirrors
// rich-text-field.tsx's wrapper for the same reason.
const Board = dynamic(() => import("@/components/ui/kanban-board").then((m) => m.KanbanBoard), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((column) => (
        <div key={column} className="h-64 animate-pulse rounded border border-line bg-panel-50" />
      ))}
    </div>
  ),
}) as unknown as ComponentType<KanbanBoardProps<{ id: string }, string>>;

export function KanbanBoardField<T extends { id: string }, C extends string>(
  props: KanbanBoardProps<T, C>,
) {
  return <Board {...(props as unknown as KanbanBoardProps<{ id: string }, string>)} />;
}
