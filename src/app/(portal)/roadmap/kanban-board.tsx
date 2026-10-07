"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { KanbanBoardField } from "@/components/ui/kanban-board-field";
import { availableStatusActions, KANBAN_STATUSES, POST_STATUS_BADGE } from "@/lib/roadmap/posts";
import type { PostSummary } from "@/lib/roadmap/queries";
import type { RdPostStatus } from "@/lib/database.types";
import { movePostStatus } from "./actions";
import { RoadmapCard } from "./roadmap-card";

const COLUMNS = KANBAN_STATUSES.map((status) => ({
  id: status,
  label: POST_STATUS_BADGE[status].label,
}));

/**
 * The Roadmap tab's kanban board — curator-only, covers all six statuses
 * (KANBAN_STATUSES), not just the four "decided" ones the tab shows
 * everyone else: a curator is the one who moves a request out of Open or
 * Under review, so a board that only showed already-decided posts would
 * leave exactly that move stuck on the per-post curation panel. The board
 * itself is the generic components/ui/kanban-board.tsx; this component owns
 * what is Roadmap's own:
 *
 * Roadmap's status changes follow a real state machine
 * (availableStatusActions) rather than free movement to any column, so
 * `targetsFor` limits the legal columns and `requestMove` re-checks the
 * transition before committing — dropping on a column that isn't a legal
 * transition from the card's current status is a no-op. Dropping on Declined
 * opens a reason prompt instead of moving the card immediately — rd_posts
 * requires one (validateStatusChange), the same rule the post detail page's
 * curation panel enforces with its own decline form. The update is
 * optimistic and rolls back if the action fails.
 */
export function RoadmapKanban({ posts }: { posts: PostSummary[] }) {
  const [items, setItems] = useState(posts);
  const [, startTransition] = useTransition();
  const [pendingDecline, setPendingDecline] = useState<{ id: string; title: string } | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  function requestMove(post: PostSummary, status: RdPostStatus) {
    if (post.status === status) return;
    if (!availableStatusActions(post.status).includes(status)) return;
    if (status === "declined") {
      setDeclineError(null);
      setDeclineNote("");
      setPendingDecline({ id: post.id, title: post.title });
      return;
    }
    commit(post.id, status);
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

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      <KanbanBoardField
        columns={COLUMNS}
        items={items}
        getColumn={(post) => post.status}
        renderCard={(post) => <RoadmapCard post={post} />}
        itemLabel={(post) => post.title}
        onMove={requestMove}
        targetsFor={(post) => availableStatusActions(post.status)}
        emptyText={(column) => `Nothing ${column.label.toLowerCase()} right now.`}
      />

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
            <Button
              type="button"
              variant="secondary"
              className="text-danger"
              onClick={confirmDecline}
            >
              Decline
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
