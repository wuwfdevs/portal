"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  derivePreflightWarnings,
  estimateSessionBytes,
  type ConnectionInfo,
  type StorageEstimate,
} from "@/lib/remote-interview/preflight";
import { GuestShell } from "./guest-shell";
import { completePreflight } from "./actions";

type MicState = "idle" | "requesting" | "granted" | "denied";

/**
 * The screen design doc §3B calls "the most valuable screen in the tool":
 * confirm name, grant the microphone (with echo cancellation/noise
 * suppression/AGC explicitly off — those are wrong for a recording, right
 * for a call, per design doc §6 "Capture"), pick a device, watch a level
 * meter, make a short test recording, and see every warning before
 * continuing. Continue is never disabled by a warning — the guest can
 * always proceed past one, per §3B, but never without seeing it.
 *
 * Uses the browser's native MediaRecorder for the test clip only (lossy
 * WebM/MP4 is fine for a discarded playback check). The lossless
 * extendable-media-recorder/WAV pipeline is the studio's job (slice 3) —
 * this screen never uploads or keeps audio.
 */
export function PreflightForm({
  participantId,
  sessionId,
  initialDisplayName,
}: {
  participantId: string;
  sessionId: string;
  initialDisplayName: string;
}) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [micState, setMicState] = useState<MicState>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [micDevicesDetected, setMicDevicesDetected] = useState(true);
  const [level, setLevel] = useState(0);
  const [signalDetected, setSignalDetected] = useState<boolean | null>(null);
  const [testRecording, setTestRecording] = useState<{ url: string } | null>(null);
  const [isRecordingTest, setIsRecordingTest] = useState(false);

  const [browserSupported, setBrowserSupported] = useState(true);
  const [storage, setStorage] = useState<StorageEstimate>({ quotaBytes: null, usageBytes: null });
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [userAgent, setUserAgent] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // One-time, browser-only environment checks (design doc §3B's "unsupported
  // browser" / "insufficient local storage" warnings). These can only run
  // post-mount — there's no navigator/MediaRecorder/indexedDB during SSR —
  // which is exactly the "read an external system into React state" case
  // effects exist for; disabled below rather than restructured, since
  // computing them during render would break server rendering instead.
  useEffect(() => {
    const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
    const hasMediaRecorder = typeof MediaRecorder !== "undefined";
    const hasOPFS = typeof (navigator.storage as { getDirectory?: unknown })?.getDirectory === "function";
    const hasIndexedDB = typeof indexedDB !== "undefined";

    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };

    /* eslint-disable react-hooks/set-state-in-effect */
    setUserAgent(navigator.userAgent);
    setBrowserSupported(hasGetUserMedia && hasMediaRecorder && (hasOPFS || hasIndexedDB));
    if (nav.connection) {
      setConnection({ saveData: nav.connection.saveData, effectiveType: nav.connection.effectiveType });
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    navigator.storage
      ?.estimate?.()
      .then((estimate) =>
        setStorage({ quotaBytes: estimate.quota ?? null, usageBytes: estimate.usage ?? null }),
      )
      .catch(() => setStorage({ quotaBytes: null, usageBytes: null }));
  }, []);

  function stopLevelMeter() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      stopLevelMeter();
      stopStream();
    };
  }, []);

  function startLevelMeter(stream: MediaStream) {
    stopLevelMeter();
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let maxObserved = 0;
    let frame = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      setLevel(rms);
      maxObserved = Math.max(maxObserved, rms);
      frame += 1;
      // ~1 second of frames at a typical 60fps rAF cadence.
      if (frame === 60) setSignalDetected(maxObserved > 0.02);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function requestMic(deviceId?: string) {
    setMicState("requesting");
    stopLevelMeter();
    stopStream();
    setSignalDetected(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      streamRef.current = stream;
      setMicState("granted");
      setMicDevicesDetected(true);

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((device) => device.kind === "audioinput");
      setDevices(audioInputs);
      const activeTrackSettings = stream.getAudioTracks()[0]?.getSettings();
      setSelectedDeviceId(activeTrackSettings?.deviceId ?? deviceId ?? audioInputs[0]?.deviceId ?? "");

      startLevelMeter(stream);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        setMicState("granted"); // permission itself isn't the problem
        setMicDevicesDetected(false);
      } else {
        setMicState("denied");
      }
    }
  }

  function startTestRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    const candidateTypes = ["audio/webm", "audio/mp4"];
    const mimeType = candidateTypes.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType ?? "audio/webm" });
      setTestRecording((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url: URL.createObjectURL(blob) };
      });
      setIsRecordingTest(false);
    };

    setTestRecording(null);
    setIsRecordingTest(true);
    recorder.start();
    setTimeout(() => recorder.stop(), 3000);
  }

  const warnings = useMemo(
    () =>
      derivePreflightWarnings({
        browserSupported,
        permissionState: micState === "denied" ? "denied" : micState === "granted" ? "granted" : "unknown",
        micDevicesDetected,
        signalDetected,
        storage,
        userAgent,
        connection,
      }),
    [browserSupported, micState, micDevicesDetected, signalDetected, storage, userAgent, connection],
  );

  const selectedDeviceLabel = devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? null;
  const canContinue = displayName.trim().length > 0 && !submitting;

  async function handleContinue() {
    setSubmitting(true);
    setSubmitError(null);

    const result = await completePreflight({
      participantId,
      sessionId,
      displayName,
      warnings: warnings.map((warning) => ({ code: warning.code, severity: warning.severity })),
      deviceLabel: selectedDeviceLabel,
      userAgent: userAgent || navigator.userAgent,
    });

    if (!result.ok) {
      setSubmitError(result.message);
      setSubmitting(false);
      return;
    }

    stopLevelMeter();
    stopStream();
    router.refresh();
  }

  return (
    <GuestShell>
      <h1 className="mb-1 font-serif text-lg font-bold text-ink-900">Get ready</h1>
      <p className="mb-5 text-sm leading-relaxed text-ink-500">
        A high-quality recording will be made on your own device. Wear headphones if you can, and
        keep this tab open until your recording finishes uploading.
      </p>

      <div className="mb-4">
        <Label htmlFor="display_name">Your name</Label>
        <Input
          id="display_name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="mb-4">
        <Label>Microphone</Label>
        {micState === "idle" && (
          <Button type="button" variant="secondary" onClick={() => requestMic()}>
            Enable microphone
          </Button>
        )}
        {micState === "requesting" && <p className="text-sm text-ink-500">Requesting access…</p>}
        {micState === "denied" && (
          <Button type="button" variant="secondary" onClick={() => requestMic()}>
            Try again
          </Button>
        )}
        {micState === "granted" && (
          <div className="flex flex-col gap-3">
            {devices.length > 1 && (
              <Select
                value={selectedDeviceId}
                onChange={(event) => {
                  setSelectedDeviceId(event.target.value);
                  requestMic(event.target.value);
                }}
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Microphone"}
                  </option>
                ))}
              </Select>
            )}

            <div className="h-2 w-full overflow-hidden rounded-full bg-panel-100">
              <div
                className="h-full bg-brand-primary transition-[width] duration-75"
                style={{ width: `${Math.min(100, Math.round(level * 220))}%` }}
              />
            </div>

            <div>
              <Button type="button" variant="secondary" onClick={startTestRecording} disabled={isRecordingTest}>
                {isRecordingTest ? "Recording…" : "Record a 3-second test"}
              </Button>
              {testRecording && (
                <audio className="mt-2 w-full" controls src={testRecording.url}>
                  <track kind="captions" />
                </audio>
              )}
            </div>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {warnings.map((warning) => (
            <Alert key={warning.code} variant={warning.severity === "blocking" ? "danger" : "note"}>
              <Badge variant={warning.severity === "blocking" ? "danger" : "muted"}>
                {warning.severity}
              </Badge>{" "}
              {warning.message}
            </Alert>
          ))}
        </div>
      )}

      {submitError && (
        <div className="mb-4">
          <Alert>{submitError}</Alert>
        </div>
      )}

      <Button type="button" disabled={!canContinue} onClick={handleContinue} className="w-full">
        {submitting ? "Joining…" : "Continue"}
      </Button>

      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        Expected recording budget: about {Math.round(estimateSessionBytes() / 1_000_000)} MB of local
        storage for a typical session.
      </p>
    </GuestShell>
  );
}
