"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Daily, {
  type DailyCall,
  type DailyEventObjectAppMessage,
  type DailyEventObjectParticipant,
  type DailyEventObjectParticipantLeft,
  type DailyParticipant,
} from "@daily-co/daily-js";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deriveParticipantHealth,
  anyParticipantNeedsAttention,
  cloudBackupBadgeVariant,
  connectionBadgeVariant,
  dataSafetyBadgeVariant,
  localRecordingBadgeVariant,
  uploadBacklogBadgeVariant,
  type CloudBackupState,
  type ConnectionState,
  type LocalRecordingState,
  type ParticipantStatus,
} from "@/lib/remote-interview/call-status";
import { createClient } from "@/lib/supabase/client";
import { useLocalCapture } from "@/lib/remote-interview/use-local-capture";
import { useMicLevel } from "@/lib/remote-interview/use-mic-level";
import {
  admitWaitingParticipant,
  getStudioCallCredentials,
  startStudioRecording,
  stopStudioRecording,
} from "./actions";

/** Matches the guest's own WaitingRoom poll (join/[token]/waiting-room.tsx) — same reasoning: no notification layer, so a short client-side poll is the honest, minimal way to notice a new arrival. */
const WAITING_ROOM_POLL_INTERVAL_MS = 4000;

interface WaitingGuest {
  id: string;
  displayName: string;
}

export interface StudioParticipant {
  id: string;
  displayName: string;
  role: "host" | "guest";
  storagePrefix: string;
}

interface RemoteStatusMessage {
  type: "ri:status";
  participantId: string;
  localRecording: LocalRecordingState;
  pendingUploadParts: number;
}
interface RecordingStartMessage {
  type: "ri:recording-start";
  runIndex: number;
  referenceStartedAtMs: number;
}
interface RecordingStopMessage {
  type: "ri:recording-stop";
}
type StudioAppMessage = RemoteStatusMessage | RecordingStartMessage | RecordingStopMessage;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * The studio (design doc §3D/§4): the host's live screen. Daily carries
 * audio only (video is deferred — §6: "must never be allowed to compromise
 * audio reliability"); a purpose-built status view, not Daily Prebuilt, per
 * the technical assessment's "Not adopted" section. Recording start/stop
 * drives three things together — the database (studio/actions.ts), Daily's
 * raw-tracks cloud backup (callObject.startRecording/stopRecording), and
 * every participant's local capture (capture.ts, via a
 * callObject.sendAppMessage broadcast so a guest's browser starts/stops in
 * lockstep without its own record button, per §3D: "Guests cannot start or
 * stop recording").
 */
export function StudioClient({
  sessionId,
  sessionTitle,
  initialStatus,
  initialRecordingStartedAt,
  participants,
}: {
  sessionId: string;
  sessionTitle: string;
  initialStatus: string;
  initialRecordingStartedAt: string | null;
  participants: StudioParticipant[];
}) {
  const [participantList, setParticipantList] = useState<StudioParticipant[]>(participants);
  const host = participantList.find((p) => p.role === "host") ?? null;

  const [waitingGuests, setWaitingGuests] = useState<WaitingGuest[]>([]);
  const [admittingId, setAdmittingId] = useState<string | null>(null);

  const callRef = useRef<DailyCall | null>(null);
  const [callState, setCallState] = useState<"connecting" | "joined" | "error">("connecting");
  const [callError, setCallError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [dailyParticipants, setDailyParticipants] = useState<Record<string, DailyParticipant>>({});

  const [recordingActive, setRecordingActive] = useState(initialStatus === "recording");
  const [runIndex, setRunIndex] = useState<number | null>(null);
  const [referenceStartedAtMs, setReferenceStartedAtMs] = useState<number | null>(
    initialRecordingStartedAt ? new Date(initialRecordingStartedAt).getTime() : null,
  );
  const [cloudBackupConfigured, setCloudBackupConfigured] = useState(false);
  const [cloudBackupState, setCloudBackupState] = useState<CloudBackupState>("idle");
  const [remoteStatuses, setRemoteStatuses] = useState<
    Record<string, { localRecording: LocalRecordingState; pendingUploadParts: number }>
  >({});

  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Mirrors of state the Daily event handlers below need — those handlers
  // are registered once (the setup effect's dependency array is
  // [sessionId]), so they'd otherwise close over stale state.
  const recordingActiveRef = useRef(recordingActive);
  const runIndexRef = useRef(runIndex);
  const referenceStartedAtMsRef = useRef(referenceStartedAtMs);
  useEffect(() => {
    recordingActiveRef.current = recordingActive;
    runIndexRef.current = runIndex;
    referenceStartedAtMsRef.current = referenceStartedAtMs;
  }, [recordingActive, runIndex, referenceStartedAtMs]);

  const localCapture = useLocalCapture({
    participantId: host?.id ?? "",
    storagePrefix: host?.storagePrefix ?? "",
  });
  const localLevel = useMicLevel(localCapture.getStream());

  useEffect(() => {
    if (!recordingActive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [recordingActive]);

  useEffect(() => {
    let cancelled = false;
    let call: DailyCall | null = null;

    async function setup() {
      const result = await getStudioCallCredentials(sessionId);
      if (cancelled) return;
      if (!result.ok) {
        setCallError(result.message);
        setCallState("error");
        return;
      }

      setCloudBackupConfigured(result.data.cloudBackupConfigured);
      if (!result.data.cloudBackupConfigured) setCloudBackupState("unavailable");

      call = Daily.createCallObject({ startVideoOff: true });
      callRef.current = call;

      call.on("app-message", (event: DailyEventObjectAppMessage<StudioAppMessage>) => {
        const data = event.data;
        if (data.type !== "ri:status") return;
        setRemoteStatuses((prev) => ({
          ...prev,
          [data.participantId]: {
            localRecording: data.localRecording,
            pendingUploadParts: data.pendingUploadParts,
          },
        }));
      });

      call.on("participant-joined", (event: DailyEventObjectParticipant) => {
        setDailyParticipants((prev) => ({
          ...prev,
          [event.participant.session_id]: event.participant,
        }));
        if (
          recordingActiveRef.current &&
          runIndexRef.current !== null &&
          referenceStartedAtMsRef.current !== null
        ) {
          // A guest who joins mid-recording still needs the start signal —
          // there's no other channel they'd learn this from.
          callRef.current?.sendAppMessage(
            {
              type: "ri:recording-start",
              runIndex: runIndexRef.current,
              referenceStartedAtMs: referenceStartedAtMsRef.current,
            } satisfies RecordingStartMessage,
            event.participant.session_id,
          );
        }
      });
      call.on("participant-updated", (event: DailyEventObjectParticipant) => {
        setDailyParticipants((prev) => ({
          ...prev,
          [event.participant.session_id]: event.participant,
        }));
      });
      call.on("participant-left", (event: DailyEventObjectParticipantLeft) => {
        setDailyParticipants((prev) => {
          const next = { ...prev };
          delete next[event.participant.session_id];
          return next;
        });
      });

      call.on("recording-started", () => setCloudBackupState("recording"));
      call.on("recording-stopped", () => setCloudBackupState("idle"));
      call.on("recording-error", () => setCloudBackupState("failed"));

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

    return () => {
      cancelled = true;
      call?.leave().catch(() => {});
      void call?.destroy();
    };
  }, [sessionId]);

  async function handleStartRecording() {
    setPending(true);
    setActionError(null);
    const result = await startStudioRecording(sessionId);
    if (!result.ok) {
      setActionError(result.message);
      setPending(false);
      return;
    }

    setRecordingActive(true);
    setRunIndex(result.data.runIndex);
    setReferenceStartedAtMs(result.data.referenceStartedAtMs);
    setCloudBackupConfigured(result.data.cloudBackupConfigured);

    if (result.data.cloudBackupConfigured) {
      try {
        callRef.current?.startRecording({ type: "raw-tracks" });
      } catch (err) {
        console.error("Could not start Daily cloud recording:", err);
        setCloudBackupState("failed");
      }
    }

    if (host) await localCapture.beginRun(result.data.runIndex, result.data.referenceStartedAtMs);

    callRef.current?.sendAppMessage(
      {
        type: "ri:recording-start",
        runIndex: result.data.runIndex,
        referenceStartedAtMs: result.data.referenceStartedAtMs,
      } satisfies RecordingStartMessage,
      "*",
    );

    setPending(false);
  }

  async function handleStopRecording() {
    setPending(true);
    setActionError(null);
    const result = await stopStudioRecording(sessionId);
    if (!result.ok) {
      setActionError(result.message);
      setPending(false);
      return;
    }

    setRecordingActive(false);

    if (cloudBackupConfigured) {
      try {
        callRef.current?.stopRecording();
      } catch (err) {
        console.error("Could not stop Daily cloud recording:", err);
      }
    }

    await localCapture.endRun();
    callRef.current?.sendAppMessage(
      { type: "ri:recording-stop" } satisfies RecordingStopMessage,
      "*",
    );

    setPending(false);
  }

  function toggleMic() {
    const next = !micOn;
    callRef.current?.setLocalAudio(next);
    setMicOn(next);
  }

  // No notification layer exists yet (CLAUDE.md), so — same as the guest's
  // own WaitingRoom poll — this is the honest, minimal way for the host to
  // notice someone new waiting without leaving the live call to check the
  // session detail page.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function poll() {
      const { data, error } = await supabase
        .from("ri_participants")
        .select("id, display_name, waiting_since")
        .eq("session_id", sessionId)
        .eq("role", "guest")
        .is("revoked_at", null)
        .is("admitted_at", null)
        .not("waiting_since", "is", null)
        .order("waiting_since", { ascending: true });
      if (cancelled || error) return;
      setWaitingGuests((data ?? []).map((p) => ({ id: p.id, displayName: p.display_name })));
    }

    void poll();
    const interval = setInterval(poll, WAITING_ROOM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  async function handleAdmit(participantId: string) {
    setAdmittingId(participantId);
    setActionError(null);
    const result = await admitWaitingParticipant(sessionId, participantId);
    if (result.ok) {
      setParticipantList((prev) => [...prev, result.data]);
      setWaitingGuests((prev) => prev.filter((g) => g.id !== participantId));
    } else {
      setActionError(result.message);
    }
    setAdmittingId(null);
  }

  const participantStatuses = useMemo<ParticipantStatus[]>(() => {
    return participantList.map((p) => {
      const isHost = p.role === "host";
      const dp = Object.values(dailyParticipants).find((d) => d.user_id === p.id);

      let connection: ConnectionState = "disconnected";
      if (dp) {
        const audioState = dp.tracks.audio.state;
        connection =
          audioState === "playable" || audioState === "sendable"
            ? "connected"
            : audioState === "loading" || audioState === "interrupted"
              ? "reconnecting"
              : "disconnected";
      }

      const localRecording = isHost
        ? localCapture.state
        : (remoteStatuses[p.id]?.localRecording ?? "idle");
      const pendingUploadParts = isHost
        ? localCapture.pendingUploadParts
        : (remoteStatuses[p.id]?.pendingUploadParts ?? 0);

      return {
        participantId: p.id,
        displayName: p.displayName,
        connection,
        micMuted: dp ? !dp.audio : true,
        localRecording,
        cloudBackup: cloudBackupConfigured ? cloudBackupState : "unavailable",
        pendingUploadParts,
      };
    });
  }, [
    participantList,
    dailyParticipants,
    remoteStatuses,
    localCapture.state,
    localCapture.pendingUploadParts,
    cloudBackupConfigured,
    cloudBackupState,
  ]);

  const needsAttention = anyParticipantNeedsAttention(participantStatuses);
  const elapsedMs =
    recordingActive && referenceStartedAtMs !== null ? Math.max(0, now - referenceStartedAtMs) : 0;

  if (callState === "error") {
    return (
      <div className="px-6 py-10 sm:px-10 sm:py-12">
        <Alert>{callError ?? "Could not open the studio."}</Alert>
        <div className="mt-4">
          <Link
            href={`/remote-interview/${sessionId}`}
            className="text-xs font-semibold text-brand-link"
          >
            ← Back to session
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link
          href={`/remote-interview/${sessionId}`}
          className="text-xs font-semibold text-brand-link"
        >
          ← Back to session
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-[22px] font-bold text-ink-900">{sessionTitle}</h1>
        {callState === "connecting" && <Badge variant="neutral">Connecting…</Badge>}
      </div>

      {waitingGuests.length > 0 && (
        <div className="mb-6 max-w-xl rounded border border-warning-border bg-warning-bg">
          <div className="border-b border-warning-border px-4 py-3">
            <h2 className="text-sm font-bold text-warning-fg">
              Waiting room — {waitingGuests.length} guest{waitingGuests.length === 1 ? "" : "s"}{" "}
              ready to join
            </h2>
          </div>
          <ul>
            {waitingGuests.map((guest) => (
              <li
                key={guest.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-warning-border px-4 py-3 last:border-b-0"
              >
                <span className="text-sm font-semibold text-ink-900">{guest.displayName}</span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={admittingId === guest.id}
                  onClick={() => handleAdmit(guest.id)}
                >
                  Admit
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {needsAttention && (
        <Alert className="mb-4">
          One or more participants need attention — see their status below.
        </Alert>
      )}
      {actionError && (
        <Alert className="mb-4" variant="danger">
          {actionError}
        </Alert>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded border border-line bg-white p-4">
        <Button
          type="button"
          variant={recordingActive ? "secondary" : "primary"}
          disabled={pending || callState !== "joined"}
          onClick={recordingActive ? handleStopRecording : handleStartRecording}
        >
          {recordingActive ? "Stop recording" : "Start recording"}
        </Button>
        {recordingActive && (
          <span className="font-mono text-lg font-bold text-ink-900">
            {formatElapsed(elapsedMs)}
          </span>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={toggleMic}
          disabled={callState !== "joined"}
        >
          {micOn ? "Mute myself" : "Unmute myself"}
        </Button>
        <Badge variant={!cloudBackupConfigured ? "muted" : cloudBackupBadgeVariant(cloudBackupState)}>
          Cloud backup:{" "}
          {!cloudBackupConfigured
            ? "not configured"
            : cloudBackupState === "recording"
              ? "active"
              : cloudBackupState === "failed"
                ? "failed"
                : "idle"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {participantStatuses.map((status) => (
          <ParticipantTile
            key={status.participantId}
            status={status}
            level={status.participantId === host?.id ? localLevel : null}
          />
        ))}
      </div>
    </div>
  );
}

function ParticipantTile({ status, level }: { status: ParticipantStatus; level: number | null }) {
  const health = deriveParticipantHealth(status);

  return (
    <div className="rounded border border-line bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-900">{status.displayName}</span>
        <Badge variant={dataSafetyBadgeVariant(health.safety)}>
          {health.safety === "safe" ? "OK" : health.safety === "at_risk" ? "At risk" : "Unsafe"}
        </Badge>
      </div>

      {level !== null && (
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-panel-100">
          <div
            className="h-full bg-brand-primary transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.round(level * 220))}%` }}
          />
        </div>
      )}

      <dl className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-xs text-ink-500">
        <dt>Connection</dt>
        <dd className="flex justify-end">
          <Badge variant={connectionBadgeVariant(status.connection)}>{status.connection}</Badge>
        </dd>
        <dt>Mic</dt>
        <dd className="flex justify-end">
          <Badge variant={status.micMuted ? "muted" : "success"}>
            {status.micMuted ? "Muted" : "Live"}
          </Badge>
        </dd>
        <dt>Local recording</dt>
        <dd className="flex justify-end">
          <Badge variant={localRecordingBadgeVariant(status.localRecording)}>
            {status.localRecording}
          </Badge>
        </dd>
        <dt>Upload</dt>
        <dd className="flex justify-end">
          <Badge variant={uploadBacklogBadgeVariant(status.pendingUploadParts)}>
            {status.pendingUploadParts === 0
              ? "Caught up"
              : `${status.pendingUploadParts} part(s) pending`}
          </Badge>
        </dd>
      </dl>

      {health.actionRequired && (
        <p className="mt-2 text-xs leading-relaxed text-danger">{health.actionRequired}</p>
      )}
    </div>
  );
}
