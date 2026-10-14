"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import type { EvidenceItem, EvidencePayload } from "@/lib/sourcework/synthesis-evidence";
import { getEvidenceMediaUrl } from "./synthesis-actions";

/**
 * The evidence behind a statement, side of a tension or pattern, read beside the synthesis instead of
 * after a page change. One statement is open at a time: a right-hand column from `lg` up, a bottom
 * sheet below it. Recordings play in the panel (one shared player, stopped at the end of the finding),
 * and each finding links to its passage in the source for when the whole recording is wanted.
 */

interface Context {
  projectId: string;
  selected: EvidencePayload | null;
  select: (payload: EvidencePayload) => void;
  clear: () => void;
}

const EvidenceContext = createContext<Context | null>(null);

function useEvidence(): Context {
  const context = useContext(EvidenceContext);
  if (!context) throw new Error("EvidenceProvider is missing");
  return context;
}

export function EvidenceProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<EvidencePayload | null>(null);
  const clear = useCallback(() => setSelected(null), []);
  const value = useMemo(
    () => ({ projectId, selected, select: setSelected, clear }),
    [projectId, selected, clear],
  );
  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Opens the evidence for `payload` in the panel; pressed while it is the one open. */
export function EvidenceButton({
  payload,
  className,
}: {
  payload: EvidencePayload;
  className?: string;
}) {
  const { selected, select, clear } = useEvidence();
  const open = selected?.key === payload.key;
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={() => (open ? clear() : select(payload))}
      className={cn(
        "inline-flex min-h-[2.75rem] items-center gap-1 text-sm font-semibold text-brand-link hover:underline lg:min-h-0",
        className,
      )}
    >
      {open ? "Hide evidence" : "Evidence"}
      <Chevron />
    </button>
  );
}

/** A card for one statement or pattern: the server-rendered content, then its evidence button. */
export function EvidenceCard({
  payload,
  children,
  footer,
}: {
  payload: EvidencePayload;
  children: ReactNode;
  /** Beside the evidence button: the support line. */
  footer?: ReactNode;
}) {
  const { selected } = useEvidence();
  const open = selected?.key === payload.key;
  return (
    <li
      className={cn(
        "rounded border bg-white p-4",
        open ? "border-brand-primary ring-2 ring-brand-primary" : "border-line",
      )}
    >
      {children}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 text-sm text-ink-500">{footer}</div>
        {payload.items.length > 0 && <EvidenceButton payload={payload} />}
      </div>
    </li>
  );
}

export function EvidencePanel() {
  const { selected, clear } = useEvidence();
  if (!selected) {
    return (
      <aside
        aria-label="Evidence"
        className="hidden rounded border border-dashed border-line p-4 text-sm text-ink-500 lg:sticky lg:top-4 lg:block"
      >
        Choose <b className="text-ink-700">Evidence</b> on a statement to read the findings behind
        it and play them here.
      </aside>
    );
  }
  return (
    <aside
      aria-label="Evidence"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(15,20,25,0.12)] lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:rounded lg:border lg:shadow-none"
    >
      <EvidenceBody key={selected.key} payload={selected} onClose={clear} />
    </aside>
  );
}

function EvidenceBody({ payload, onClose }: { payload: EvidencePayload; onClose: () => void }) {
  const { projectId } = useEvidence();
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef(new Map<string, string>());
  const stopAtMs = useRef<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(item: EvidenceItem) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing === item.id) {
      audio.pause();
      setPlaying(null);
      return;
    }
    setError(null);
    setLoading(item.id);
    let url = urls.current.get(item.sourceId);
    if (!url) {
      const result = await getEvidenceMediaUrl({ projectId, sourceId: item.sourceId });
      if (!result.ok) {
        setLoading(null);
        setError(result.error);
        return;
      }
      url = result.url;
      urls.current.set(item.sourceId, url);
    }
    const start = Math.max(0, (item.startMs ?? 0) / 1000);
    stopAtMs.current = item.endMs;
    const begin = () => {
      audio.currentTime = start;
      audio.play().then(
        () => setPlaying(item.id),
        () => setError("Couldn't play that recording. Open the source instead."),
      );
    };
    if (audio.src !== url) {
      audio.src = url;
      audio.addEventListener("loadedmetadata", begin, { once: true });
      audio.load();
    } else {
      begin();
    }
    setLoading(null);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-500">Evidence</div>
          <p className="mt-1 font-serif text-base font-semibold leading-snug text-ink-900">
            {payload.heading}
          </p>
          <p className="mt-1 text-sm text-ink-500">{payload.support}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-m-2 min-h-[2.75rem] min-w-[2.75rem] shrink-0 text-sm font-semibold text-brand-link hover:underline"
        >
          Close
        </button>
      </div>

      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => setPlaying(null)}
        onPause={() => setPlaying(null)}
        onTimeUpdate={(event) => {
          const stop = stopAtMs.current;
          if (stop !== null && event.currentTarget.currentTime * 1000 >= stop + 1500) {
            event.currentTarget.pause();
          }
        }}
      />

      {error && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {payload.items.length === 0 ? (
        <p className="p-4 text-sm text-ink-500">
          No accepted finding backs this any more. Accept or add findings, or edit it out.
        </p>
      ) : (
        <ul>
          {payload.items.map((item) => (
            <li key={item.id} className="border-b border-line px-4 py-3 last:border-b-0">
              <p className="text-[15px] leading-snug text-ink-900">{item.claim}</p>
              <p className="mt-1 text-xs text-ink-500">{item.who}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                {item.at !== null && (
                  <button
                    type="button"
                    onClick={() => void toggle(item)}
                    disabled={loading === item.id}
                    aria-label={`${playing === item.id ? "Pause" : "Play"} at ${item.at}`}
                    className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-full bg-brand-surface px-3 text-sm font-semibold text-brand-link hover:bg-brand-primary/20 disabled:opacity-60 lg:min-h-0 lg:py-1"
                  >
                    {playing === item.id
                      ? "Pause"
                      : loading === item.id
                        ? "Loading…"
                        : `Play at ${item.at}`}
                  </button>
                )}
                <Link
                  href={item.href}
                  className="text-sm font-semibold text-brand-link hover:underline"
                >
                  {item.at !== null ? "Open in source" : "Open the page"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
