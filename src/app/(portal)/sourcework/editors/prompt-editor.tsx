"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";
import { acceptRateLabel, type PromptSlot } from "@/lib/sourcework/prompts";
import { draftDiffersFromLive } from "@/lib/sourcework/trial-sample";
import { discardPromptDraft, makeVersionLive, savePromptDraft } from "./actions";
import { LocalTime } from "./local-time";
import { PublishPanel } from "./publish-panel";

const AUTOSAVE_MS = 1200;

export interface EditorVersion {
  id: string;
  version: number;
  body: string;
  note: string | null;
  createdAt: string;
  byName: string | null;
  accepted: number;
  rejected: number;
  isLive: boolean;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

export function PromptEditor({
  slot,
  tryable,
  initialText,
  savedDraftAt,
  liveBody,
  liveVersion,
  liveRate,
  versions,
}: {
  slot: PromptSlot;
  tryable: boolean;
  initialText: string;
  /** When the editor's saved draft was last written, or null with no draft. */
  savedDraftAt: string | null;
  liveBody: string;
  liveVersion: number | null;
  liveRate: string | null;
  versions: EditorVersion[];
}) {
  const router = useRouter();
  // Local state is the truth while typing; a server refresh never replaces it.
  const [text, setText] = useState(initialText);
  const textRef = useRef(initialText);
  const savedBody = useRef(initialText);
  const [draftExists, setDraftExists] = useState(savedDraftAt !== null);
  const draftExistsRef = useRef(savedDraftAt !== null);
  const [save, setSave] = useState<SaveState>(
    savedDraftAt ? { kind: "saved", at: savedDraftAt } : { kind: "idle" },
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [publishing, setPublishing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const publishRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const differs = draftDiffersFromLive(text, liveBody);

  const writeDraft = useCallback(
    (force: boolean): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        const body = textRef.current;
        if (!force && body === savedBody.current) return true;
        if (force && body === savedBody.current && draftExistsRef.current) return true;
        setSave({ kind: "saving" });
        const result = await savePromptDraft({ slot, body });
        if (!result.ok) {
          setSave({ kind: "error", message: result.error });
          return false;
        }
        savedBody.current = body;
        draftExistsRef.current = true;
        setDraftExists(true);
        setSave({ kind: "saved", at: result.savedAt });
        return true;
      };
      const next = chain.current.then(run, run);
      chain.current = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    [slot],
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

  function change(value: string) {
    setText(value);
    textRef.current = value;
    setNotice(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  async function goTry(event: React.MouseEvent) {
    event.preventDefault();
    if (await flush(true)) router.push(`/sourcework/editors/try?slot=${slot}`);
  }

  function openPublish() {
    setPublishing(true);
    setTimeout(
      () => publishRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      50,
    );
  }

  function toggleHistory() {
    setHistoryOpen((open) => !open);
    setTimeout(
      () => historyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      50,
    );
  }

  async function discard() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await chain.current;
    const result = await discardPromptDraft({ slot });
    if (!result.ok) return { error: result.error };
    setText(liveBody);
    textRef.current = liveBody;
    savedBody.current = liveBody;
    draftExistsRef.current = false;
    setDraftExists(false);
    setSave({ kind: "idle" });
    setNotice("Draft discarded. The text is back to the live version.");
    router.refresh();
  }

  function editFromVersion(version: EditorVersion) {
    setText(version.body);
    textRef.current = version.body;
    setNotice(`Started a draft from v${version.version}.`);
    setHistoryOpen(false);
    void flush(true);
    textareaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      Live: {liveVersion === null ? "built-in text" : `v${liveVersion}`}
      {liveRate && <> · {liveRate}</>} ·{" "}
      <button
        type="button"
        onClick={toggleHistory}
        aria-expanded={historyOpen}
        className="min-h-11 font-bold text-brand-link hover:underline lg:min-h-0"
      >
        History
      </button>
    </>
  );

  const actions = (
    <>
      <Button
        type="button"
        onClick={openPublish}
        disabled={publishing}
        className="max-lg:min-h-12 max-lg:flex-1"
      >
        Publish…
      </Button>
      {tryable ? (
        <Link
          href={`/sourcework/editors/try?slot=${slot}`}
          onClick={goTry}
          className="inline-flex items-center justify-center rounded border border-brand-link px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface max-lg:min-h-12 max-lg:flex-1"
        >
          Try this draft
        </Link>
      ) : (
        <span className="text-xs text-ink-400">Try this draft is coming for this prompt.</span>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3 max-lg:pb-24">
      <Textarea
        ref={textareaRef}
        aria-label="Prompt text"
        value={text}
        onChange={(event) => change(event.target.value)}
        onBlur={() => void flush()}
        spellCheck
        className="h-[55vh] min-h-72 resize-y p-4 leading-relaxed lg:h-[420px]"
      />

      {notice && <Alert variant="note">{notice}</Alert>}
      {differs && !publishing && (
        <p className="text-xs font-semibold text-warning-fg">
          Unpublished changes: this text is not live yet.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5 max-lg:hidden">{actions}</div>
        <span className="text-[13px] text-ink-400" aria-live="polite">
          {saveLabel}
        </span>
        {draftExists && differs && (
          <ConfirmAction
            label="Discard draft"
            confirmLabel="Discard draft"
            message="This throws away your saved draft and goes back to the live text. It can't be undone."
            onConfirm={discard}
          />
        )}
        <span className="text-[13px] text-ink-500 lg:ml-auto max-lg:hidden">{liveLine}</span>
      </div>
      <p className="text-[13px] text-ink-500 lg:hidden">{liveLine}</p>

      {publishing && (
        <div ref={publishRef}>
          <PublishPanel
            slot={slot}
            getBody={async () => {
              await flush();
              return textRef.current;
            }}
            onClose={() => setPublishing(false)}
            onPublished={(version) => {
              if (timer.current) clearTimeout(timer.current);
              timer.current = null;
              draftExistsRef.current = false;
              setDraftExists(false);
              setSave({ kind: "idle" });
              setPublishing(false);
              setNotice(`Published as v${version}. It is now live for every project.`);
              router.refresh();
            }}
          />
        </div>
      )}

      {historyOpen && (
        <div ref={historyRef} className="flex flex-col gap-2 rounded border border-line p-4">
          <SectionHeading as="h3">History</SectionHeading>
          {versions.length === 0 ? (
            <p className="text-sm text-ink-500">
              Nothing has been published yet, so this prompt runs on its built-in text. Publishing
              saves the first version.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {versions.map((version) => {
                const rate = acceptRateLabel(version.accepted, version.rejected);
                return (
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
                        {rate && <> · {rate}</>}
                      </span>
                    </div>
                    <p className={cn("text-sm", version.note ? "text-ink-700" : "text-ink-400")}>
                      {version.note ?? "No note."}
                    </p>
                    {viewing === version.id && (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-panel-50 p-3 text-sm leading-relaxed text-ink-700">
                        {version.body}
                      </pre>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <button
                        type="button"
                        onClick={() => setViewing(viewing === version.id ? null : version.id)}
                        className="min-h-11 text-sm font-bold text-brand-link hover:underline lg:min-h-0"
                      >
                        {viewing === version.id ? "Hide" : "View"}
                      </button>
                      <button
                        type="button"
                        onClick={() => editFromVersion(version)}
                        className="min-h-11 text-sm font-bold text-brand-link hover:underline lg:min-h-0"
                      >
                        Edit from this version
                      </button>
                      {!version.isLive && (
                        <ConfirmAction
                          label="Make live again"
                          confirmLabel="Make live"
                          message={`Every project's next run will use v${version.version}. The version live now stays in History.`}
                          onConfirm={async () => {
                            const result = await makeVersionLive({ slot, versionId: version.id });
                            if (!result.ok) return { error: result.error };
                            setNotice(`v${version.version} is live again.`);
                            router.refresh();
                          }}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2.5 border-t border-line bg-white px-4 py-2.5 lg:hidden">
        {actions}
      </div>
    </div>
  );
}
