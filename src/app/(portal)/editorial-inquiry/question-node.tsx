"use client";

import { cn } from "@/lib/cn";
import {
  labelForDepth,
  labelForDiagnosis,
  type LaidOutQuestion,
} from "@/lib/editorial-inquiry/tree";

export const NODE_WIDTH = 240;

interface QuickAction {
  key: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  /** Position of this button within the fan, relative to the trigger's center. */
  offset: { x: number; y: number };
  tone: "blue" | "danger" | "neutral";
}

function BranchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function DrillDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5"
    >
      <path d="M7 8l5 5 5-5" />
      <path d="M7 14l5 5 5-5" />
    </svg>
  );
}

function DiscussIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5"
    >
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
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
      className="h-3.5 w-3.5"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const TONE_CLASSES: Record<QuickAction["tone"], string> = {
  blue: "bg-brand-surface text-brand-link",
  danger: "bg-white text-danger border border-danger",
  neutral: "bg-panel-100 text-ink-400",
};

export interface QuestionNodeProps {
  node: LaidOutQuestion;
  selected: boolean;
  contextCount: number;
  pending: "branch" | "drilldown" | "evaluate" | null;
  onSelect: () => void;
  onDragStart: (event: React.MouseEvent) => void;
  onBranch: () => void;
  onDrillDown: () => void;
  onReject: () => void;
  onDiscuss: () => void;
  canBranch: boolean;
  canDrillDown: boolean;
  canReject: boolean;
}

export function QuestionNode({
  node,
  selected,
  contextCount,
  pending,
  onSelect,
  onDragStart,
  onBranch,
  onDrillDown,
  onReject,
  onDiscuss,
  canBranch,
  canDrillDown,
  canReject,
}: QuestionNodeProps) {
  const isRoot = node.depth === 0;
  const isPromoted = node.status === "promoted";
  const badgeLabel = isPromoted ? "Story question" : labelForDepth(node.depth);
  const showBadge = isPromoted || node.depth <= 1;

  const actions: QuickAction[] = [
    {
      key: "branch",
      title: "Branch: look for a different angle here",
      disabled: !canBranch,
      onClick: onBranch,
      icon: <BranchIcon />,
      offset: { x: 6, y: -46 },
      tone: canBranch ? "blue" : "neutral",
    },
    {
      key: "drill",
      title: "Drill down into this question",
      disabled: !canDrillDown,
      onClick: onDrillDown,
      icon: <DrillDownIcon />,
      offset: { x: 38, y: -22 },
      tone: canDrillDown ? "blue" : "neutral",
    },
    {
      key: "discuss",
      title: "Discuss this question",
      disabled: false,
      onClick: onDiscuss,
      icon: <DiscussIcon />,
      offset: { x: 38, y: 22 },
      tone: "neutral",
    },
    {
      key: "reject",
      title: "Reject this question",
      disabled: !canReject,
      onClick: onReject,
      icon: <RejectIcon />,
      offset: { x: 6, y: 46 },
      tone: canReject ? "danger" : "neutral",
    },
  ];

  return (
    <div
      className="group/fan absolute"
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: node.height }}
      onMouseDown={onDragStart}
    >
      <button
        type="button"
        onClick={onSelect}
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

      {/* Hover-revealed radial quick-menu — always positioned, toggled by opacity/pointer-events so no per-node JS hover state is needed. */}
      <div
        className="pointer-events-none absolute top-1/2 right-[-90px] z-[3] h-[104px] w-[90px] -translate-y-1/2 opacity-0 transition-opacity group-hover/fan:pointer-events-auto group-hover/fan:opacity-100 group-focus-within/fan:pointer-events-auto group-focus-within/fan:opacity-100"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="absolute top-1/2 left-[10px] flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-sm text-ink-500 shadow-sm">
          +
        </div>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            title={action.title}
            aria-label={action.title}
            disabled={action.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!action.disabled) action.onClick();
            }}
            className={cn(
              "absolute top-1/2 left-[10px] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full shadow-sm",
              action.disabled && "cursor-not-allowed opacity-60",
              !action.disabled && TONE_CLASSES[action.tone],
              action.disabled && TONE_CLASSES.neutral,
            )}
            style={{
              transform: `translate(${action.offset.x}px, calc(-50% + ${action.offset.y}px))`,
            }}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
