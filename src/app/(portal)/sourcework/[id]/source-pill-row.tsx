"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ProjectSourceSummary, ProjectStatus } from "@/lib/transcription/projects";
import { AttachSourceModal } from "./attach-source-modal";

const STATUS_DOT: Record<ProjectStatus, string> = {
  ready: "bg-brand-primary",
  uploading: "bg-ink-400",
  processing: "bg-ink-400",
  failed: "bg-danger",
};

/**
 * One pill per source this project references, plus a way to attach another
 * (docs/sourcework-design.md §7.2). Inert-looking with the one source every
 * project has today — that's deliberate, so this doesn't need to be rebuilt
 * the day a second source gets attached.
 */
export function SourcePillRow({
  projectId,
  sources,
  activeSourceId,
}: {
  projectId: string;
  sources: ProjectSourceSummary[];
  activeSourceId: string | null;
}) {
  const router = useRouter();
  const [isPicking, setIsPicking] = useState(false);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {sources.map((s) => {
        const isActive = s.sourceId === activeSourceId;
        return (
          <Link
            key={s.sourceId}
            href={`/sourcework/${projectId}?source=${s.sourceId}`}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isActive
                ? "border-brand-primary bg-brand-surface text-brand-link"
                : "border-line bg-white text-ink-500 hover:text-ink-700"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
            {s.source.title}
          </Link>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsPicking(true)}
        className="px-3 py-1.5 text-xs"
      >
        + Reference another source
      </Button>
      {isPicking && (
        <AttachSourceModal
          projectId={projectId}
          onClose={() => setIsPicking(false)}
          onAttached={() => {
            setIsPicking(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
