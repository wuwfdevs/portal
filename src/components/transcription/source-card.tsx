import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatShortDate } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import {
  SOURCE_KIND_LABEL,
  projectStatusMap,
  type ProjectStatus,
} from "@/lib/transcription/status";
import type { SwSourceKind } from "@/lib/database.types";

import { pluralize } from "@/lib/format";
import type { ExtractionLine } from "@/lib/sourcework/run-state";

/** "Oct 7, 2026 · 22:52" or "Oct 7, 2026 · 14 pages": when it happened, then how long it is. */
export function formatSourceMeta(source: {
  kind: SwSourceKind;
  date: string;
  durationMs: number | null;
  pageCount: number | null;
}): string {
  const length =
    source.kind === "document"
      ? source.pageCount
        ? `${pluralize(source.pageCount, "page")}`
        : null
      : source.durationMs
        ? formatDuration(source.durationMs)
        : null;
  return [formatShortDate(source.date, { year: true }), length].filter(Boolean).join(" · ");
}

/**
 * One source as a card that opens it: its kind, its status, its title, what it
 * is, and a line of context (where it is used, how many excerpts). The source
 * library and a project's source list are the same thing seen from two places,
 * so they share this.
 */
export function SourceCard({
  href,
  kind,
  status,
  title,
  meta,
  footnote,
  extraction,
}: {
  href: string;
  kind: SwSourceKind;
  status: ProjectStatus;
  title: string;
  meta: string;
  footnote?: ReactNode;
  /** The data-point line under the meta, for a project that has research questions. */
  extraction?: ExtractionLine | null;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded border border-line bg-white p-4 hover:border-brand-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
          {SOURCE_KIND_LABEL[kind] ?? kind}
        </span>
        <StatusBadge map={projectStatusMap(kind)} value={status} />
      </div>
      <p className="font-semibold text-ink-900">{title}</p>
      <p className="text-xs text-ink-500">{meta}</p>
      {extraction && (
        <p className="text-xs text-ink-500">
          {extraction.text}
          {extraction.strong && (
            <strong className="font-semibold text-ink-900">{extraction.strong}</strong>
          )}
        </p>
      )}
      {footnote && <p className="text-xs text-ink-400">{footnote}</p>}
    </Link>
  );
}
