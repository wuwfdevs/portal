// Browser-side playback of an excerpt the way it exports (lib/sourcework/loudness.ts): the live
// channel of a one-sided stereo clip fed to both sides, its fixed gain, then a DynamicsCompressorNode
// set up to approximate the export's -6 dBFS hard limiter (an approximation, not the same algorithm).
// The graph is what lets the gain lift quiet tape as well as cut hot tape. The element needs
// crossOrigin="anonymous" so the signed Storage URL stays readable by it. An element can feed only
// one MediaElementSource, so whoever owns the element keeps one graph for its life.
import { dbToLinear, PLAYBACK_LIMITER, type LiveChannel } from "./loudness";

export interface PlayLevel {
  gainDb: number;
  /** Whether the limiter applies: false for an excerpt at its original level or not yet measured. */
  levelled: boolean;
  liveChannel: LiveChannel | null;
}

/** Plays as recorded: no gain, a transparent limiter, no channel fix. */
export const NEUTRAL_LEVEL: PlayLevel = { gainDb: 0, levelled: false, liveChannel: null };

export interface PlaybackGraph {
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

/** The graph for an element, or null when Web Audio isn't available. */
export function createPlaybackGraph(
  audio: HTMLAudioElement | HTMLMediaElement,
): PlaybackGraph | null {
  try {
    return buildGraph(audio as HTMLAudioElement);
  } catch {
    return null;
  }
}

/**
 * Sets the graph (or, without one, the element's volume, which can only cut) to a level. Must run
 * inside the click that starts playback, or the browser keeps the context suspended.
 */
export function applyPlaybackLevel(
  audio: HTMLMediaElement,
  graph: PlaybackGraph | null,
  level: PlayLevel,
): void {
  if (!graph) {
    audio.volume = Math.min(1, dbToLinear(level.gainDb));
    return;
  }
  void graph.ctx.resume();
  audio.volume = 1;

  const live = level.liveChannel;
  graph.source.disconnect();
  graph.source.connect(live == null ? graph.gain : graph.splitter);
  // A one-sided clip's live channel feeds both sides; any other clip never goes through here.
  const [leftToLeft, leftToRight, rightToLeft, rightToRight] = graph.crossfeed;
  leftToLeft.gain.value = live === 1 ? 0 : 1;
  leftToRight.gain.value = live === 0 ? 1 : 0;
  rightToLeft.gain.value = live === 1 ? 1 : 0;
  rightToRight.gain.value = live === 0 ? 0 : 1;

  graph.gain.gain.value = dbToLinear(level.gainDb);
  // Not levelled: the limiter is made transparent (ratio 1, threshold 0) rather than rewired.
  const limiter = graph.limiter;
  limiter.threshold.value = level.levelled ? PLAYBACK_LIMITER.threshold : 0;
  limiter.knee.value = PLAYBACK_LIMITER.knee;
  limiter.ratio.value = level.levelled ? PLAYBACK_LIMITER.ratio : 1;
  limiter.attack.value = PLAYBACK_LIMITER.attack;
  limiter.release.value = PLAYBACK_LIMITER.release;
}
