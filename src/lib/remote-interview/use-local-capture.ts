"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocalTrackRecorder } from "@/lib/remote-interview/capture";
import type { LocalRecordingState } from "@/lib/remote-interview/call-status";

export interface UseLocalCaptureParams {
  /** This participant's own ri_participants.id — host or guest, either owns writing their own local track (RLS: ri_is_own_participant). */
  participantId: string;
  /** This participant's remote-interview-media storage prefix (tokens.ts:storagePrefixFor). */
  storagePrefix: string;
}

export interface LocalCaptureHandle {
  state: LocalRecordingState;
  pendingUploadParts: number;
  /** The capture stream (AEC/NS/AGC off), for a level meter — null until a run is active. */
  getStream: () => MediaStream | null;
  /** Creates this run's local track row and starts capturing. */
  beginRun: (runIndex: number, referenceStartedAtMs: number) => Promise<void>;
  /** Stops capturing and marks the track's final part count; upload retries continue in the background. */
  endRun: () => Promise<void>;
}

/**
 * Orchestrates one participant's local-master capture across a recording
 * run: creates the ri_tracks row, drives capture.ts's LocalTrackRecorder,
 * and surfaces the status studio-client.tsx/call.tsx render (design doc
 * §3D). Shared between the host's studio and a guest's call view — both
 * start/stop in lockstep with the same host-broadcast signal, just from
 * different route trees, which is what this hook exists to avoid
 * duplicating.
 */
export function useLocalCapture({
  participantId,
  storagePrefix,
}: UseLocalCaptureParams): LocalCaptureHandle {
  const [state, setState] = useState<LocalRecordingState>("idle");
  const [pendingUploadParts, setPendingUploadParts] = useState(0);
  const recorderRef = useRef<LocalTrackRecorder | null>(null);
  const trackIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      recorderRef.current?.dispose();
    };
  }, []);

  const beginRun = useCallback(
    async (runIndex: number, referenceStartedAtMs: number) => {
      const supabase = createClient();
      const trackId = crypto.randomUUID();

      const { error } = await supabase.from("ri_tracks").insert({
        id: trackId,
        participant_id: participantId,
        source: "local",
        run_index: runIndex,
        status: "recording",
        started_at_ms: Math.max(0, Math.round(Date.now() - referenceStartedAtMs)),
        content_type: "audio/wav",
        sample_rate: 48000,
      });
      if (error) {
        console.error("Could not create local track row:", error);
        setState("failed");
        return;
      }
      trackIdRef.current = trackId;
      setPendingUploadParts(0);

      const recorder = new LocalTrackRecorder({
        trackId,
        storagePrefix,
        sessionReferenceMs: referenceStartedAtMs,
        onPendingCountChange: setPendingUploadParts,
        onPartSettled: (outcome) => {
          if (!outcome.ok && outcome.interrupted) {
            console.error("Local recording part failed repeatedly:", outcome.message);
            setState("interrupted");
          }
        },
      });
      recorderRef.current = recorder;

      try {
        await recorder.start();
        setState("recording");
      } catch (err) {
        console.error("Could not start local recording:", err);
        setState("failed");
      }
    },
    [participantId, storagePrefix],
  );

  const endRun = useCallback(async () => {
    const recorder = recorderRef.current;
    const trackId = trackIdRef.current;
    if (!recorder || !trackId) return;

    const expectedPartCount = await recorder.stop();
    recorderRef.current = null;
    trackIdRef.current = null;

    const supabase = createClient();
    const { error } = await supabase
      .from("ri_tracks")
      .update({ expected_part_count: expectedPartCount, status: "uploading" })
      .eq("id", trackId);
    if (error) console.error("Could not finalize local track row:", error);

    setState("idle");
  }, []);

  const getStream = useCallback(() => recorderRef.current?.getStream() ?? null, []);

  return { state, pendingUploadParts, getStream, beginRun, endRun };
}
