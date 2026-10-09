"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPieceAudioUrl } from "../actions";

/** Signed URLs last 30 minutes; ask again well before that. */
const URL_MAX_AGE_MS = 20 * 60 * 1000;
const STOP_CHECK_MS = 40;

/**
 * One shared audio element for a piece: play any range of any of the project's
 * recordings, one at a time. The URL is signed at the moment of play (a page
 * left open outlives a URL baked in at render) and cached per source.
 */
export function usePiecePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    audioRef.current?.pause();
    setPlayingKey(null);
  }, []);

  useEffect(() => stop, [stop]);

  /** Plays [startMs, endMs) of a source. Playing the same key again stops it. */
  const play = useCallback(
    async (key: string, sourceId: string, startMs: number, endMs: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playingKey === key) {
        stop();
        return;
      }
      stop();
      setError(null);

      let cached = urls.current.get(sourceId);
      if (!cached || Date.now() - cached.at > URL_MAX_AGE_MS) {
        const result = await getPieceAudioUrl(sourceId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        cached = { url: result.url, at: Date.now() };
        urls.current.set(sourceId, cached);
      }

      if (audio.src !== cached.url) {
        audio.src = cached.url;
        await new Promise<void>((resolve) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => resolve(), { once: true });
        });
      }
      audio.currentTime = startMs / 1000;
      try {
        await audio.play();
      } catch {
        setError("Could not play this clip.");
        return;
      }
      setPlayingKey(key);
      timer.current = setInterval(() => {
        if (audio.currentTime * 1000 >= endMs || audio.ended) stop();
      }, STOP_CHECK_MS);
    },
    [playingKey, stop],
  );

  return { audioRef, play, stop, playingKey, error };
}
