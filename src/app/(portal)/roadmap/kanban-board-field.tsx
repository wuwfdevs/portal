"use client";

import dynamic from "next/dynamic";
import type { PostSummary } from "@/lib/roadmap/queries";

// The only thing that should import kanban-board.tsx directly. next/dynamic
// with ssr: false keeps it off the server render entirely — @dnd-kit
// generates internal ids (aria-describedby) from a module-level counter that
// isn't synchronized between the server render and the client's first
// render, which produces a real "server/client attribute mismatch" hydration
// warning otherwise. Mirrors academic-partnerships/kanban-board-field.tsx's
// wrapper for the same reason.
const RoadmapKanban = dynamic(
  () => import("./kanban-board").then((module) => module.RoadmapKanban),
  {
    ssr: false,
    loading: () => (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[0, 1, 2, 3, 4, 5].map((column) => (
          <div
            key={column}
            className="h-64 w-64 shrink-0 animate-pulse rounded border border-line bg-panel-50"
          />
        ))}
      </div>
    ),
  },
);

export function RoadmapKanbanField({ posts }: { posts: PostSummary[] }) {
  return <RoadmapKanban posts={posts} />;
}
