"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPieceAudioUrl } from "../actions";
import { dbToLinear, PLAYBACK_LIMITER, type LiveChannel } from "@/lib/sourcework/loudness";

/** Signed URLs last 30 minutes; ask again well before that. */
const URL_MAX_AGE_MS = 20 * 60 * 1000;
const STOP_CHECK_MS = 40;

/**
 * One shared audio element for a piece: play any range of any of the project's
 * recordings, one at a time. The URL is signed at the moment of play (a page
 * left open outlives a URL baked in at render) and cached per source.
 *
 * Each range plays the way it exports (lib/sourcework/loudness.ts): the live channel of a
 * one-sided stereo clip fed to both sides, its fixed gain, then a DynamicsCompressorNode set up to
 * approximate the export's -6 dBFS hard limiter (it is an approximation, not the same algorithm).
 * The graph is what lets the gain lift quiet tape as well as cut hot tape; the element therefore
 * needs crossOrigin ("anonymous") so the signed Storage URL stays readable by it. Without Web Audio
 * it falls back to the element's volume, which can only cut.
 */
export interface PlayLevel {
  gainDb: number;
  /** Whether the limiter applies: false for an excerpt at its original level or not yet measured. */
  levelled: boolean;
  liveChannel: LiveChannel | null;
}

interface PlaybackGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  /** source → splitter → crossfeed → merger → gain, taken only for a one-sided clip. */
  splitter: ChannelSplitterNode;
  /** [left→left, left→right, right→left, right→right] */
  crossfeed: [GainNode, GainNode, GainNode, GainNode];
  gain: GainNode;
  limiter: DynamicsCompressorNode;
}

function buildGraph(audio: HTMLAudioElement): PlaybackGraph {
  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(audio);
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const gain = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  const crossfeed: PlaybackGraph["crossfeed"] = [
    ctx.createGain(),
    ctx.createGain(),
    ctx.createGain(),
    ctx.createGain(),
  ];
  // splitter outputs 0/1 are the left/right channels; merger inputs 0/1 are the left/right outputs.
  const routes = [
    { from: 0, to: 0 },
    { from: 0, to: 1 },
    { from: 1, to: 0 },
    { from: 1, to: 1 },
  ];
  crossfeed.forEach((node, index) => {
    const route = routes[index]!;
    splitter.connect(node, route.from);
    node.connect(merger, 0, route.to);
  });
  merger.connect(gain);
  gain.connect(limiter).connect(ctx.destination);
  return { ctx, source, splitter, crossfeed, gain, limiter };
}

export function usePiecePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Built once per element (an element can feed only one MediaElementSource) and kept for the page's life.
  const graph = useRef<PlaybackGraph | null>(null);

  /** Must run inside the click that starts playback, or the browser keeps the context suspended. */
  const applyLevel = useCallback((audio: HTMLAudioElement, level: PlayLevel) => {
    if (!graph.current) {
      try {
        graph.current = buildGraph(audio);
      } catch {
        graph.current = null;
      }
    }
    const current = graph.current;
    if (!current) {
      audio.volume = Math.min(1, dbToLinear(level.gainDb));
      return;
    }
    void current.ctx.resume();
    audio.volume = 1;

    const live = level.liveChannel;
    current.source.disconnect();
    current.source.connect(live == null ? current.gain : current.splitter);
    // A one-sided clip's live channel feeds both sides; any other clip never goes through here.
    const [leftToLeft, leftToRight, rightToLeft, rightToRight] = current.crossfeed;
    leftToLeft.gain.value = live === 1 ? 0 : 1;
    leftToRight.gain.value = live === 0 ? 1 : 0;
    rightToLeft.gain.value = live === 1 ? 1 : 0;
    rightToRight.gain.value = live === 0 ? 0 : 1;

    current.gain.gain.value = dbToLinear(level.gainDb);
    // Not levelled: the limiter is made transparent (ratio 1, threshold 0) rather than rewired.
    const limiter = current.limiter;
    limiter.threshold.value = level.levelled ? PLAYBACK_LIMITER.threshold : 0;
    limiter.knee.value = PLAYBACK_LIMITER.knee;
    limiter.ratio.value = level.levelled ? PLAYBACK_LIMITER.ratio : 1;
    limiter.attack.value = PLAYBACK_LIMITER.attack;
    limiter.release.value = PLAYBACK_LIMITER.release;
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    audioRef.current?.pause();
    setPlayingKey(null);
  }, []);

  useEffect(() => stop, [stop]);

  /** Plays [startMs, endMs) of a source at `level`. Playing the same key again stops it. */
  const play = useCallback(
    async (
      key: string,
      sourceId: string,
      startMs: number,
      endMs: number,
      level: PlayLevel = { gainDb: 0, levelled: false, liveChannel: null },
    ) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playingKey === key) {
        stop();
        return;
      }
      stop();
      setError(null);
      applyLevel(audio, level);

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
    [playingKey, stop, applyLevel],
  );

  return { audioRef, play, stop, playingKey, error };
}
