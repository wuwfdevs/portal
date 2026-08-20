"use client";

import { cn } from "@/lib/cn";
import {
  labelForDepth,
  labelForDiagnosis,
  type LaidOutQuestion,
} from "@/lib/editorial-inquiry/tree";

export const NODE_WIDTH = 240;

/**
 * A rightward fork — the tree grows left-to-right, so growing a child reads
 * as forking right; the sibling button rotates it to point down, the
 * direction a new sibling appears in the layout.
 */
function ForkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={cn("h-3.5 w-3.5", className)}
    >
      <path d="M3 12h6" />
      <path d="M9 12c3 0 3-5 6-5h6" />
      <path d="M9 12c3 0 3 5 6 5h6" />
    </svg>
  );
}

function RejectIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3 w-3"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export interface QuestionNodeProps {
  node: LaidOutQuestion;
  selected: boolean;
  contextCount: number;
  pending: "drilldown" | "evaluate" | null;
  onSelect: () => void;
  onDragStart: (event: React.MouseEvent) => void;
  /** Grow a child beneath this node — a drilldown turn on this question. */
  onDrillDown: () => void;
  /** Grow a sibling below this node — the same drilldown turn, run on the parent. */
  onAddSibling: () => void;
  onReject: () => void;
  canDrillDown: boolean;
  canAddSibling: boolean;
  canReject: boolean;
}

export function QuestionNode({
  node,
  selected,
  contextCount,
  pending,
  onSelect,
  onDragStart,
  onDrillDown,
  onAddSibling,
  onReject,
  canDrillDown,
  canAddSibling,
  canReject,
}: QuestionNodeProps) {
  const isRoot = node.depth === 0;
  const isPromoted = node.status === "promoted";
  const badgeLabel = isPromoted ? "Story question" : labelForDepth(node.depth);
  const showBadge = isPromoted || node.depth <= 1;

  return (
    <div
      className="group/node absolute"
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: node.height }}
      onMouseDown={onDragStart}
    >
      <button
        type="button"
        onClick={(e) => {
          // The canvas's own background onClick deselects; without this the
          // same click bubbles up and clears the selection it just made.
          e.stopPropagation();
          onSelect();
        }}
        className={cn(
          "relative box-border w-full min-h-[92px] cursor-grab rounded p-3 text-left transition-shadow active:cursor-grabbing",
          isPromoted && "border-[1.5px] border-success-border bg-success-bg",
          !isPromoted && isRoot && "border-none bg-[#0F2235]",
          !isPromoted && !isRoot && "border border-line bg-white",
          selected && "ring-2 ring-brand-primary",
          pending !== null && "opacity-70",
        )}
      >
        {showBadge && (
          <div
            className={cn(
              "mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              isPromoted && "bg-success-border text-ink-900",
              !isPromoted && isRoot && "bg-white/15 text-white",
              !isPromoted && !isRoot && "bg-brand-surface text-brand-link",
            )}
          >
            {badgeLabel}
          </div>
        )}
        <div
          className={cn(
            "font-serif text-sm leading-snug",
            isRoot && !isPromoted && "text-white",
            !isRoot && "text-ink-900",
          )}
        >
          {node.text}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {node.diagnosisKind && (
            <span
              title={labelForDiagnosis(node.diagnosisKind)}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-success-bg text-[11px] font-bold text-brand-link"
            >
              !
            </span>
          )}
          {contextCount > 0 && (
            <span
              className={cn(
                "text-[11px]",
                isRoot && !isPromoted ? "text-white/70" : "text-ink-500",
              )}
            >
              {contextCount} {contextCount === 1 ? "note" : "notes"}
            </span>
          )}
          {pending && (
            <span
              className={cn(
                "text-[11px]",
                isRoot && !isPromoted ? "text-white/70" : "text-ink-500",
              )}
            >
              Thinking…
            </span>
          )}
        </div>
      </button>

      {/* Hover-revealed affordances, mindmap-style (the Whimsical pattern):
          a fork at the right edge grows a child beneath a LEAF node, a fork
          at the bottom edge grows a sibling below any non-root node — the
          same drilldown turn, referenced to this node or its parent — and
          reject is tucked in the top-right corner. Everything else lives in
          the inspector panel the node click opens. Toggled by
          opacity/pointer-events so no per-node JS hover state is needed;
          mousedown stops propagating so clicking one never starts a drag. */}
      {canDrillDown && (
        <button
          type="button"
          title="Drill down: grow the next question beneath this one"
          aria-label="Drill down: grow the next question beneath this one"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDrillDown();
          }}
          className="pointer-events-none absolute top-1/2 right-[-14px] z-[3] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-brand-surface text-brand-link opacity-0 shadow-sm transition-opacity group-hover/node:pointer-events-auto group-hover/node:opacity-100 group-focus-within/node:pointer-events-auto group-focus-within/node:opacity-100"
        >
          <ForkIcon />
        </button>
      )}
      {canAddSibling && (
        <button
          type="button"
          title="Add a sibling: a genuinely different question at this level"
          aria-label="Add a sibling: a genuinely different question at this level"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddSibling();
          }}
          className="pointer-events-none absolute bottom-[-14px] left-1/2 z-[3] flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-brand-surface text-brand-link opacity-0 shadow-sm transition-opacity group-hover/node:pointer-events-auto group-hover/node:opacity-100 group-focus-within/node:pointer-events-auto group-focus-within/node:opacity-100"
        >
          <ForkIcon className="rotate-90" />
        </button>
      )}
      {canReject && (
        <button
          type="button"
          title="Reject this question — hides it and everything under it, nothing is deleted"
          aria-label="Reject this question"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onReject();
          }}
          className="pointer-events-none absolute top-[-9px] right-[-9px] z-[3] flex h-6 w-6 items-center justify-center rounded-full border border-line bg-white text-ink-400 opacity-0 shadow-sm transition-opacity hover:border-danger hover:text-danger group-hover/node:pointer-events-auto group-hover/node:opacity-100 group-focus-within/node:pointer-events-auto group-focus-within/node:opacity-100"
        >
          <RejectIcon />
        </button>
      )}
    </div>
  );
}
