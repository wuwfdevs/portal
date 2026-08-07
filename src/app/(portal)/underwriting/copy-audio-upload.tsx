"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FieldError, FieldHint } from "@/components/ui/input";
import { UNDERWRITING_MEDIA_BUCKET, copyAudioObjectPath, isAllowedAudioType } from "@/lib/underwriting/copy";
import { completeCopyAudioUpload } from "./copy-actions";

/**
 * Uploads directly to the underwriting-media bucket, then records the
 * resulting storage path via completeCopyAudioUpload() — same shape as
 * lib/log's audio-upload.tsx (browser-direct-to-Storage, no Server Action
 * payload for the file itself). upsert: true, so re-uploading replaces the
 * copy's audio in place.
 */
export function CopyAudioUpload({ copyId, hasExisting }: { copyId: string; hasExisting: boolean }) {
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
    const storagePath = copyAudioObjectPath(copyId, file.type);

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(UNDERWRITING_MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setStatus("idle");
      event.currentTarget.value = "";
      return;
    }

    const result = await completeCopyAudioUpload(copyId, storagePath);
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
