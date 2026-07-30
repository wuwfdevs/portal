"use client";

import { useEffect, useRef, useState } from "react";
import Daily, { type DailyCall, type DailyEventObjectAppMessage } from "@daily-co/daily-js";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocalCapture } from "@/lib/remote-interview/use-local-capture";
import { useMicLevel } from "@/lib/remote-interview/use-mic-level";
import { GuestShell } from "./guest-shell";
import { getGuestCallToken } from "./actions";

interface RecordingStartMessage {
  type: "ri:recording-start";
  runIndex: number;
  referenceStartedAtMs: number;
}
interface RecordingStopMessage {
  type: "ri:recording-stop";
}
interface StatusMessage {
  type: "ri:status";
  participantId: string;
  localRecording: string;
  pendingUploadParts: number;
}
type AppMessage = RecordingStartMessage | RecordingStopMessage | StatusMessage;

const STATUS_BROADCAST_INTERVAL_MS = 3000;

/**
 * A guest's in-call view (design doc §3D: "a deliberately smaller version"
 * of the host's studio — no record button, no other participants' tiles;
 * just this guest's own status). Local capture starts and stops on the
 * host's broadcast signal, never on this screen's own initiative (§3D:
 * "Guests cannot start or stop recording — only leave").
 */
export function Call({
  token,
  participantId,
  displayName,
  storagePrefix,
}: {
  token: string;
  participantId: string;
  displayName: string;
  storagePrefix: string;
}) {
  const callRef = useRef<DailyCall | null>(null);
  const [callState, setCallState] = useState<"connecting" | "joined" | "error" | "left">(
    "connecting",
  );
  const [callError, setCallError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [recordingActive, setRecordingActive] = useState(false);

  const localCapture = useLocalCapture({ participantId, storagePrefix });
  const localLevel = useMicLevel(localCapture.getStream());

  useEffect(() => {
    let cancelled = false;
    let call: DailyCall | null = null;
    let statusInterval: ReturnType<typeof setInterval> | null = null;

    async function setup() {
      const result = await getGuestCallToken(token);
      if (cancelled) return;
      if (!result.ok) {
        setCallError(result.message);
        setCallState("error");
        return;
      }

      call = Daily.createCallObject({ startVideoOff: true });
      callRef.current = call;

      call.on("app-message", (event: DailyEventObjectAppMessage<AppMessage>) => {
        const data = event.data;
        if (data.type === "ri:recording-start") {
          setRecordingActive(true);
          void localCapture.beginRun(data.runIndex, data.referenceStartedAtMs);
        } else if (data.type === "ri:recording-stop") {
          setRecordingActive(false);
          void localCapture.endRun();
        }
      });

      try {
        await call.join({
          url: result.data.roomUrl,
          token: result.data.token,
          startVideoOff: true,
        });
        if (cancelled) return;
        setCallState("joined");
      } catch (err) {
        if (cancelled) return;
        setCallError(err instanceof Error ? err.message : "Could not join the call.");
        setCallState("error");
      }
    }

    void setup();
    // Lets the host see this guest's local-recording/upload health even
    // though the recording itself happens entirely in this browser — see
    // studio-client.tsx's remoteStatuses, fed by exactly this message.
    statusInterval = setInterval(() => {
      callRef.current?.sendAppMessage(
        {
          type: "ri:status",
          participantId,
          localRecording: localCapture.state,
          pendingUploadParts: localCapture.pendingUploadParts,
        } satisfies StatusMessage,
        "*",
      );
    }, STATUS_BROADCAST_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (statusInterval) clearInterval(statusInterval);
      call?.leave().catch(() => {});
      void call?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount; localCapture is stable across the component's lifetime.
  }, [token, participantId]);

  function toggleMic() {
    const next = !micOn;
    callRef.current?.setLocalAudio(next);
    setMicOn(next);
  }

  function handleLeave() {
    callRef.current?.leave().catch(() => {});
    setCallState("left");
  }

  if (callState === "error") {
    return (
      <GuestShell>
        <Alert>{callError ?? "Couldn't join the call."}</Alert>
      </GuestShell>
    );
  }

  if (callState === "left") {
    return (
      <GuestShell>
        <h1 className="mb-2 font-serif text-lg font-bold text-ink-900">You&apos;ve left</h1>
        <p className="text-sm leading-relaxed text-ink-500">
          {localCapture.pendingUploadParts > 0
            ? "Your recording is still uploading in the background. If you close this tab now, anything not yet uploaded stays only on this device."
            : "Thanks for joining. Your recording has been uploaded."}
        </p>
      </GuestShell>
    );
  }

  return (
    <GuestShell>
      <h1 className="mb-1 font-serif text-lg font-bold text-ink-900">{displayName}</h1>
      <p className="mb-4 text-sm text-ink-500">
        {callState === "connecting" ? "Joining the call…" : "You're connected to the interview."}
      </p>

      {localCapture.getStream() && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-panel-100">
          <div
            className="h-full bg-brand-primary transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.round(localLevel * 220))}%` }}
          />
        </div>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-y-1.5 text-sm">
        <dt className="text-ink-500">Recording</dt>
        <dd className="text-right font-semibold text-ink-900">
          {recordingActive ? "On" : "Not started"}
        </dd>
        <dt className="text-ink-500">Your mic</dt>
        <dd className="text-right font-semibold text-ink-900">{micOn ? "Live" : "Muted"}</dd>
        <dt className="text-ink-500">Your recording</dt>
        <dd className="text-right font-semibold text-ink-900 capitalize">{localCapture.state}</dd>
        <dt className="text-ink-500">Upload</dt>
        <dd className="text-right font-semibold text-ink-900">
          {localCapture.pendingUploadParts === 0
            ? "Caught up"
            : `${localCapture.pendingUploadParts} part(s) pending`}
        </dd>
      </dl>

      {localCapture.state === "failed" && (
        <Alert className="mb-4">
          Your local recording failed. Keep this tab open — the host may still have a cloud backup.
        </Alert>
      )}
      {localCapture.state === "interrupted" && (
        <Alert className="mb-4">
          Your recording was interrupted. It&apos;s still trying to catch up — keep this tab open.
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={toggleMic}>
          {micOn ? "Mute myself" : "Unmute myself"}
        </Button>
        <Button type="button" variant="secondary" onClick={handleLeave}>
          Leave
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        {recordingActive
          ? "Keep this tab open until your recording finishes uploading, even after the interview ends."
          : "The host controls when recording starts."}
      </p>
      <div className="mt-2">
        <Badge variant="neutral">{recordingActive ? "Recording" : "Waiting for host"}</Badge>
      </div>
    </GuestShell>
  );
}
