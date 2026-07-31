import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getSourceDetail } from "@/lib/transcription/projects";
import { listExcerptsForSource } from "@/lib/transcription/clips";
import { formatBytes, formatDuration } from "@/lib/transcription/media";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type {
  SwSourceKind,
  SwSourceStatus,
  SwRepresentationKind,
  SwRepresentationStatus,
} from "@/lib/database.types";

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
};

const STATUS_BADGE: Record<SwSourceStatus, { label: string; variant: BadgeVariant }> = {
  uploading: { label: "Uploading", variant: "neutral" },
  ready: { label: "Ready", variant: "accent" },
  failed: { label: "Failed", variant: "danger" },
};

const REPRESENTATION_KIND_LABEL: Record<SwRepresentationKind, string> = {
  transcript: "Transcript",
  ocr_text: "OCR text",
  translated_text: "Translation",
};

const REPRESENTATION_STATUS_BADGE: Record<
  SwRepresentationStatus,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "Pending", variant: "neutral" },
  processing: { label: "Processing", variant: "neutral" },
  ready: { label: "Ready", variant: "accent" },
  failed: { label: "Failed", variant: "danger" },
};

/**
 * One source, independent of any project (docs/sourcework-design.md §7.2) —
 * a new way to reach a recording that doesn't route through a project's
 * transcript view first, since a source can now belong to more than one.
 */
export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireToolAccess("transcription");
  const { id } = await params;

  const source = await getSourceDetail(id);
  if (!source) notFound();

  const excerpts = await listExcerptsForSource(id);
  const statusBadge = STATUS_BADGE[source.status] ?? STATUS_BADGE.uploading;
  // Any project that references this source shows the same pill-switched
  // workspace; the first one (oldest attached) is as good a link target as
  // any, since ?source= puts the reader on this source's pill regardless of
  // which project got them there.
  const linkProjectId = source.projects[0]?.id ?? null;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/sourcework?tab=sources" className="text-xs font-semibold text-brand-link">
          ← Back to sources
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">
            {KIND_LABEL[source.kind] ?? source.kind}
          </span>
          <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">{source.title}</h1>
          <p className="text-xs text-ink-500">
            {source.interviewDate &&
              new Date(source.interviewDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            {source.durationMs ? ` · ${formatDuration(source.durationMs)}` : ""}
            {source.sizeBytes ? ` · ${formatBytes(source.sizeBytes)}` : ""}
          </p>
        </div>
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </div>

      {source.status === "failed" && source.errorMessage && (
        <div className="mb-6 max-w-lg rounded border border-line bg-white p-4 text-sm text-ink-700">
          {source.errorMessage}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">
          Representation chain
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ChainNode label={KIND_LABEL[source.kind] ?? source.kind} sublabel="Original">
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          </ChainNode>
          {source.representations.map((representation) => {
            const badge =
              REPRESENTATION_STATUS_BADGE[representation.status] ?? REPRESENTATION_STATUS_BADGE.pending;
            return (
              <span key={representation.id} className="flex items-center gap-2">
                <span className="text-ink-300">→</span>
                <ChainNode
                  label={REPRESENTATION_KIND_LABEL[representation.kind] ?? representation.kind}
                  sublabel={representation.produced_by ?? "pending"}
                >
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </ChainNode>
              </span>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">
          Used in {source.projects.length} project{source.projects.length === 1 ? "" : "s"}
        </h2>
        {source.projects.length === 0 ? (
          <p className="text-sm text-ink-500">Not attached to any project yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {source.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/sourcework/${project.id}?source=${id}`}
                  className="text-sm font-semibold text-brand-link"
                >
                  {project.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">
          Excerpts from this source
        </h2>
        {excerpts.length === 0 ? (
          <p className="text-sm text-ink-500">
            No excerpts yet. Open a project that references this source, select a passage in the
            transcript, and save it as an excerpt.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {excerpts.map((excerpt) => (
              <li key={excerpt.id} className="rounded border border-line bg-white p-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  {linkProjectId ? (
                    <Link
                      href={`/sourcework/${linkProjectId}?source=${id}&t=${excerpt.startMs}&clip=${excerpt.id}`}
                      className="font-semibold text-brand-link"
                    >
                      {excerpt.title}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink-900">{excerpt.title}</span>
                  )}
                  <span className="text-xs text-ink-400">
                    {formatDuration(excerpt.startMs)}–{formatDuration(excerpt.endMs)}
                    {excerpt.hasExport && " · exported"}
                  </span>
                </div>
                {excerpt.excerpt && (
                  <p className="line-clamp-2 text-sm text-ink-700">{excerpt.excerpt}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChainNode({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-[140px] flex-col gap-1 rounded border border-line bg-white p-3">
      <p className="text-sm font-semibold text-ink-900">{label}</p>
      <p className="text-xs text-ink-400">{sublabel}</p>
      {children}
    </div>
  );
}
