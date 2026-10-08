"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { TextLink } from "@/components/ui/primary-link";
import { formatDuration } from "@/lib/transcription/media";
import { SOURCE_KIND_LABEL, type ProjectStatus } from "@/lib/transcription/status";
import type { SwSourceKind } from "@/lib/database.types";
import { AddSourceModal } from "./add-source-modal";

export interface SwitcherSource {
  sourceId: string;
  title: string;
  kind: SwSourceKind;
  status: ProjectStatus;
  durationMs: number | null;
  pageCount: number | null;
}

const STATUS_HINT: Partial<Record<ProjectStatus, string>> = {
  failed: "Failed",
  uploading: "Uploading",
};

function optionFor(source: SwitcherSource): SearchableOption {
  const length =
    source.kind === "document"
      ? source.pageCount
        ? `${source.pageCount} page${source.pageCount === 1 ? "" : "s"}`
        : null
      : source.durationMs
        ? formatDuration(source.durationMs)
        : null;
  return {
    id: source.sourceId,
    label: source.title,
    hint: [SOURCE_KIND_LABEL[source.kind], length, STATUS_HINT[source.status]]
      .filter(Boolean)
      .join(" · "),
  };
}

/**
 * The project's sources as one searchable picker plus previous/next, instead
 * of a row of tabs or a card per source: the same control reads the same with
 * two sources or forty. The picked source is the URL (`?source=`), so Back
 * works, a source can be linked to, and the page has no view state of its own.
 */
export function SourceSwitcher({
  projectId,
  sources,
  activeSourceId,
  excerptsView,
}: {
  projectId: string;
  sources: SwitcherSource[];
  activeSourceId: string | null;
  /** True while showing the project-wide excerpts instead of one source. */
  excerptsView: boolean;
}) {
  const router = useRouter();
  const options = useMemo(() => sources.map(optionFor), [sources]);
  const index = sources.findIndex((source) => source.sourceId === activeSourceId);
  const hrefFor = (sourceId: string) => `/sourcework/${projectId}?source=${sourceId}`;
  const previous = index > 0 ? sources[index - 1] : null;
  const next = index >= 0 && index < sources.length - 1 ? sources[index + 1] : null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-line pb-4">
      <StepLink href={previous ? hrefFor(previous.sourceId) : null} label="Previous source">
        ←
      </StepLink>
      <label htmlFor="source-switcher" className="sr-only">
        Source
      </label>
      <SearchableSelect
        id="source-switcher"
        name="source"
        options={options}
        value={excerptsView ? "" : (activeSourceId ?? "")}
        placeholder={excerptsView ? "Choose a source" : "Find a source"}
        emptyMessage="No source matches."
        className="w-full min-w-0 sm:w-96"
        onChange={(sourceId) => {
          if (sourceId && sourceId !== activeSourceId) router.push(hrefFor(sourceId));
        }}
      />
      <StepLink href={next ? hrefFor(next.sourceId) : null} label="Next source">
        →
      </StepLink>
      <span className="text-[13px] text-ink-500">
        {index >= 0 && !excerptsView
          ? `Source ${index + 1} of ${sources.length}`
          : `${sources.length} sources`}
      </span>
      <span className="flex-1" />
      <AddSourceButton projectId={projectId} hasSources />
      {excerptsView ? (
        <TextLink
          href={`/sourcework/${projectId}${activeSourceId ? `?source=${activeSourceId}` : ""}`}
        >
          ← Back to the source
        </TextLink>
      ) : (
        <TextLink href={`/sourcework/${projectId}?view=excerpts`}>All excerpts</TextLink>
      )}
    </div>
  );
}

function StepLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const classes =
    "inline-flex h-9 w-9 items-center justify-center rounded border border-line text-sm font-semibold";
  if (!href) {
    return (
      <span aria-disabled="true" className={`${classes} cursor-default text-ink-400`}>
        <span className="sr-only">{label} (none)</span>
        <span aria-hidden="true">{children}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${classes} text-ink-700 hover:border-brand-primary hover:text-brand-link`}
    >
      {children}
    </Link>
  );
}

/** "+ Add source" and its dialog, shared by the switcher and the empty project. */
export function AddSourceButton({
  projectId,
  hasSources,
  primary = false,
}: {
  projectId: string;
  hasSources: boolean;
  primary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={primary ? "primary" : "secondary"}
        size={primary ? "md" : "sm"}
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        {primary ? "Add the first source" : "+ Add source"}
      </Button>
      {open && (
        <AddSourceModal
          projectId={projectId}
          hasSources={hasSources}
          onClose={() => setOpen(false)}
          onDone={(sourceId) => {
            setOpen(false);
            router.push(`/sourcework/${projectId}?source=${sourceId}`);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
