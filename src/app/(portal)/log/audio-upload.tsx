"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FieldError, FieldHint } from "@/components/ui/input";
import {
  LOG_MEDIA_BUCKET,
  contentComponentAudioObjectPath,
  contentItemAudioObjectPath,
  isAllowedAudioType,
} from "@/lib/log/content-library";
import { completeAudioUpload } from "./library-actions";

type Target =
  | { kind: "item"; contentItemId: string }
  | { kind: "component"; contentItemId: string; componentId: string };

/**
 * Uploads directly to the log-media bucket, then records the resulting
 * storage path via completeAudioUpload() — same shape as Sourcework's
 * new-project-form.tsx (browser-direct-to-Storage, no Server Action payload
 * for the file itself). upsert: true, so re-uploading the same content item
 * or component replaces its audio in place.
 */
export function AudioUpload({ target, hasExisting }: { target: Target; hasExisting: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(null);

    if (!isAllowedAudioType(file.type)) {
      setError("That file type isn't supported. Use WAV, MP3, M4A, or AAC.");
      event.currentTarget.value = "";
      return;
    }

    setStatus("uploading");
    const storagePath =
      target.kind === "item"
        ? contentItemAudioObjectPath(target.contentItemId, file.type)
        : contentComponentAudioObjectPath(target.contentItemId, target.componentId, file.type);

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(LOG_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setStatus("idle");
      event.currentTarget.value = "";
      return;
    }

    const result = await completeAudioUpload(target, storagePath);
    setStatus("idle");
    event.currentTarget.value = "";
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <input
        type="file"
        accept="audio/wav,audio/mpeg,audio/mp4,audio/aac,audio/x-m4a"
        disabled={status === "uploading"}
        onChange={handleChange}
        className="block text-xs text-ink-700 file:mr-2 file:rounded file:border-0 file:bg-panel-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-ink-700 hover:file:bg-panel-50"
      />
      <FieldHint>{hasExisting ? "Replaces the current audio." : "WAV, MP3, M4A, or AAC."}</FieldHint>
      {status === "uploading" && <p className="text-xs text-ink-500">Uploading…</p>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
