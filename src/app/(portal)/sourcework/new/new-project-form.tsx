"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import {
  TRANSCRIPTION_MEDIA_BUCKET,
  isAllowedDocumentType,
  isAllowedMediaType,
  isDocumentContentType,
  isVideoContentType,
  sourceObjectPath,
  titleFromFileName,
} from "@/lib/transcription/media";
import { createProject, completeProjectUpload, failProjectUpload } from "../actions";

type Stage = "idle" | "creating" | "uploading" | "finishing";

const STAGE_LABEL: Record<Exclude<Stage, "idle">, string> = {
  creating: "Creating project…",
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

export function NewProjectForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedIsDocument, setSelectedIsDocument] = useState(false);
  const [title, setTitle] = useState("");
  // Whether the title box is still the file name we suggested (or empty), and
  // so may be replaced when a different file is picked. Anything the reporter
  // types is theirs and is never overwritten.
  const [titleIsSuggested, setTitleIsSuggested] = useState(true);
  const isPending = stage !== "idle";

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedIsDocument(isDocumentContentType(file?.type ?? ""));
    if (file && titleIsSuggested) setTitle(titleFromFileName(file.name));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
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
    const created = await createProject({
      title,
      description,
      kind: isDocument ? "document" : "audio_video",
    });
    if ("error" in created) {
      setError(created.error);
      setStage("idle");
      return;
    }
    const projectId = created.id;

    setStage("uploading");
    const durationMs = isDocument ? null : await probeDurationMs(file);
    const storagePath = sourceObjectPath(created.sourceId, file.type);
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(TRANSCRIPTION_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      await failProjectUpload({ projectId, message: uploadError.message });
      router.push(`/sourcework/${projectId}`);
      return;
    }

    setStage("finishing");
    // No failProjectUpload here on error: the file is already in Storage at
    // this point (that's the branch above), so the source's own upload
    // genuinely succeeded. A completeProjectUpload error means processing
    // couldn't be kicked off (or failed synchronously) — finalizeSourceUpload
    // already recorded that on the *representation* via startDocumentProcessing/
    // startTranscriptionForProject. Marking the source itself failed too used
    // to overwrite a perfectly good upload with a stale error that a later
    // successful retry of the representation never cleared, since retry only
    // ever touches the representation — see representation-status-banner.tsx.
    await completeProjectUpload({
      projectId,
      contentType: file.type,
      storagePath,
      sizeBytes: file.size,
      durationMs,
    });
    router.push(`/sourcework/${projectId}`);
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
      <div>
        <Label htmlFor="description">Notes (optional)</Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder={
            selectedIsDocument
              ? "Context for this document — where it's from, why it matters"
              : "Context for this interview — where, why, who set it up"
          }
          disabled={isPending}
          className="w-full rounded border border-line px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface disabled:bg-panel-50 sm:text-sm"
        />
      </div>

      {error && <FieldError>{error}</FieldError>}
      {isPending && <p className="text-xs text-ink-500">{STAGE_LABEL[stage]}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Working…" : "Upload and create project"}
      </Button>
    </form>
  );
}
