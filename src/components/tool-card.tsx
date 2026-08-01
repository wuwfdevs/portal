import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ToolIcon } from "@/components/tool-icon";
import { getToolCardState } from "@/lib/tool-card-state";
import type { ToolWithAccess } from "@/lib/tools";

export function ToolCard({ tool, hasAccess }: ToolWithAccess) {
  const { mode, statusLabel, actionLabel } = getToolCardState(tool.status, hasAccess);
  // Belt to listToolsForCurrentUser's braces: a proposed tool never becomes a
  // card, whichever list it reached this component through.
  if (mode === "hidden") return null;
  const isOpenable = mode === "open";
  const isRestricted = mode === "restricted";
  const isPlanned = tool.status === "planned";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded border bg-white p-5",
        isOpenable
          ? "border-brand-primary"
          : isPlanned
            ? "border-dashed border-line"
            : "border-line",
        !isOpenable && !isPlanned && "bg-panel-50",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded",
          isOpenable ? "bg-brand-surface text-brand-link" : "bg-panel-100 text-ink-400",
        )}
      >
        <ToolIcon toolKey={tool.key} />
      </div>
      <div
        className={cn(
          "font-serif text-[17px] font-bold",
          isOpenable ? "text-ink-900" : "text-ink-700",
        )}
      >
        {tool.name}
      </div>
      <p className="flex-1 text-[13px] leading-relaxed text-ink-500">{tool.description}</p>
      <Badge variant={isOpenable ? "accent" : "muted"}>{statusLabel}</Badge>

      {isOpenable && (
        <a
          href={tool.route}
          className="mt-1 flex items-center justify-center gap-1.5 rounded bg-brand-primary py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
        >
          {actionLabel}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}

      {isRestricted && (
        <p className="mt-1 rounded bg-panel-50 px-3 py-2 text-xs text-ink-400">
          Contact an administrator to request access.
        </p>
      )}

      {mode === "unavailable" && (
        <Link
          href={tool.route}
          className="mt-1 flex items-center justify-center rounded border border-line py-2.5 text-sm font-bold text-ink-500 hover:bg-panel-50"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
