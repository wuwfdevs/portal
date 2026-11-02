"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { CONTROL_ROW } from "@/components/ui/control-row";
import { formatShortDate, pluralize } from "@/lib/format";
import {
  dataPointTag,
  firstStartMs,
  questionTitle,
  type BackgroundLink,
  type ContextNote,
  type DataPoint,
} from "@/lib/sourcework/research";
import type { ClipRange, QuoteSuggestion } from "@/lib/sourcework/quotes";
import type { ReviewGroup } from "@/lib/sourcework/review-queries";
import { sourcePath } from "@/lib/transcription/links";
import { BulkAcceptButton, AcceptAllDataPoints } from "./bulk-accept-button";
import { DataPointCard } from "./data-point-card";
import { QuoteCard } from "./quote-card";
import { acceptAllSuggestedClips, signReviewMedia } from "../review-actions";
import { actionOk } from "@/lib/action-response";

/**
 * Every finding and clip waiting for a decision, grouped by source, with one control to accept them
 * all. A card plays its passage from the source's recording through one shared audio element (the
 * source screen's player is not here), and "Open in source" goes to the passage beside its transcript.
 */
export function ReviewList({
  projectId,
  groups,
  labels,
  questionTexts,
  background,
  pagesConsulted,
  pointCount,
  clipCount,
}: {
  projectId: string;
  groups: ReviewGroup[];
  labels: Record<string, string>;
  questionTexts: Record<string, string>;
  background: Record<string, BackgroundLink[]>;
  pagesConsulted: ContextNote[];
  pointCount: number;
  clipCount: number;
}) {
  const router = useRouter();
  const labelMap = useMemo(() => new Map(Object.entries(labels)), [labels]);
  const textMap = useMemo(() => new Map(Object.entries(questionTexts)), [questionTexts]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef(new Map<string, string>());
  const stopAt = useRef<number | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [decidedClips, setDecidedClips] = useState<ReadonlySet<string>>(new Set());

  const pause = useCallback(() => {
    stopAt.current = null;
    audioRef.current?.pause();
    setPlayingKey(null);
  }, []);

  const play = useCallback(async (key: string, sourceId: string, range: ClipRange) => {
    const el = audioRef.current;
    if (!el) return;
    setPlayError(null);
    let url = urls.current.get(sourceId);
    if (!url) {
      const signed = await signReviewMedia({ sourceId });
      if (!signed.ok) {
        setPlayError(signed.error);
        return;
      }
      url = signed.url;
      urls.current.set(sourceId, url);
    }
    if (el.getAttribute("data-source") !== sourceId) {
      el.src = url;
      el.setAttribute("data-source", sourceId);
      await new Promise<void>((resolve) => {
        el.addEventListener("loadedmetadata", () => resolve(), { once: true });
        el.load();
      });
    }
    stopAt.current = range.endMs;
    el.currentTime = range.startMs / 1000;
    setPlayingKey(key);
    void el.play().catch(() => setPlayingKey(null));
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (stopAt.current !== null && el.currentTime * 1000 >= stopAt.current) pause();
    };
    const onEnded = () => setPlayingKey(null);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
    };
  }, [pause]);

  const sourceIds = groups.map((group) => group.source.id);
  const waitingClips = clipCount - decidedClips.size;

  return (
    <div className="flex flex-col gap-6">
      <audio ref={audioRef} preload="none" className="hidden" />
      <div className="flex flex-col gap-3 rounded border border-line bg-panel-50 p-4">
        <p className="text-sm text-ink-700">
          <strong>
            {pluralize(pointCount, "finding")} and {pluralize(waitingClips, "clip")}
          </strong>{" "}
          from {pluralize(groups.length, "source")} are waiting for a decision. Nothing here is
          deleted by deciding: an accepted finding can be put back, and a rejected one too.
        </p>
        <div className={`${CONTROL_ROW} sm:items-start`}>
          {pointCount > 0 && <AcceptAllDataPoints projectId={projectId} count={pointCount} />}
          {waitingClips > 0 && (
            <BulkAcceptButton
              label={`Accept all ${waitingClips} ${waitingClips === 1 ? "clip" : "clips"}`}
              confirmLabel={`Accept ${pluralize(waitingClips, "clip")}`}
              message={
                <>
                  Make {waitingClips === 1 ? "the clip" : `all ${waitingClips} clips`} into excerpts
                  at the range Analyze proposed? Each excerpt can still be trimmed or deleted in its
                  source afterwards.
                </>
              }
              run={async () => {
                const result = await acceptAllSuggestedClips({ projectId, sourceIds });
                if (!result.ok) return result;
                router.refresh();
                return actionOk({
                  summary:
                    `Made ${pluralize(result.accepted, "excerpt")}.` +
                    (result.skipped > 0
                      ? ` ${pluralize(result.skipped, "clip")} couldn't be accepted and ${result.skipped === 1 ? "is" : "are"} still waiting.`
                      : ""),
                });
              }}
            />
          )}
        </div>
      </div>
      {playError && <Alert variant="danger">{playError}</Alert>}
      <PagesConsulted projectId={projectId} notes={pagesConsulted} />

      {groups.map((group) => {
        const clips = group.clips.filter((clip) => !decidedClips.has(clip.id));
        const isDocument = group.source.kind === "document";
        return (
          <section
            key={group.source.id}
            aria-label={group.source.title}
            className="flex flex-col gap-3"
          >
            <h2 className="flex items-baseline gap-2 text-sm font-bold text-ink-900">
              <Link
                href={sourcePath(group.source.id, { projectId })}
                className="text-brand-link hover:underline"
              >
                {group.source.title}
              </Link>
              <span className="text-xs font-normal text-ink-500">
                {pluralize(group.points.length, "finding")}
                {clips.length > 0 && ` · ${pluralize(clips.length, "clip")}`}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {clips.map((clip: QuoteSuggestion) => (
                <QuoteCard
                  key={clip.id}
                  quote={clip}
                  playing={playingKey === `clip:${clip.id}`}
                  onPlay={(range) =>
                    playingKey === `clip:${clip.id}`
                      ? pause()
                      : void play(`clip:${clip.id}`, clip.sourceId, range)
                  }
                  onDecided={(id) => {
                    pause();
                    setDecidedClips((current) => new Set(current).add(id));
                    router.refresh();
                  }}
                />
              ))}
              {group.points.map((point: DataPoint) => {
                const span = point.spans.find((candidate) => candidate.kind === "temporal");
                const openHref = sourcePath(group.source.id, {
                  projectId,
                  t: firstStartMs(point.spans),
                  page: point.spans[0]?.kind === "document" ? point.spans[0].pageNumber : null,
                });
                return (
                  <DataPointCard
                    key={point.id}
                    point={point}
                    tag={dataPointTag(point, labelMap)}
                    tagTitle={questionTitle(point, labelMap, textMap)}
                    isSelected={false}
                    selectionOrigin={null}
                    onSelect={() => undefined}
                    onPlay={
                      !isDocument && span?.kind === "temporal"
                        ? () =>
                            void play(`point:${point.id}`, point.sourceId, {
                              startMs: span.startMs,
                              endMs: span.endMs,
                            })
                        : undefined
                    }
                    onPause={pause}
                    isPlaying={playingKey === `point:${point.id}`}
                    background={background[point.id] ?? []}
                    onOpen={() => router.push(openHref)}
                    openLabel="Open in source"
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The web pages the model looked up while analyzing, so a reviewer can see what outside material
 * shaped its reading. Context only: nothing here is evidence, and a finding's card names the pages
 * behind it. Dismissing one is done on the Setup tab.
 */
function PagesConsulted({ projectId, notes }: { projectId: string; notes: ContextNote[] }) {
  if (notes.length === 0) return null;
  return (
    <details className="rounded border border-line bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink-900">
        Pages the model looked up · {notes.length}
      </summary>
      <p className="mt-2 text-xs text-ink-500">
        Outside material the model used to understand places, terms and claims in your sources. It
        is background for reading, never quoted and never evidence.{" "}
        <Link
          href={`/sourcework/${projectId}?view=setup`}
          className="font-semibold text-brand-link"
        >
          Dismiss one on the Setup tab
        </Link>
        .
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {notes.map((note) => (
          <li key={note.id} className="py-2">
            <a
              href={note.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-link hover:underline"
            >
              {note.title}
            </a>
            <p className="mt-0.5 text-ink-700">{note.summary}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              {note.sourceName} · retrieved {formatShortDate(note.retrievedAt)}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
