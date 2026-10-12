"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ExcerptTrimEditor, type TrimRange } from "@/components/transcription/excerpt-trim-editor";
import { useDelayedCommit } from "@/lib/use-delayed-commit";
import { actualityRange, cutsWithin, type ActualityBlock, type Cut } from "@/lib/sourcework/pieces";
import {
  DEFAULT_SILENCE_SETTING,
  SILENCE_SETTINGS,
  findSilenceCuts,
  totalCutMs,
} from "@/lib/sourcework/silences";
import type { TextSegment } from "@/lib/sourcework/piece-text";
import type { PieceExcerpt } from "@/lib/sourcework/piece-queries";
import { updateClipTrim } from "../../clip-actions";
import { loadTrimContext } from "../actions";

type Scope = "piece" | "everywhere";

const EXCERPT_COMMIT_DELAY_MS = 400;

/**
 * Trim an actuality in place (design §6.2): the clip's words in their
 * transcript context, tap a word to move the nearer end there, or nudge with
 * the −250 −50 +50 +250 chips. By default the trim belongs to this piece only
 * (the block's own in/out); the switch changes the excerpt itself and says how
 * many other pieces use it.
 */
export function TrimPanel({
  pieceId,
  block,
  excerpt,
  segments,
  onSegments,
  onTrimPiece,
  onExcerptChanged,
  onCuts,
  onPlay,
  playing,
  saveState,
  onClose,
}: {
  pieceId: string;
  block: ActualityBlock;
  excerpt: PieceExcerpt;
  segments: TextSegment[] | undefined;
  onSegments: (segments: TextSegment[]) => void;
  /** Set this block's own trim (null returns it to the excerpt's points). */
  onTrimPiece: (trim: { inMs: number; outMs: number } | null) => void;
  /** The excerpt itself moved: update every block that shows it. */
  onExcerptChanged: (startMs: number, endMs: number) => void;
  /** Set the pauses this piece leaves out of the clip (an empty list puts them all back). */
  onCuts: (cuts: Cut[]) => void;
  onPlay: (startMs: number, endMs: number, cuts: Cut[]) => void;
  playing: boolean;
  /** The editor's autosave state, so the panel can say whether the trim has landed. */
  saveState: "saved" | "dirty" | "saving" | "error" | "conflict";
  onClose: () => void;
}) {
  const initial = actualityRange(block, excerpt)!;
  const [range, setRange] = useState(initial);
  const [scope, setScope] = useState<Scope>("piece");
  const [otherPieces, setOtherPieces] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excerptPending, setExcerptPending] = useState(false);
  const [loadingContext, setLoadingContext] = useState(segments === undefined);
  const { schedule: scheduleCommit } = useDelayedCommit(EXCERPT_COMMIT_DELAY_MS);
  const [settingId, setSettingId] = useState<string>(DEFAULT_SILENCE_SETTING.id);
  // Pauses found but not yet accepted; null until "Find pauses" is pressed.
  const [proposal, setProposal] = useState<Cut[] | null>(null);
  const applied = useMemo(() => cutsWithin(block.cuts, range), [block.cuts, range]);

  // The transcript around the clip, and how many other pieces use it.
  useEffect(() => {
    let cancelled = false;
    loadTrimContext({ pieceId, excerptId: excerpt.id }).then((result) => {
      if (cancelled) return;
      setLoadingContext(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOtherPieces(result.otherPieces);
      onSegments(result.segments);
    });
    return () => {
      cancelled = true;
    };
    // Loaded once per open panel; the callbacks are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId, excerpt.id]);

  function apply(value: TrimRange) {
    setRange(value);
    setError(null);
    if (scope === "piece") {
      onTrimPiece({ inMs: value.startMs, outMs: value.endMs });
      return;
    }
    // Changing the excerpt is a write per pause, not per tap — same
    // hold-the-button pattern as the excerpt rail's own trim.
    onTrimPiece(null);
    setExcerptPending(true);
    scheduleCommit(async () => {
      const result = await updateClipTrim({
        clipId: excerpt.id,
        startMs: value.startMs,
        endMs: value.endMs,
      });
      setExcerptPending(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRange({ startMs: result.startMs, endMs: result.endMs });
      onExcerptChanged(result.startMs, result.endMs);
    });
  }

  function findPauses() {
    const setting =
      SILENCE_SETTINGS.find((item) => item.id === settingId) ?? DEFAULT_SILENCE_SETTING;
    setProposal(findSilenceCuts(segments ?? [], range, setting));
  }

  function acceptProposal() {
    if (!proposal) return;
    onCuts(proposal);
    setProposal(null);
  }

  const failed = saveState === "error" || saveState === "conflict";
  const saveStatus = failed
    ? "Not saved yet. Play as cut still uses the points shown above."
    : excerptPending || saveState === "dirty" || saveState === "saving"
      ? "Saving…"
      : "Saved";

  return (
    <div className="rounded border border-brand-primary bg-white p-4 shadow-[0_0_0_2px_#D5EAF6]">
      <div className="mb-2.5 flex items-center">
        <span className="flex-1 text-[13px] font-bold">
          Trim this clip <span className="font-normal text-ink-400">· from ⋮ › Trim…</span>
        </span>
        <Button
          type="button"
          variant="link"
          onClick={onClose}
          className="text-brand-link max-lg:min-h-11"
        >
          Done
        </Button>
      </div>

      <ExcerptTrimEditor
        range={range}
        speaker={excerpt.speaker}
        segments={segments}
        loadingContext={loadingContext}
        sourceDurationMs={excerpt.sourceDurationMs}
        onChange={apply}
        onPlay={(r) => onPlay(r.startMs, r.endMs, proposal ?? applied)}
        playing={playing}
        cuts={applied}
        proposedCuts={proposal ?? undefined}
      >
        <div className="mt-3 border-t border-line pt-2.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3.5">
            <span className="text-[13px] font-bold">Pauses</span>
            <Segmented
              name={`pause-setting-${block.id}`}
              options={SILENCE_SETTINGS.map((item) => ({ value: item.id, label: item.label }))}
              value={settingId}
              onChange={(value) => {
                setSettingId(value);
                setProposal(null);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!segments?.length}
              onClick={findPauses}
              className="max-lg:min-h-11"
            >
              Find pauses
            </Button>
          </div>
          {proposal && (
            <div className="mt-2 flex flex-col gap-2 text-xs text-ink-500 lg:flex-row lg:items-center lg:gap-3.5">
              {proposal.length === 0 ? (
                <span>No pauses that long in this clip. Try a tighter setting.</span>
              ) : (
                <>
                  <span>
                    {proposal.length} {proposal.length === 1 ? "pause" : "pauses"} to shorten,
                    saving {(totalCutMs(proposal) / 1000).toFixed(1)}s. Marked in the words above;
                    use Play as cut to hear it first.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={acceptProposal}
                    className="max-lg:min-h-11"
                  >
                    Remove these pauses
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="link"
                onClick={() => setProposal(null)}
                className="text-brand-link max-lg:min-h-11"
              >
                {proposal.length === 0 ? "Close" : "Cancel"}
              </Button>
            </div>
          )}
          {!proposal && applied.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
              {applied.length} {applied.length === 1 ? "pause" : "pauses"} shortened in this piece,
              saving {(totalCutMs(applied) / 1000).toFixed(1)}s.
              <Button
                type="button"
                variant="link"
                onClick={() => onCuts([])}
                className="text-brand-link max-lg:min-h-11"
              >
                Put the pauses back
              </Button>
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2.5 lg:flex-row lg:items-center lg:gap-3.5">
          <Segmented
            name={`trim-scope-${block.id}`}
            options={[
              { value: "piece", label: "Only in this piece" },
              { value: "everywhere", label: "Update the excerpt everywhere" },
            ]}
            value={scope}
            onChange={setScope}
          />
          <span className="text-xs text-ink-400">
            {otherPieces === null
              ? "Piece length updates as you trim."
              : otherPieces === 0
                ? "No other piece uses this excerpt. The length above updates as you trim."
                : `The excerpt is also used in ${otherPieces} other ${otherPieces === 1 ? "piece" : "pieces"}. The length above updates as you trim.`}
          </span>
        </div>
        <p role="status" className="mt-2 text-xs text-ink-500">
          {saveStatus}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </ExcerptTrimEditor>
    </div>
  );
}
