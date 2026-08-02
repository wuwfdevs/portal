"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  TRANSCRIPTION_MEDIA_BUCKET,
  formatDuration,
  isAllowedDocumentType,
  isAllowedMediaType,
  isDocumentContentType,
  isVideoContentType,
  sourceObjectPath,
  titleFromFileName,
} from "@/lib/transcription/media";
import type { SwSourceKind } from "@/lib/database.types";
import {
  listAttachableSources,
  attachSourceToProject,
  createSourceForProject,
  completeSourceUpload,
  failSourceUpload,
  type AttachableSource,
} from "./source-actions";

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
  document: "PDF",
};

type Mode = "find" | "upload";

/**
 * Single entry point for adding a source to a project — a "Find existing" /
 * "Upload new" toggle inside one modal, rather than two separate buttons the
 * reporter has to pick between up front. `onDone(sourceId)` fires on success
 * from either mode; the caller switches the project's active source to it
 * regardless of which mode produced it (docs/sourcework-design.md §7.4's "no
 * confirmation step" reasoning applies the same way to both — neither risks
 * RLS or data loss).
 */
export function AddSourceModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: (sourceId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("find");

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded border border-line bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-900">Add a source</p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-ink-400 hover:text-ink-700"
          >
            Close
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          <ModeTab label="Find existing" active={mode === "find"} onClick={() => setMode("find")} />
          <ModeTab label="Upload new" active={mode === "upload"} onClick={() => setMode("upload")} />
        </div>

        {mode === "find" ? (
          <FindExistingPanel projectId={projectId} onDone={onDone} />
        ) : (
          <UploadNewPanel projectId={projectId} onDone={onDone} />
        )}
      </div>
    </div>
  );
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        active
          ? "border-brand-primary bg-brand-surface text-brand-link"
          : "border-line text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

function FindExistingPanel({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (sourceId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttachableSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const sources = await listAttachableSources(projectId, query);
      if (!cancelled) {
        setResults(sources);
        setIsLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId, query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setIsLoading(true);
  }

  async function handleAttach(sourceId: string) {
    setAttachingId(sourceId);
    setError(null);
    const result = await attachSourceToProject(projectId, sourceId);
    setAttachingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone(sourceId);
  }

  return (
    <div>
      <Input
        autoFocus
        placeholder="Search sources by title…"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        className="mb-3"
      />
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <p className="py-4 text-center text-xs text-ink-400">Searching…</p>
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-400">
            No other sources match. Every other source may already be attached to this project.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {results.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    <span className="mr-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-400">
                      {KIND_LABEL[source.kind]}
                    </span>
                    {source.title}
                  </p>
                  <p className="text-xs text-ink-500">
                    {source.interviewDate &&
                      new Date(source.interviewDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    {source.kind === "document"
                      ? source.pageCount
                        ? ` · ${source.pageCount} page${source.pageCount === 1 ? "" : "s"}`
                        : ""
                      : source.durationMs
                        ? ` · ${formatDuration(source.durationMs)}`
                        : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={attachingId === source.id}
                  onClick={() => handleAttach(source.id)}
                  className="shrink-0 px-2.5 py-1 text-xs"
                >
                  {attachingId === source.id ? "Attaching…" : "Reference"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Stage = "idle" | "creating" | "uploading" | "finishing";

const STAGE_LABEL: Record<Exclude<Stage, "idle">, string> = {
  creating: "Creating source…",
  uploading: "Uploading — this can take a few minutes for a long recording…",
  finishing: "Finishing up…",
};

/** Reads a local file's duration client-side, without a server round trip. */
function probeDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(isVideoContentType(file.type) ? "video" : "audio");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const ms = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
      cleanup();
      resolve(ms);
    };
    el.onerror = () => {
      cleanup();
      resolve(null);
    };
    el.src = objectUrl;
  });
}

function UploadNewPanel({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (sourceId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // See NewProjectForm — the suggested file-name title is replaced when the
  // file changes, but anything the reporter typed is left alone.
  const [titleIsSuggested, setTitleIsSuggested] = useState(true);
  const isPending = stage !== "idle";

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file && titleIsSuggested) setTitle(titleFromFileName(file.name));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setError("Choose an audio/video file or a PDF to upload.");
      return;
    }
    const isDocument = isDocumentContentType(file.type);
    if (!isDocument && !isAllowedMediaType(file.type)) {
      setError("That file type isn't supported. Use WAV, MP3, M4A/AAC, MP4, MOV, WebM, or PDF.");
      return;
    }
    if (isDocument && !isAllowedDocumentType(file.type)) {
      setError("That file type isn't supported.");
      return;
    }

    setStage("creating");
    const created = await createSourceForProject(projectId, {
      title,
      kind: isDocument ? "document" : "audio_video",
    });
    if ("error" in created) {
      setError(created.error);
      setStage("idle");
      return;
    }
    const sourceId = created.sourceId;

    setStage("uploading");
    const durationMs = isDocument ? null : await probeDurationMs(file);
    const storagePath = sourceObjectPath(sourceId, file.type);
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(TRANSCRIPTION_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      await failSourceUpload({ projectId, sourceId, message: uploadError.message });
      onDone(sourceId);
      return;
    }

    setStage("finishing");
    // See new-project-form.tsx's equivalent comment: the file is already in
    // Storage by this point, so the source's own upload succeeded regardless
    // of whether completeSourceUpload's processing kickoff did. Don't mark
    // the source itself failed too — completeSourceUpload already recorded
    // that on the representation, and it's the only thing a later retry
    // clears.
    await completeSourceUpload({
      projectId,
      sourceId,
      contentType: file.type,
      storagePath,
      sizeBytes: file.size,
      durationMs,
    });
    onDone(sourceId);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="media">Audio/video file, or PDF</Label>
        <input
          ref={fileInputRef}
          id="media"
          name="media"
          type="file"
          accept="audio/*,video/*,application/pdf"
          disabled={isPending}
          onChange={handleFileChange}
          className="block w-full text-sm text-ink-700 file:mr-3 file:rounded file:border-0 file:bg-panel-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink-700 hover:file:bg-panel-50"
        />
        <FieldHint>WAV, MP3, M4A/AAC, MP4, MOV, WebM, or PDF.</FieldHint>
      </div>
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Mayor Reeves on bridge funding"
          required
          disabled={isPending}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleIsSuggested(event.target.value.trim() === "");
          }}
        />
        <FieldHint>Taken from the file name — change it to whatever you&rsquo;ll look for later.</FieldHint>
      </div>

      {error && <FieldError>{error}</FieldError>}
      {isPending && <p className="text-xs text-ink-500">{STAGE_LABEL[stage]}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Working…" : "Upload"}
      </Button>
    </form>
  );
}
