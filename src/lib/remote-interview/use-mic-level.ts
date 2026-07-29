"use client";

import { useEffect, useState } from "react";

/**
 * RMS mic level in [0, 1] for a MediaStream, via the same AnalyserNode
 * approach as the preflight screen's level meter
 * (src/app/join/[token]/preflight-form.tsx) — duplicated rather than
 * imported from there since that file is a form component, not a shared
 * module. Used for both a participant's own level and, in the studio, a
 * remote participant's level off their Daily audio track.
 */
export function useMicLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting to the "no stream" state, mirrors preflight-form.tsx.
      setLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId: number;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sumSquares += normalized * normalized;
      }
      setLevel(Math.sqrt(sumSquares / data.length));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      audioContext.close().catch(() => {});
    };
  }, [stream]);

  return level;
}
