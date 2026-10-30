"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPieceAudioUrl } from "../actions";
import {
  applyPlaybackLevel,
  createPlaybackGraph,
  NEUTRAL_LEVEL,
  type PlayLevel,
  type PlaybackGraph,
} from "@/lib/sourcework/excerpt-playback";
import type { Cut } from "@/lib/sourcework/pieces";

/** Signed URLs last 30 minutes; ask again well before that. */
const URL_MAX_AGE_MS = 20 * 60 * 1000;
const STOP_CHECK_MS = 40;
/** Checked more often when there are cuts to jump, so the seek lands near the start of the pause. */
const CUT_CHECK_MS = 15;

/**
 * One shared audio element for a piece: play any range of any of the project's
 * recordings, one at a time. The URL is signed at the moment of play (a page
 * left open outlives a URL baked in at render) and cached per source.
 *
 * Each range plays the way it exports (lib/sourcework/excerpt-playback.ts); the element needs
 * crossOrigin ("anonymous") for that.
 */
export function usePiecePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Built once per element (an element can feed only one MediaElementSource) and kept for the page's life.
  const graph = useRef<PlaybackGraph | null>(null);

  const applyLevel = useCallback((audio: HTMLAudioElement, level: PlayLevel) => {
    graph.current ??= createPlaybackGraph(audio);
    applyPlaybackLevel(audio, graph.current, level);
  }, []);

  // Bumped by every stop(), so a play() still waiting on the network can tell a newer click replaced it.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    audioRef.current?.pause();
    setPlayingKey(null);
  }, []);

  useEffect(() => stop, [stop]);

  /**
   * Plays [startMs, endMs) of a source at `level`, jumping over `cuts` (source time). Playing the
   * same key again stops it. A jump is a plain seek: cuts sit in the quiet between words, so there
   * is nothing audible to click against.
   */
  const play = useCallback(
    async (
      key: string,
      sourceId: string,
      startMs: number,
      endMs: number,
      level: PlayLevel = NEUTRAL_LEVEL,
      cuts: readonly Cut[] = [],
    ) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playingKey === key) {
        stop();
        return;
      }
      stop();
      // Marked playing at once, before the URL, the load or the seek: a large file takes a while to
      // start, and a button that does nothing gets clicked again. Each later click then stops this
      // one (above) instead of restarting it, and stop() invalidates whatever is still waiting.
      const mine = generation.current;
      const superseded = () => generation.current !== mine;
      setError(null);
      setPlayingKey(key);
      applyLevel(audio, level);

      const fail = (message: string) => {
        if (superseded()) return;
        setError(message);
        stop();
      };

      let cached = urls.current.get(sourceId);
      if (!cached || Date.now() - cached.at > URL_MAX_AGE_MS) {
        const result = await getPieceAudioUrl(sourceId);
        if (superseded()) return;
        if (!result.ok) {
          fail(result.error);
          return;
        }
        cached = { url: result.url, at: Date.now() };
        urls.current.set(sourceId, cached);
      }

      if (audio.src !== cached.url) {
        audio.src = cached.url;
        // The element is preload="metadata", so this arrives without starting playback.
        await new Promise<void>((resolve) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => resolve(), { once: true });
        });
        if (superseded()) return;
        if (audio.error) {
          fail("Could not load the audio.");
          return;
        }
      }
      const firstCut = cuts.find((cut) => cut.start_ms <= startMs && startMs < cut.end_ms);
      audio.currentTime = (firstCut ? firstCut.end_ms : startMs) / 1000;
      try {
        await audio.play();
      } catch {
        // A newer click pausing this one rejects play() with an AbortError; that is not a failure.
        fail("Could not play this clip.");
        return;
      }
      if (superseded()) return;
      timer.current = setInterval(
        () => {
          const nowMs = audio.currentTime * 1000;
          if (nowMs >= endMs || audio.ended) {
            stop();
            return;
          }
          const inCut = cuts.find((cut) => nowMs >= cut.start_ms && nowMs < cut.end_ms);
          if (inCut) audio.currentTime = inCut.end_ms / 1000;
        },
        cuts.length > 0 ? CUT_CHECK_MS : STOP_CHECK_MS,
      );
    },
    [playingKey, stop, applyLevel],
  );

  return { audioRef, play, stop, playingKey, error };
}
