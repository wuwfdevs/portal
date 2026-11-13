"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { checkRecordingFile } from "@/lib/audience-listening/attach-recording";
import { AUDIENCE_LISTENING_MEDIA_BUCKET } from "@/lib/audience-listening/media";
import { createClient } from "@/lib/supabase/client";
import { uploadWithProgress } from "@/lib/storage-upload";
import { probeDurationMs } from "@/lib/transcription/probe-duration";

/**
 * Attaches a recording from a separate recorder to a table that agreed to be recorded. The file goes browser to storage under the
 * path the database reserved, and the table then reads like any other: a complete conversation, one segment, ready to send. The
 * table's own agreement is the consent; nothing here lets staff record a table that has not given it.
 */
export function AttachRecording({ tableId }: { tableId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function attach() {
    const file = input.current?.files?.[0];
    if (!file) {
      setError("Choose the recording first.");
      return;
    }
    const checked = checkRecordingFile(file);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const durationMs = await probeDurationMs(file);
      if (!durationMs || durationMs < 1000) {
        setError("This browser could not read how long that recording is. Export it as an MP3 and try again.");
        return;
      }
      const supabase = createClient();
      const reserved = await supabase.rpc("al_staff_reserve_recording", { p_table_id: tableId, p_content_type: checked.contentType });
      if (reserved.error || !reserved.data) {
        setError("Could not reserve the upload. Try again in a moment.");
        return;
      }
      if ("error" in reserved.data) {
        setError(
          reserved.data.error === "consent_required"
            ? "This table has not agreed to be recorded, so a recording cannot be attached."
            : reserved.data.error === "not_open"
              ? "This table already has a recording. It cannot be replaced."
              : "That table could not be found.",
        );
        return;
      }
      const uploaded = await uploadWithProgress({
        bucket: AUDIENCE_LISTENING_MEDIA_BUCKET,
        path: reserved.data.storage_path,
        file: new File([file], file.name, { type: checked.contentType }),
        upsert: true,
        onProgress: setProgress,
      });
      if (!uploaded.ok) {
        setError(uploaded.error);
        return;
      }
      const done = await supabase.rpc("al_staff_complete_recording", { p_table_id: tableId, p_size_bytes: file.size, p_duration_ms: durationMs });
      if (done.error || !done.data || "error" in done.data) {
        setError("The file uploaded but could not be recorded against the table. Try again.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg" aria-label="Recording from a separate recorder" disabled={busy} className="min-w-0 text-sm" />
        <Button type="button" variant="secondary" onClick={() => void attach()} disabled={busy}>
          {busy ? "Uploading…" : "Attach the recording"}
        </Button>
      </div>
      {busy && <ProgressBar done={Math.round(progress * 100)} total={100} label="Uploading the recording" valueText={`${Math.round(progress * 100)} percent uploaded`} />}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
