"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { parseTargetInput } from "@/lib/sourcework/pieces";
import {
  MAX_ACTUALITIES,
  SECTION_GUIDANCE_MAX,
  STYLE_MAX,
  describeFormat,
  insertSection,
  moveSection,
  moveSectionTo,
  specsEqual,
  validateFormatSpec,
  type FormatSection,
  type FormatSpec,
} from "@/lib/sourcework/piece-formats";
import { LocalTime } from "../local-time";
import { PublishButton, PublishNote, PublishStatus, usePublish } from "../publish-control";
import {
  discardFormatDraft,
  makeFormatVersionLive,
  publishFormat,
  renameFormat,
  saveFormatDraft,
} from "./actions";

const AUTOSAVE_MS = 1200;

export interface FormatVersionView {
  id: string;
  version: number;
  spec: FormatSpec | null;
  note: string | null;
  createdAt: string;
  byName: string | null;
  isLive: boolean;
  piecesMade: number;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

/** "0:05", "5", "0" → seconds (0 allowed, unlike a piece's target); null when unreadable. */
function parseTolerance(text: string): number | null {
  const trimmed = text.trim();
  if (/^0(:00)?$/.test(trimmed)) return 0;
  return parseTargetInput(trimmed);
}

/**
 * One piece format (docs/sourcework-analysis-design.md §6.3, the Formats boards): length and
 * tolerance, the actuality range, ordered sections, and a style paragraph. Autosaves a draft
 * only this editor sees; Publish… makes it live with a note; Try this draft compares it with the
 * live version on a project before that.
 */
export function FormatEditor({
  formatId,
  name: initialName,
  initialSpec,
  savedDraftAt,
  liveSpec,
  liveVersion,
  versions,
}: {
  formatId: string;
  name: string;
  initialSpec: FormatSpec;
  savedDraftAt: string | null;
  liveSpec: FormatSpec | null;
  liveVersion: number | null;
  versions: FormatVersionView[];
}) {
  const router = useRouter();
  const [spec, setSpec] = useState(initialSpec);
  const specRef = useRef(initialSpec);
  const savedSpec = useRef(initialSpec);
  const [lengthText, setLengthText] = useState(formatClock(initialSpec.targetSeconds));
  const [toleranceText, setToleranceText] = useState(formatClock(initialSpec.toleranceSeconds));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [draftExists, setDraftExists] = useState(savedDraftAt !== null);
  const draftExistsRef = useRef(savedDraftAt !== null);
  const [save, setSave] = useState<SaveState>(
    savedDraftAt ? { kind: "saved", at: savedDraftAt } : { kind: "idle" },
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [renaming, setRenaming] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const differs = liveSpec === null || !specsEqual(spec, liveSpec);
  const check = validateFormatSpec(spec);
  const live = versions.find((version) => version.isLive);

  const writeDraft = useCallback(
    (force: boolean): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        const current = specRef.current;
        if (!force && specsEqual(current, savedSpec.current)) return true;
        if (force && specsEqual(current, savedSpec.current) && draftExistsRef.current) return true;
        setSave({ kind: "saving" });
        const result = await saveFormatDraft({ formatId, spec: current });
        if (!result.ok) {
          setSave({ kind: "error", message: result.error });
          return false;
        }
        savedSpec.current = current;
        draftExistsRef.current = true;
        setDraftExists(true);
        setSave({ kind: "saved", at: result.savedAt });
        return true;
      };
      const next = chain.current.then(run, run);
      chain.current = next.catch(() => false);
      return next;
    },
    [formatId],
  );

  const flush = useCallback(
    (force = false) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      return writeDraft(force);
    },
    [writeDraft],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // One click publishes the format on screen, with the note typed beside it (if any).
  const publish = usePublish({
    run: async (note) => {
      await flush();
      const checked = validateFormatSpec(specRef.current);
      if (!checked.ok) return checked;
      return publishFormat({ formatId, spec: checked.spec, note });
    },
    onPublished: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      draftExistsRef.current = false;
      setDraftExists(false);
      setSave({ kind: "idle" });
      router.refresh();
    },
  });

  function change(next: FormatSpec) {
    setSpec(next);
    specRef.current = next;
    setNotice(null);
    publish.dismiss();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  function setSections(sections: FormatSection[]) {
    change({ ...specRef.current, sections });
  }

  function commitLength() {
    const seconds = parseTargetInput(lengthText);
    if (seconds === null) {
      setFieldError("Enter the length like 1:00, 90 or 2m.");
      return;
    }
    setFieldError(null);
    setLengthText(formatClock(seconds));
    change({ ...specRef.current, targetSeconds: seconds });
  }

  function commitTolerance() {
    const seconds = parseTolerance(toleranceText);
    if (seconds === null) {
      setFieldError("Enter plus or minus like 0:05 or 5.");
      return;
    }
    setFieldError(null);
    setToleranceText(formatClock(seconds));
    change({ ...specRef.current, toleranceSeconds: seconds });
  }

  function setRange(which: "minActualities" | "maxActualities", raw: string) {
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) return;
    change({ ...specRef.current, [which]: Math.max(0, Math.min(MAX_ACTUALITIES, value)) });
  }

  function loadSpec(next: FormatSpec, message: string) {
    change(next);
    setLengthText(formatClock(next.targetSeconds));
    setToleranceText(formatClock(next.toleranceSeconds));
    setNotice(message);
  }

  async function goTry(event: React.MouseEvent) {
    event.preventDefault();
    if (await flush(true)) router.push(`/sourcework/editors/formats/try?format=${formatId}`);
  }

  async function discard() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await chain.current;
    const result = await discardFormatDraft({ formatId });
    if (!result.ok) return { error: result.error };
    if (liveSpec) {
      savedSpec.current = liveSpec;
      loadSpec(liveSpec, "Draft discarded. The format is back to the live version.");
    }
    draftExistsRef.current = false;
    setDraftExists(false);
    setSave({ kind: "idle" });
    router.refresh();
  }

  async function saveName() {
    const result = await renameFormat({ formatId, name });
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    setNameError(null);
    setRenaming(false);
    router.refresh();
  }

  function menuFor(index: number): ActionMenuItem[] {
    const section = spec.sections[index]!;
    const other = section.type === "narration" ? "actuality" : "narration";
    return [
      {
        label: "Move up",
        disabled: index === 0,
        onClick: () => setSections(moveSection(specRef.current.sections, index, -1)),
      },
      {
        label: "Move down",
        disabled: index === spec.sections.length - 1,
        onClick: () => setSections(moveSection(specRef.current.sections, index, 1)),
      },
      {
        label: other === "actuality" ? "Make it an actuality" : "Make it narration",
        onClick: () =>
          setSections(
            specRef.current.sections.map((entry, at) =>
              at === index ? { ...entry, type: other } : entry,
            ),
          ),
      },
      {
        label: "Add a section below",
        onClick: () =>
          setSections(
            insertSection(specRef.current.sections, index + 1, { type: "narration", guidance: "" }),
          ),
      },
      {
        label: "Remove section…",
        variant: "danger",
        dividerBefore: true,
        disabled: spec.sections.length === 1,
        confirm: { message: "Remove this section from the draft?", confirmLabel: "Remove" },
        onClick: () => setSections(specRef.current.sections.filter((_, at) => at !== index)),
      },
    ];
  }

  const saveLabel =
    save.kind === "saving" ? (
      "Saving…"
    ) : save.kind === "saved" ? (
      <>
        Draft saved <LocalTime iso={save.at} />
      </>
    ) : save.kind === "error" ? (
      <span className="text-danger">{save.message}</span>
    ) : differs ? (
      "Unsaved changes"
    ) : (
      "No changes yet"
    );

  const liveLine = (
    <>
      Live: {liveVersion === null ? "not published" : `v${liveVersion}`}
      {live && (
        <>
          {" "}
          · {live.piecesMade} {live.piecesMade === 1 ? "piece" : "pieces"} made
        </>
      )}{" "}
      ·{" "}
      <button
        type="button"
        onClick={() => {
          setHistoryOpen((open) => !open);
          setTimeout(
            () => historyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
            50,
          );
        }}
        aria-expanded={historyOpen}
        className="min-h-11 font-bold text-brand-link hover:underline lg:min-h-0"
      >
        History
      </button>
    </>
  );

  const actions = (
    <>
      <PublishButton
        control={publish}
        disabled={!check.ok}
        className="max-lg:min-h-11 max-lg:flex-1"
      />
      <Link
        href={`/sourcework/editors/formats/try?format=${formatId}`}
        onClick={goTry}
        className="inline-flex items-center justify-center rounded border border-brand-link px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface max-lg:min-h-11 max-lg:flex-1"
      >
        Try this draft
      </Link>
    </>
  );

  return (
    <div className="flex flex-col gap-[18px] max-lg:pb-24">
      <div>
        {renaming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <Input
              aria-label="Format name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              className="max-w-sm font-serif font-bold"
            />
            <Button type="submit" size="sm" className="max-lg:min-h-11">
              Save
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setName(initialName);
                setRenaming(false);
                setNameError(null);
              }}
              className="max-lg:min-h-11"
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-serif text-xl font-bold text-ink-900">{name}</h2>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="min-h-11 text-[13px] font-bold text-brand-link lg:min-h-0"
            >
              Rename
            </button>
          </div>
        )}
        {nameError && <p className="mt-1 text-sm text-danger">{nameError}</p>}
        <p className="mt-0.5 text-sm text-ink-500">
          The shape and wording the model follows when it drafts a piece. Narration is written by
          the model; actualities are always your excerpts.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:gap-3.5">
        <div>
          <Label htmlFor="format-length">Length</Label>
          <Input
            id="format-length"
            value={lengthText}
            onChange={(event) => setLengthText(event.target.value)}
            onBlur={commitLength}
            inputMode="numeric"
            className="max-lg:min-h-11"
          />
        </div>
        <div>
          <Label htmlFor="format-tolerance">
            <span className="max-lg:hidden">Plus or minus</span>
            <span className="lg:hidden">±</span>
          </Label>
          <Input
            id="format-tolerance"
            value={toleranceText}
            onChange={(event) => setToleranceText(event.target.value)}
            onBlur={commitTolerance}
            inputMode="numeric"
            className="max-lg:min-h-11"
          />
        </div>
        <fieldset>
          <legend className="mb-1.5 block text-xs font-semibold text-ink-700">Actualities</legend>
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Fewest actualities"
              type="number"
              min={0}
              max={MAX_ACTUALITIES}
              value={spec.minActualities}
              onChange={(event) => setRange("minActualities", event.target.value)}
              className="w-full min-w-0 px-2 max-lg:min-h-11"
            />
            <span className="text-sm text-ink-500">to</span>
            <Input
              aria-label="Most actualities"
              type="number"
              min={0}
              max={MAX_ACTUALITIES}
              value={spec.maxActualities}
              onChange={(event) => setRange("maxActualities", event.target.value)}
              className="w-full min-w-0 px-2 max-lg:min-h-11"
            />
          </div>
        </fieldset>
      </div>
      {fieldError && (
        <p role="alert" className="-mt-2 text-sm text-danger">
          {fieldError}
        </p>
      )}

      <div>
        <SectionHeading as="h3" level="eyebrow" className="mb-2">
          Sections, in order
        </SectionHeading>
        <ol className="divide-y divide-line rounded border border-line">
          {spec.sections.map((section, index) => (
            <li
              key={index}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom.current !== null) {
                  setSections(moveSectionTo(specRef.current.sections, dragFrom.current, index));
                }
                dragFrom.current = null;
              }}
              className="flex items-start gap-2.5 px-3.5 py-2.5 max-lg:pr-1"
            >
              <span
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                  dragFrom.current = index;
                }}
                title="Drag to reorder"
                aria-hidden="true"
                className="hidden cursor-grab select-none pt-2 tracking-[-2px] text-ink-400 lg:block"
              >
                ⋮⋮
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-2.5">
                <span
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-[0.05em] lg:w-[84px] lg:flex-none",
                    section.type === "actuality" ? "text-brand-link" : "text-ink-500",
                  )}
                >
                  <span className="lg:hidden">{index + 1} · </span>
                  {section.type === "actuality" ? "Actuality" : "Narration"}
                </span>
                <Input
                  aria-label={`Section ${index + 1} guidance`}
                  value={section.guidance}
                  maxLength={SECTION_GUIDANCE_MAX}
                  placeholder={
                    section.type === "actuality"
                      ? "Voice: what this clip should do."
                      : "What the narration here should do."
                  }
                  onChange={(event) =>
                    setSections(
                      specRef.current.sections.map((entry, at) =>
                        at === index ? { ...entry, guidance: event.target.value } : entry,
                      ),
                    )
                  }
                  className="border-transparent px-1.5 py-1 hover:border-line focus:border-brand-primary"
                />
              </div>
              <ActionMenu
                label={`Section ${index + 1} actions`}
                trigger="quiet"
                sheetHeading={`Section ${index + 1}`}
                items={menuFor(index)}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() =>
            setSections(
              insertSection(specRef.current.sections, specRef.current.sections.length, {
                type: "narration",
                guidance: "",
              }),
            )
          }
          aria-label="Add a section at the end"
          className="group mt-1.5 flex w-full items-center gap-2 text-ink-400 hover:text-brand-primary max-lg:h-11 lg:h-6"
        >
          <span className="h-px flex-1 bg-line group-hover:bg-brand-primary" />
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current text-xs max-lg:h-6 max-lg:w-6 max-lg:text-base">
            +
          </span>
          <span className="h-px flex-1 bg-line group-hover:bg-brand-primary" />
        </button>
        <p className="text-xs text-ink-400 lg:hidden">Reorder with Move up and Move down in ⋮.</p>
      </div>

      <div>
        <Label htmlFor="format-style">Style</Label>
        <Textarea
          id="format-style"
          value={spec.style}
          maxLength={STYLE_MAX}
          rows={4}
          onChange={(event) => change({ ...specRef.current, style: event.target.value })}
          className="leading-relaxed"
        />
      </div>

      {notice && <Alert variant="note">{notice}</Alert>}
      {!check.ok ? (
        <p className="text-xs font-semibold text-warning-fg">Not ready to publish: {check.error}</p>
      ) : (
        differs &&
        publish.state.kind !== "published" && (
          <p className="text-xs font-semibold text-warning-fg">
            Unpublished changes: this format is not live yet.
          </p>
        )
      )}

      <PublishNote
        control={publish}
        id={`format-${formatId}`}
        placeholder="Shorter setup; asks for a second voice"
        consequence="Shown in History. Publishing changes what every reporter's next draft follows; the previous version stays available to make live again."
      />
      <PublishStatus
        control={publish}
        successMessage={(version) => `Published as v${version}. Reporters' next drafts follow it.`}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5 max-lg:hidden">{actions}</div>
        <span className="text-[13px] text-ink-400" aria-live="polite">
          {saveLabel}
        </span>
        {draftExists && differs && liveSpec && (
          <ConfirmAction
            label="Discard draft"
            confirmLabel="Discard draft"
            message="This throws away your saved draft and goes back to the live version. It can't be undone."
            onConfirm={discard}
          />
        )}
        <span className="text-[13px] text-ink-500 lg:ml-auto max-lg:hidden">{liveLine}</span>
      </div>
      <p className="text-[13px] text-ink-500 lg:hidden">{liveLine}</p>
      <p className="text-xs text-ink-400">
        Trying a format drafts a piece from a project&rsquo;s accepted themes and excerpts, with the
        draft and the live version side by side. Nothing is saved to the project.
      </p>

      {historyOpen && (
        <div ref={historyRef} className="flex flex-col gap-2 rounded border border-line p-4">
          <SectionHeading as="h3">History</SectionHeading>
          {versions.length === 0 ? (
            <p className="text-sm text-ink-500">
              Nothing has been published yet, so reporters can&rsquo;t draft from this format.
              Publishing saves the first version.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {versions.map((version) => (
                <li key={version.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="font-bold text-ink-900">v{version.version}</span>
                    {version.isLive && (
                      <span className="rounded bg-brand-surface px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-link">
                        Live
                      </span>
                    )}
                    <span className="text-ink-500">
                      <LocalTime iso={version.createdAt} withDate />
                      {version.byName && <> · {version.byName}</>}
                      {version.spec && <> · {describeFormat(version.spec)}</>} ·{" "}
                      {version.piecesMade} {version.piecesMade === 1 ? "piece" : "pieces"} made
                    </span>
                  </div>
                  <p className={cn("text-sm", version.note ? "text-ink-700" : "text-ink-400")}>
                    {version.note ?? "No note."}
                  </p>
                  {viewing === version.id && version.spec && (
                    <div className="rounded border border-line bg-panel-50 p-3 text-sm text-ink-700">
                      <ol className="list-decimal space-y-1 pl-5">
                        {version.spec.sections.map((section, index) => (
                          <li key={index}>
                            <span className="font-semibold">
                              {section.type === "actuality" ? "Actuality" : "Narration"}:
                            </span>{" "}
                            {section.guidance}
                          </li>
                        ))}
                      </ol>
                      {version.spec.style && <p className="mt-2">{version.spec.style}</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      onClick={() => setViewing(viewing === version.id ? null : version.id)}
                      className="min-h-11 text-sm font-bold text-brand-link hover:underline lg:min-h-0"
                    >
                      {viewing === version.id ? "Hide" : "View"}
                    </button>
                    {version.spec && (
                      <button
                        type="button"
                        onClick={() => {
                          loadSpec(version.spec!, `Started a draft from v${version.version}.`);
                          setHistoryOpen(false);
                          void flush(true);
                        }}
                        className="min-h-11 text-sm font-bold text-brand-link hover:underline lg:min-h-0"
                      >
                        Edit from this version
                      </button>
                    )}
                    {!version.isLive && (
                      <ConfirmAction
                        label="Make live again"
                        confirmLabel="Make live"
                        message={`Every reporter's next draft will follow v${version.version}. The version live now stays in History.`}
                        onConfirm={async () => {
                          const result = await makeFormatVersionLive({
                            formatId,
                            versionId: version.id,
                          });
                          if (!result.ok) return { error: result.error };
                          setNotice(`v${version.version} is live again.`);
                          router.refresh();
                        }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 flex h-[68px] items-center gap-2.5 border-t border-line bg-white px-4 shadow-[0_-4px_14px_rgba(15,34,53,0.08)] lg:hidden">
        {actions}
      </div>
    </div>
  );
}
