"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatClock } from "@/lib/format";
import { useBeforeUnloadGuard } from "@/lib/use-event-listener";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { useMediaQuery } from "@/lib/use-media-query";
import { useRightPanel } from "@/components/right-panel";
import { projectPath } from "@/lib/transcription/links";
import {
  actualityRange,
  computePieceLength,
  describeAgainstTarget,
  insertBlockAt,
  moveBlock,
  moveBlockTo,
  newActuality,
  newNarration,
  parseTargetInput,
  pieceAsText,
  removeBlock,
  setActualityTrim,
  setNarrationText,
  swapExcerpt,
  undoAssistantChange,
  type ActualityBlock,
  type PieceBlock,
} from "@/lib/sourcework/pieces";
import { textForRange, type TextSegment } from "@/lib/sourcework/piece-text";
import type { PieceDetail, PieceExcerpt } from "@/lib/sourcework/piece-queries";
import type { MaterialSummary } from "@/lib/sourcework/piece-draft-run";
import { ExportExcerptsButton } from "../../export-excerpts-button";
import {
  deletePiece,
  listPieceVersions,
  renamePiece,
  restorePieceVersion,
  savePieceBody,
  setPieceTarget,
  type PieceVersionRow,
} from "../actions";
import { DraftWithAi, type DraftFormatOption } from "./draft-with-ai";
import { ExcerptPicker } from "./excerpt-picker";
import { ActualityRow, FooterButton, NarrationRow } from "./piece-blocks";
import { PieceInsertionPoint } from "./piece-insertion-point";
import { TrimPanel } from "./trim-panel";
import { usePiecePlayer } from "./use-piece-player";

const AUTOSAVE_DELAY_MS = 1500;
const DEFAULT_TITLE = "Untitled piece";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export function PieceEditor({
  piece,
  pickerExcerpts,
  draftFormats,
  draftMaterial,
}: {
  piece: PieceDetail;
  pickerExcerpts: PieceExcerpt[];
  /** The formats Draft with AI offers; empty unless the piece is blank. */
  draftFormats: DraftFormatOption[];
  /** The themes and excerpts Draft with AI would use; null unless the piece is blank. */
  draftMaterial: MaterialSummary | null;
}) {
  const router = useRouter();
  const rightPanel = useRightPanel();
  const narrow = useMediaQuery("(max-width: 1023px)");
  const { audioRef, play, stop, playingKey, error: playerError } = usePiecePlayer();
  const { copy, status: copyStatus } = useCopyToClipboard();

  const [blocks, setBlocks] = useState<PieceBlock[]>(piece.blocks);
  const [title, setTitle] = useState(piece.title);
  const [targetSeconds, setTargetSeconds] = useState(piece.targetSeconds);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [excerpts, setExcerpts] = useState(
    () => new Map([...pickerExcerpts, ...piece.excerpts].map((e) => [e.id, e])),
  );
  const [segments, setSegments] = useState<Record<string, TextSegment[]>>(piece.segmentsByExcerpt);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [trimmingId, setTrimmingId] = useState<string | null>(null);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [emptyPicker, setEmptyPicker] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PieceVersionRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  // "Edited by the assistant · Undo" until the next person edit (§6.4).
  const [assistantChanges, setAssistantChanges] = useState(piece.assistantChanges);
  // "Drafted from Radio wrap v3 · Undo", until anything else is saved.
  const [justDrafted, setJustDrafted] = useState(piece.origin.justDrafted);
  const dragId = useRef<string | null>(null);

  // Save plumbing. The latest blocks live in a ref so a save in flight never
  // writes a stale snapshot, and edits made while it runs queue one more.
  const blocksRef = useRef(blocks);
  const versionRef = useRef(piece.version);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      while (dirtyRef.current) {
        dirtyRef.current = false;
        setSaveState("saving");
        const result = await savePieceBody({
          pieceId: piece.id,
          baseVersion: versionRef.current,
          body: blocksRef.current,
        });
        if (result.ok) {
          versionRef.current = result.version;
          setSavedAt(new Date());
          continue;
        }
        dirtyRef.current = true;
        if ("conflict" in result) {
          setSaveState("conflict");
          return;
        }
        setSaveError(result.error);
        setSaveState("error");
        return;
      }
      setSaveError(null);
      setSaveState("saved");
    } finally {
      savingRef.current = false;
    }
  }, [piece.id]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const commit = useCallback(
    (next: PieceBlock[], options: { keepMarkers?: boolean } = {}) => {
      blocksRef.current = next;
      setBlocks(next);
      dirtyRef.current = true;
      setSaveState((state) => (state === "conflict" ? state : "dirty"));
      // A person's edit ends the assistant's markers and the draft note (§6.4), except
      // undoing one marked block, which leaves the others marked.
      if (!options.keepMarkers) setAssistantChanges({});
      setJustDrafted(false);
      schedule();
    },
    [schedule],
  );

  // The assistant works on this piece while it is open (§6.4): it says "Working in: <title>",
  // and anything typed is saved before a message goes, so it edits what the person sees.
  const { setAssistantContext } = rightPanel;
  const flushNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    await flush();
  }, [flush]);
  const [contextTitle, setContextTitle] = useState(piece.title);
  useEffect(() => {
    setAssistantContext({
      kind: "piece",
      pieceId: piece.id,
      title: contextTitle,
      beforeSend: flushNow,
    });
    return () => setAssistantContext(null);
  }, [setAssistantContext, piece.id, contextTitle, flushNow]);

  useBeforeUnloadGuard(saveState === "dirty" || saveState === "saving");

  const length = useMemo(
    () => computePieceLength(blocks, [...excerpts.values()]),
    [blocks, excerpts],
  );
  const against = describeAgainstTarget(length.totalSeconds, targetSeconds);
  const overTarget = targetSeconds !== null && length.totalSeconds > targetSeconds;

  function wordsFor(block: ActualityBlock): string {
    const excerpt = excerpts.get(block.excerpt_id);
    if (!excerpt) return "";
    const range = actualityRange(block, excerpt)!;
    const loaded = segments[excerpt.id];
    const derived = loaded?.length ? textForRange(loaded, range.startMs, range.endMs) : "";
    return derived || (block.in_ms === undefined ? excerpt.text : "");
  }

  // Edits ---------------------------------------------------------------------

  function addNarrationAt(index: number) {
    const block = newNarration(crypto.randomUUID());
    commit(insertBlockAt(blocksRef.current, index, block));
    setFocusId(block.id);
  }

  function addExcerptAt(index: number, excerpt: PieceExcerpt) {
    setExcerpts((current) => new Map(current).set(excerpt.id, excerpt));
    commit(insertBlockAt(blocksRef.current, index, newActuality(crypto.randomUUID(), excerpt.id)));
  }

  function removeAndFocusPrevious(id: string) {
    const index = blocksRef.current.findIndex((block) => block.id === id);
    const previous = blocksRef.current[index - 1];
    commit(removeBlock(blocksRef.current, id));
    if (previous?.type === "narration") setFocusId(previous.id);
  }

  function startDrag(id: string) {
    dragId.current = id;
  }

  function dropOn(overId: string) {
    if (dragId.current) commit(moveBlockTo(blocksRef.current, dragId.current, overId));
    dragId.current = null;
  }

  function playBlock(block: ActualityBlock) {
    const excerpt = excerpts.get(block.excerpt_id);
    const range = excerpt && actualityRange(block, excerpt);
    if (!excerpt || !range) return;
    void play(block.id, excerpt.sourceId, range.startMs, range.endMs);
  }

  /** "Edited by the assistant · Undo" on a block the assistant changed (§6.4). */
  function assistantNoteFor(block: PieceBlock): ReactNode {
    if (!(block.id in assistantChanges)) return null;
    const previous = assistantChanges[block.id] ?? null;
    return (
      <p className="mt-1.5 text-xs text-ink-500">
        {previous ? "Edited by the assistant" : "Added by the assistant"} ·{" "}
        <button
          type="button"
          onClick={() => {
            const rest = { ...assistantChanges };
            delete rest[block.id];
            setAssistantChanges(rest);
            commit(undoAssistantChange(blocksRef.current, block.id, previous), {
              keepMarkers: true,
            });
          }}
          className="font-bold text-brand-link max-lg:min-h-11"
        >
          Undo
        </button>
      </p>
    );
  }

  function askAssistantAfter(label: string) {
    rightPanel.askAssistant(`Write a narration block after ${label}: `);
  }

  function menuFor(block: PieceBlock, index: number): ActionMenuItem[] {
    const move: ActionMenuItem[] = [
      {
        label: "Move up",
        disabled: index === 0,
        onClick: () => commit(moveBlock(blocksRef.current, block.id, -1)),
      },
      {
        label: "Move down",
        disabled: index === blocks.length - 1,
        onClick: () => commit(moveBlock(blocksRef.current, block.id, 1)),
      },
    ];
    if (block.type === "narration") {
      return [
        ...move,
        {
          label: "Remove block…",
          variant: "danger",
          dividerBefore: true,
          confirm: {
            message: block.text.trim()
              ? "Remove this narration? You can get it back from History."
              : "Remove this empty narration block?",
            confirmLabel: "Remove",
          },
          onClick: () => commit(removeBlock(blocksRef.current, block.id)),
        },
      ];
    }
    const missing = !excerpts.get(block.excerpt_id);
    return [
      ...move,
      { label: "Swap excerpt…", onClick: () => setSwappingId(block.id) },
      {
        label: "Trim…",
        disabled: missing,
        hint: missing ? "This excerpt was deleted." : undefined,
        onClick: () => setTrimmingId(block.id),
      },
      {
        label: "Remove from piece…",
        variant: "danger",
        dividerBefore: true,
        confirm: {
          message: "Remove this excerpt from the piece? The excerpt itself stays in the project.",
          confirmLabel: "Remove",
        },
        onClick: () => commit(removeBlock(blocksRef.current, block.id)),
      },
    ];
  }

  // Header --------------------------------------------------------------------

  async function saveTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(piece.title);
      return;
    }
    if (next === piece.title) return;
    const result = await renamePiece({ pieceId: piece.id, title: next });
    if (!result.ok) {
      setHeaderError(result.error);
      setTitle(piece.title);
      return;
    }
    setHeaderError(null);
    setContextTitle(next);
  }

  async function saveTarget() {
    const trimmed = targetInput.trim();
    const parsed = trimmed === "" ? null : parseTargetInput(trimmed);
    if (trimmed !== "" && parsed === null) {
      setHeaderError("Enter a length like 1:00, 90 or 2m.");
      return;
    }
    const result = await setPieceTarget({ pieceId: piece.id, targetSeconds: parsed });
    if (!result.ok) {
      setHeaderError(result.error);
      return;
    }
    setHeaderError(null);
    setTargetSeconds(parsed);
    setEditingTarget(false);
  }

  async function openHistory() {
    const open = !historyOpen;
    setHistoryOpen(open);
    if (!open) return;
    setHistoryError(null);
    const result = await listPieceVersions(piece.id);
    if (!result.ok) {
      setHistoryError(result.error);
      return;
    }
    setVersions(result.versions);
  }

  async function restore(version: number) {
    // Anything typed but not yet saved goes first, so restoring cannot lose it.
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();
    const result = await restorePieceVersion({
      pieceId: piece.id,
      version,
      baseVersion: versionRef.current,
    });
    if (!result.ok) {
      if ("conflict" in result) setSaveState("conflict");
      else setHistoryError(result.error);
      return;
    }
    versionRef.current = result.version;
    blocksRef.current = result.blocks;
    setBlocks(result.blocks);
    setAssistantChanges({});
    setJustDrafted(false);
    setSavedAt(new Date());
    setSaveState("saved");
    const refreshed = await listPieceVersions(piece.id);
    if (refreshed.ok) setVersions(refreshed.versions);
  }

  const savedLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "dirty"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Not saved"
          : savedAt
            ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "All changes saved";

  const pieceMenu: ActionMenuItem[] = [
    {
      label: "Delete piece…",
      variant: "danger",
      confirm: {
        message: "Delete this piece and its history? The project’s excerpts are not affected.",
        confirmLabel: "Delete piece",
      },
      onClick: async () => {
        const result = await deletePiece(piece.id);
        if (!result.ok) return { error: result.error };
        dirtyRef.current = false;
        router.push(projectPath(piece.projectId, "pieces"));
      },
    },
  ];

  const trimming = blocks.find(
    (block): block is ActualityBlock => block.id === trimmingId && block.type === "actuality",
  );
  const trimmingExcerpt = trimming && excerpts.get(trimming.excerpt_id);
  const isBlank = blocks.length === 0;

  function panelFor(content: ReactNode, label: string, close: () => void) {
    if (!narrow) return <div className="my-1 lg:mx-[100px] lg:mr-10">{content}</div>;
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute inset-0 bg-[rgba(15,34,53,0.5)]"
        />
        <div
          role="dialog"
          aria-label={label}
          className="relative max-h-[90vh] overflow-y-auto rounded-t-xl bg-white p-4"
        >
          {content}
        </div>
      </div>,
      document.body,
    );
  }

  const denominator = Math.max(targetSeconds ?? 0, length.totalSeconds, 1);

  return (
    <div className="max-lg:pb-20">
      <audio ref={audioRef} preload="none" className="hidden" />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="piece-title"
            className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-400 lg:text-xs"
          >
            {piece.origin.format ? (
              <>
                {piece.origin.format.name}
                <span className="max-lg:hidden"> format v{piece.origin.format.version}</span>
              </>
            ) : (
              "Piece"
            )}
          </label>
          <Input
            id="piece-title"
            value={title}
            maxLength={200}
            autoFocus={piece.version === 0 && piece.title === DEFAULT_TITLE}
            onFocus={(event) => {
              if (title === DEFAULT_TITLE) event.currentTarget.select();
            }}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={`mt-1 border-2 font-serif text-xl font-bold lg:text-2xl ${title === DEFAULT_TITLE ? "text-ink-400" : "text-ink-900"}`}
          />
        </div>
        <div className="mt-6 flex items-center gap-2">
          <span className="hidden text-xs text-ink-400 lg:inline" aria-live="polite">
            {savedLabel} ·{" "}
            <button
              type="button"
              onClick={() => void openHistory()}
              aria-expanded={historyOpen}
              className="font-bold text-brand-link"
            >
              History
            </button>
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => rightPanel.toggle("assistant")}
            aria-expanded={rightPanel.open === "assistant"}
            className="max-lg:hidden"
          >
            Assistant
          </Button>
          <ActionMenu label="Piece actions" items={pieceMenu} />
        </div>
      </div>
      {headerError && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {headerError}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="font-mono text-sm">
          <strong>{formatClock(length.totalSeconds)}</strong>{" "}
          <span className={overTarget ? "text-danger" : "text-ink-500"}>
            {targetSeconds === null
              ? "· no target length"
              : `of ${formatClock(targetSeconds)} · ${against}`}
          </span>
        </span>
        {editingTarget ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveTarget();
            }}
            className="flex items-center gap-2"
          >
            <Input
              autoFocus
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
              placeholder="1:00"
              aria-label="Target length"
              className="w-24 px-2.5 py-1.5"
            />
            <Button type="submit" size="sm" className="max-lg:min-h-11">
              Save
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => setEditingTarget(false)}
              className="max-lg:min-h-11"
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setTargetInput(targetSeconds === null ? "" : formatClock(targetSeconds));
              setEditingTarget(true);
            }}
            className="text-brand-link max-lg:min-h-11"
          >
            {targetSeconds === null ? "Set a target" : "Change target"}
          </Button>
        )}
        {!isBlank && (
          <>
            <div
              role="img"
              aria-label={`Narration ${formatClock(length.narrationSeconds)}, actualities ${formatClock(length.actualitySeconds)}`}
              className="flex h-2.5 min-w-32 flex-1 overflow-hidden rounded-full bg-panel-100 max-lg:order-last max-lg:basis-full"
            >
              {blocks.map((block) => {
                const seconds = length.perBlock.get(block.id) ?? 0;
                return (
                  <div
                    key={block.id}
                    style={{ width: `${(seconds / denominator) * 100}%` }}
                    className={block.type === "actuality" ? "bg-brand-link" : "bg-ink-400/40"}
                  />
                );
              })}
            </div>
            <span className="text-xs text-ink-500">
              Narration {formatClock(length.narrationSeconds)} · Actualities{" "}
              {formatClock(length.actualitySeconds)}
            </span>
          </>
        )}
      </div>

      {justDrafted && piece.origin.format && (
        <p
          className="mt-2.5 rounded border border-line bg-panel-50 px-3 py-2 text-[13px] text-ink-700"
          role="status"
        >
          Drafted from {piece.origin.format.name} v{piece.origin.format.version} ·{" "}
          {formatClock(length.totalSeconds)}
          {targetSeconds !== null && ` of ${formatClock(targetSeconds)}`} ·{" "}
          <button
            type="button"
            onClick={() => void restore(piece.version - 1)}
            className="font-bold text-brand-link max-lg:min-h-11"
          >
            Undo
          </button>
          <span className="text-ink-500">
            {" "}
            · Edit it by hand, or ask the assistant for changes.
          </span>
        </p>
      )}

      {saveState === "conflict" && (
        <div role="alert" className="mt-3 rounded border border-danger/40 bg-white p-3 text-sm">
          Someone else saved this piece while you were editing it. Reload to see their version; your
          last changes here were not saved.{" "}
          <Button
            type="button"
            variant="link"
            onClick={() => window.location.reload()}
            className="text-brand-link"
          >
            Reload
          </Button>
        </div>
      )}
      {saveState === "error" && saveError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {saveError} Your changes are still here and will be saved again on your next edit.
        </p>
      )}
      {playerError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {playerError}
        </p>
      )}

      {historyOpen && (
        <section aria-label="History" className="mt-4 rounded border border-line bg-white p-3.5">
          <h2 className="mb-2 text-sm font-bold">History</h2>
          {historyError && <p className="mb-2 text-sm text-danger">{historyError}</p>}
          {versions === null ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing saved yet.</p>
          ) : (
            <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto">
              {versions.map((row) => (
                <li key={row.version} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1">
                    <span className="font-semibold">Version {row.version}</span>{" "}
                    <span className="text-ink-500">
                      ·{" "}
                      {row.savedVia === "person"
                        ? row.savedBy
                        : row.savedVia === "generation"
                          ? `Draft with AI, for ${row.savedBy}`
                          : `the assistant, for ${row.savedBy}`}{" "}
                      ·{" "}
                      {new Date(row.createdAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                  {row.current ? (
                    <span className="text-xs text-ink-400">Current</span>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void restore(row.version)}
                      className="max-lg:min-h-11"
                    >
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isBlank && drafting && draftMaterial && (
        <DraftWithAi
          pieceId={piece.id}
          getVersion={() => versionRef.current}
          beforeGenerate={flushNow}
          formats={draftFormats}
          material={draftMaterial}
          onCancel={() => setDrafting(false)}
          onDrafted={() => {
            // The draft is a new version on the server; the page reloads into it.
            dirtyRef.current = false;
            router.refresh();
          }}
        />
      )}
      {isBlank && !(drafting && !narrow) ? (
        <div className="mt-5 rounded border border-dashed border-line bg-panel-50 px-6 py-9 text-center max-lg:px-4 max-lg:py-6">
          <p className="text-[15px] font-bold text-ink-700">Start your piece</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-ink-500">
            {draftMaterial ? (
              <>
                <span className="max-lg:hidden">
                  Write narration and add excerpts one block at a time. Or let AI draft a first
                  version from your themes, then keep editing by hand.
                </span>
                <span className="lg:hidden">
                  Add narration and excerpts one block at a time, or let AI draft a first version.
                </span>
              </>
            ) : (
              "Write narration and add excerpts one block at a time."
            )}
          </p>
          <div className="mt-4 flex justify-center gap-2.5 max-lg:flex-col">
            <Button type="button" onClick={() => addNarrationAt(0)} className="max-lg:min-h-11">
              + Narration
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEmptyPicker((open) => !open)}
              aria-expanded={emptyPicker}
              className="max-lg:min-h-11"
            >
              + Excerpt
            </Button>
            {draftMaterial && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDrafting(true)}
                className="bg-brand-surface max-lg:min-h-11"
              >
                Draft with AI
              </Button>
            )}
          </div>
          {emptyPicker &&
            panelFor(
              <div className="mt-4 text-left">
                <ExcerptPicker
                  listId="piece-picker-empty"
                  excerpts={[...pickerExcerpts]}
                  onPick={(excerpt) => {
                    addExcerptAt(0, excerpt);
                    setEmptyPicker(false);
                  }}
                />
              </div>,
              "Add an excerpt",
              () => setEmptyPicker(false),
            )}
        </div>
      ) : isBlank ? null : (
        <div className="mt-5 flex flex-col gap-0.5">
          <PieceInsertionPoint
            id="0"
            excerpts={pickerExcerpts}
            onAddNarration={() => addNarrationAt(0)}
            onAddExcerpt={(excerpt) => addExcerptAt(0, excerpt)}
            onAskAssistant={() => askAssistantAfter("the start (make it the first block)")}
            afterLabel="the start"
          />
          {blocks.map((block, index) => {
            const common = { onDragStart: startDrag, onDropOn: dropOn };
            const seconds = length.perBlock.get(block.id) ?? 0;
            const swapping = swappingId === block.id;
            return (
              <div key={block.id} className="flex flex-col gap-0.5">
                {block.type === "narration" ? (
                  <NarrationRow
                    block={block}
                    seconds={seconds}
                    focus={focusId === block.id}
                    onFocused={() => setFocusId(null)}
                    onChange={(text) => commit(setNarrationText(blocksRef.current, block.id, text))}
                    onEnterAtEnd={() => addNarrationAt(index + 1)}
                    onBackspaceEmpty={() => removeAndFocusPrevious(block.id)}
                    assistantNote={assistantNoteFor(block)}
                    menuItems={menuFor(block, index)}
                    {...common}
                  />
                ) : (
                  <>
                    <ActualityRow
                      block={block}
                      excerpt={excerpts.get(block.excerpt_id)}
                      text={wordsFor(block)}
                      seconds={seconds}
                      trimmed={block.in_ms !== undefined}
                      playing={playingKey === block.id}
                      onPlay={() => playBlock(block)}
                      assistantNote={assistantNoteFor(block)}
                      menuItems={menuFor(block, index)}
                      {...common}
                    />
                    {trimming?.id === block.id &&
                      trimmingExcerpt &&
                      panelFor(
                        <TrimPanel
                          pieceId={piece.id}
                          block={block}
                          excerpt={trimmingExcerpt}
                          segments={segments[trimmingExcerpt.id]}
                          onSegments={(loaded) =>
                            setSegments((current) => ({ ...current, [trimmingExcerpt.id]: loaded }))
                          }
                          onTrimPiece={(trim) =>
                            commit(
                              setActualityTrim(
                                blocksRef.current,
                                block.id,
                                trimmingExcerpt,
                                trim,
                                trimmingExcerpt.sourceDurationMs,
                              ),
                            )
                          }
                          onExcerptChanged={(startMs, endMs) =>
                            setExcerpts((current) =>
                              new Map(current).set(trimmingExcerpt.id, {
                                ...trimmingExcerpt,
                                startMs,
                                endMs,
                              }),
                            )
                          }
                          onPlay={(startMs, endMs) =>
                            void play(`trim-${block.id}`, trimmingExcerpt.sourceId, startMs, endMs)
                          }
                          playing={playingKey === `trim-${block.id}`}
                          onClose={() => {
                            stop();
                            setTrimmingId(null);
                          }}
                        />,
                        "Trim this clip",
                        () => setTrimmingId(null),
                      )}
                    {swapping &&
                      panelFor(
                        <div className="rounded border border-dashed border-brand-primary bg-brand-surface/20 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-ink-700">Swap excerpt</span>
                            <button
                              type="button"
                              onClick={() => setSwappingId(null)}
                              aria-label="Cancel"
                              className="rounded px-1.5 text-xs font-bold text-ink-500 hover:bg-white max-lg:min-h-11"
                            >
                              ×
                            </button>
                          </div>
                          <ExcerptPicker
                            listId={`piece-swap-${block.id}`}
                            excerpts={pickerExcerpts}
                            onPick={(excerpt) => {
                              setExcerpts((current) => new Map(current).set(excerpt.id, excerpt));
                              commit(swapExcerpt(blocksRef.current, block.id, excerpt.id));
                              setSwappingId(null);
                            }}
                          />
                        </div>,
                        "Swap excerpt",
                        () => setSwappingId(null),
                      )}
                  </>
                )}
                <PieceInsertionPoint
                  id={block.id}
                  excerpts={pickerExcerpts}
                  onAddNarration={() => addNarrationAt(index + 1)}
                  onAddExcerpt={(excerpt) => addExcerptAt(index + 1, excerpt)}
                  onAskAssistant={() =>
                    askAssistantAfter(
                      block.type === "narration"
                        ? `the narration that begins “${block.text.trim().slice(0, 40)}”`
                        : `the excerpt “${(excerpts.get(block.excerpt_id)?.title ?? "").slice(0, 40)}”`,
                    )
                  }
                  afterLabel={
                    block.type === "narration"
                      ? `“${block.text.trim().slice(0, 28)}${block.text.trim().length > 28 ? "…" : ""}”`
                      : "this excerpt"
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <FooterButton
          type="button"
          disabled={isBlank}
          onClick={() =>
            void copy(
              pieceAsText(
                title,
                blocks,
                (block) => {
                  const excerpt = excerpts.get(block.excerpt_id);
                  return excerpt ? { text: wordsFor(block), speaker: excerpt.speaker } : null;
                },
                length,
              ),
            )
          }
        >
          {copyStatus === "copied"
            ? "Copied"
            : copyStatus === "failed"
              ? "Couldn’t copy"
              : "Copy as text"}
        </FooterButton>
        <ExportExcerptsButton
          projectId={piece.projectId}
          projectTitle={piece.projectTitle}
          exportDate={piece.updatedAt}
        />
        <span className="ml-auto text-xs text-ink-400 max-lg:hidden">
          Every save is a version. Drag ⋮⋮ or use ⋮ to reorder. Enter in narration adds a block
          below.
        </span>
      </div>
      <p className="mt-5 text-xs text-ink-400">Saved automatically as you type.</p>

      {/* Phone: the save state and History live in a bar at the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center gap-3 border-t border-line bg-white px-4 lg:hidden">
        <span className="flex-1 text-xs text-ink-400" aria-live="polite">
          {savedLabel} ·{" "}
          <button
            type="button"
            onClick={() => void openHistory()}
            className="min-h-11 font-bold text-brand-link"
          >
            History
          </button>
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => rightPanel.toggle("assistant")}
          className="min-h-11 bg-brand-surface"
        >
          Assistant
        </Button>
      </div>
    </div>
  );
}
