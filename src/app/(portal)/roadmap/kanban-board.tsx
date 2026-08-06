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
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { POST_STATUS_BADGE, ROADMAP_STATUSES, roadmapDropTargets } from "@/lib/roadmap/posts";
import type { PostSummary } from "@/lib/roadmap/queries";
import type { RdPostStatus } from "@/lib/database.types";
import { movePostStatus } from "./actions";
import { RoadmapCard } from "./roadmap-card";

/**
 * The Roadmap tab's kanban board — cards move *between* the four decided
 * columns (a status change), not to a position within one, so plain
 * useDraggable/useDroppable is enough, same as
 * academic-partnerships/kanban-board.tsx (@dnd-kit/core is already a
 * dependency for that reason; this is the second use, not a new one).
 *
 * Two things this board has that Academic Partnerships' doesn't, both
 * because Roadmap's status changes follow a real state machine
 * (availableStatusActions) rather than free movement to any column:
 * dropping on a column that isn't a legal transition from the card's
 * current status is a no-op (see roadmapDropTargets), and dropping on
 * Declined opens a reason prompt instead of moving the card immediately —
 * rd_posts requires one (validateStatusChange), the same rule the post
 * detail page's curation panel enforces with its own decline form.
 *
 * Every card also carries a "Move to…" <select>, always visible, never a
 * fallback bolted on for compliance: it is how a keyboard or
 * screen-reader user, or anyone on a touch device where drag is
 * unreliable, moves a card at all — same reasoning as the Academic
 * Partnerships board's select.
 */
export function RoadmapKanban({ posts }: { posts: PostSummary[] }) {
  const [items, setItems] = useState(posts);
  const [, startTransition] = useTransition();
  const [pendingDecline, setPendingDecline] = useState<{ id: string; title: string } | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function commit(id: string, status: RdPostStatus, note?: string) {
    const previous = items;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
    setError(null);
    startTransition(async () => {
      const result = await movePostStatus(id, status, note);
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function requestMove(id: string, status: RdPostStatus) {
    const post = items.find((item) => item.id === id);
    if (!post || post.status === status) return;
    if (!roadmapDropTargets(post.status).includes(status)) return;
    if (status === "declined") {
      setDeclineError(null);
      setDeclineNote("");
      setPendingDecline({ id: post.id, title: post.title });
      return;
    }
    commit(id, status);
  }

  function confirmDecline() {
    if (!pendingDecline) return;
    if (declineNote.trim() === "") {
      setDeclineError("Say why it is being declined.");
      return;
    }
    commit(pendingDecline.id, "declined", declineNote);
    setPendingDecline(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    requestMove(String(active.id), over.id as RdPostStatus);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded border border-danger/30 bg-danger/[0.04] px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ROADMAP_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              posts={items.filter((post) => post.status === status)}
              onMove={requestMove}
            />
          ))}
        </div>
      </DndContext>

      {pendingDecline && (
        <div className="rounded border border-danger/30 bg-danger/[0.04] p-3">
          <p className="mb-2 text-sm text-ink-700">
            Decline &ldquo;{pendingDecline.title}&rdquo;, with a reason
          </p>
          <Textarea
            value={declineNote}
            onChange={(event) => setDeclineNote(event.target.value)}
            rows={2}
            placeholder="Why not — and what to do instead, if there is something."
            autoFocus
          />
          {declineError && <p className="mt-1.5 text-xs text-danger">{declineError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPendingDecline(null);
                setDeclineError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="secondary" className="text-danger" onClick={confirmDecline}>
              Decline
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({
  status,
  posts,
  onMove,
}: {
  status: RdPostStatus;
  posts: PostSummary[];
  onMove: (id: string, status: RdPostStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded border border-line bg-panel-50 p-2.5",
        isOver && "border-brand-primary bg-brand-surface/40",
      )}
    >
      <h2 className="flex items-center justify-between px-0.5 text-xs font-bold uppercase tracking-wide text-ink-500">
        {POST_STATUS_BADGE[status].label}
        <span className="font-normal text-ink-400">{posts.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {posts.length === 0 ? (
          <p className="rounded border border-dashed border-line px-2.5 py-3 text-center text-xs text-ink-400">
            Nothing {POST_STATUS_BADGE[status].label.toLowerCase()} right now.
          </p>
        ) : (
          posts.map((post) => <DraggableCard key={post.id} post={post} onMove={onMove} />)
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  post,
  onMove,
}: {
  post: PostSummary;
  onMove: (id: string, status: RdPostStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });
  const targets = roadmapDropTargets(post.status);

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...attributes}
      {...listeners}
      aria-label={`${post.title}. Press space to pick up and arrow keys to move between columns, or use the Move to menu below.`}
      // Draggable from anywhere on the card, not just a handle — the same
      // pointerdown/small-movement reasoning as
      // academic-partnerships/kanban-board.tsx's DraggableCard: a plain tap
      // never crosses the distance threshold, so RoadmapCard's <Link> still
      // works underneath.
      className={cn(
        "touch-none rounded focus:outline-none focus:ring-2 focus:ring-brand-surface",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
      )}
    >
      <div aria-hidden="true" className="px-0.5 pb-1 text-ink-300">
        ⠿
      </div>
      <RoadmapCard post={post} />
      {targets.length > 0 && (
        <label className="mt-1.5 block">
          <span className="sr-only">Move &ldquo;{post.title}&rdquo; to</span>
          <Select
            value={post.status}
            onChange={(event) => onMove(post.id, event.target.value as RdPostStatus)}
            className="text-xs"
          >
            <option value={post.status}>{POST_STATUS_BADGE[post.status].label}</option>
            {targets.map((status) => (
              <option key={status} value={status}>
                {POST_STATUS_BADGE[status].label}
              </option>
            ))}
          </Select>
        </label>
      )}
    </div>
  );
}
