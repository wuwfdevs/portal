import Link from "next/link";
import { formatDuration } from "@/lib/transcription/media";
import type { LibraryClip } from "@/lib/transcription/clips";

/**
 * Every clip across every project — the browse half of the clip library
 * (design doc §3F), for when the reporter knows roughly what they have and a
 * query isn't the right way to ask for it.
 *
 * Each row links twice on purpose: the title opens the workspace at the
 * clip's in-point with the clip loaded, and the project name opens the
 * recording it came from. A clip is never a dead end.
 */
export function ClipLibrary({ clips }: { clips: LibraryClip[] }) {
  if (clips.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No clips yet. Open an interview, select a passage in the transcript, and save it as a clip —
        it will show up here for everyone.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {clips.map((clip) => (
        <li key={clip.id} className="rounded border border-line bg-white p-4">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={`/transcription/${clip.projectId}?t=${clip.startMs}&clip=${clip.id}`}
              className="font-semibold text-brand-link"
            >
              {clip.title}
            </Link>
            <span className="text-xs text-ink-400">
              {formatDuration(clip.endMs - clip.startMs)}
              {clip.hasExport && " · exported"}
            </span>
          </div>

          {clip.excerpt && <p className="mb-2 line-clamp-2 text-sm text-ink-700">{clip.excerpt}</p>}

          <p className="text-xs text-ink-500">
            <Link href={`/transcription/${clip.projectId}`} className="text-brand-link">
              {clip.projectTitle}
            </Link>
            {" · "}
            {formatDuration(clip.startMs)}
            {clip.interviewDate &&
              ` · ${new Date(clip.interviewDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}`}
          </p>

          {clip.projectDescription && (
            <p className="mt-1.5 line-clamp-2 text-xs italic text-ink-400">
              {clip.projectDescription}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
