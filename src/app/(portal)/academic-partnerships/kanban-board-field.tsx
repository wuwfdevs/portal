"use client";

import dynamic from "next/dynamic";
import type { SubmissionListItem } from "@/lib/academic-partnerships/queries";

// The only thing that should import kanban-board.tsx directly. next/dynamic
// with ssr: false keeps it off the server render entirely — @dnd-kit
// generates internal ids (aria-describedby) from a module-level counter that
// isn't synchronized between the server render and the client's first
// render, which produces a real "server/client attribute mismatch" hydration
// warning otherwise. There is no SEO or no-JS value in server-rendering a
// drag-and-drop board anyway. Mirrors rich-text-field.tsx's wrapper for the
// same reason (ProseMirror there, @dnd-kit here).
const KanbanBoard = dynamic(() => import("./kanban-board").then((module) => module.KanbanBoard), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((column) => (
        <div key={column} className="h-64 animate-pulse rounded border border-line bg-panel-50" />
      ))}
    </div>
  ),
});

export function KanbanBoardField({ submissions }: { submissions: SubmissionListItem[] }) {
  return <KanbanBoard submissions={submissions} />;
}
