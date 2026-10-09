"use client";

// A batch's documents step and its run (docs/underwriting-traffic-redesign.md
// §14.5). Matching: every chosen file is matched to an entry by name
// (assignDocumentFiles), and whatever didn't match cleanly is listed with the
// one thing to do about it — take the close name, choose a file, pick which
// of two entries a shared file belongs to, or choose a smaller copy. Files
// no entry names can be imported as documents-only entries (§14.3). Running:
// the matched entries go through runQueue, a few at a time, each one POST to
// the import route handler — never a Server Action, which Next.js would run
// one at a time (§14.5). Nothing here is the record: each entry's own row
// is, and a closed tab leaves finished drafts in place and the rest to run.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Steps } from "@/components/ui/steps";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  assignDocumentFiles,
  describeUnmatchedDocument,
} from "@/lib/underwriting/agreement-migration";
import {
  DEFAULT_RATE_LIMIT_PAUSE_MS,
  MIGRATION_CONCURRENCY,
  MIGRATION_MAX_RATE_LIMIT_RETRIES,
} from "@/lib/underwriting/migration-queue";
import { runQueue, type QueueOutcome } from "@/lib/run-queue";
import type { MigrationRunResult } from "@/lib/underwriting/migration-import";
import { registerDocumentOnlyEntries } from "../../actions";
import { batchPath } from "../../paths";
import { MIGRATION_STEPS } from "../../steps";
import { formatBytes as formatMB } from "@/lib/format";
import { PrimaryLink, SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/input";
import { pluralize } from "@/lib/format";
import { useBeforeUnloadGuard } from "@/lib/use-event-listener";
import { useInterval } from "@/lib/use-poller";

export interface RunEntry {
  id: string;
  sourceFile: string;
  /** Null for a documents-only entry. */
  sponsor: string | null;
  row: number | null;
  term: string | null;
  failedBefore: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = /\.(pdf|png|jpe?g)$/i;

type Match =
  | { kind: "ready"; file: File; chosen: boolean }
  | { kind: "too_large"; file: File }
  | { kind: "named_twice"; file: File; others: RunEntry[] }
  | { kind: "close"; candidate: File }
  | { kind: "none" };

type TaskState =
  | { phase: "queued" }
  | { phase: "reading"; since: number }
  | { phase: "waiting" }
  | { phase: "done"; result: MigrationRunResult; ms: number };

interface Task {
  id: string;
  label: string;
  file: File;
}

type Filter = "attention" | "matched" | "extras" | "all";

function fileKey(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function postImport(task: Task): Promise<MigrationRunResult> {
  const body = new FormData();
  body.set("document", task.file);
  let response: Response;
  try {
    response = await fetch(`/api/underwriting/migration/items/${task.id}/import`, {
      method: "POST",
      body,
    });
  } catch {
    return {
      ok: false,
      status: "failed",
      error: "The connection dropped before an answer came back.",
    };
  }
  try {
    return (await response.json()) as MigrationRunResult;
  } catch {
    return {
      ok: false,
      status: "failed",
      error: `The server didn't answer (HTTP ${response.status}). Run this entry again; nothing is created twice.`,
    };
  }
}

function describeResult(result: MigrationRunResult): string {
  if (result.ok) {
    if (result.status === "already_imported") return "Already imported; linked.";
    return result.checks > 0 ? `${result.checks} to check` : "Nothing flagged";
  }
  return result.error;
}

export function DocumentsRun({
  batchLabel,
  documentsOnly,
  entries,
  notice,
}: {
  batchLabel: string;
  documentsOnly: boolean;
  entries: RunEntry[];
  notice: string | null;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [manual, setManual] = useState<Map<string, File>>(new Map());
  const [importExtras, setImportExtras] = useState(documentsOnly);
  const [filter, setFilter] = useState<Filter>("attention");
  const [phase, setPhase] = useState<"match" | "running" | "done">("match");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [states, setStates] = useState<Map<string, TaskState>>(new Map());
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stopRef = useRef(false);

  const addFiles = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).filter((file) => ACCEPTED.test(file.name));
    setFiles((previous) => {
      const seen = new Set(previous.map(fileKey));
      return [...previous, ...chosen.filter((file) => !seen.has(fileKey(file)))];
    });
  };

  // ---- Matching ----------------------------------------------------------

  const matching = useMemo(() => {
    const manuallyUsed = new Set([...manual.values()].map(fileKey));
    const pool = files.filter((file) => !manuallyUsed.has(fileKey(file)));
    const autoEntries = entries.filter((entry) => !manual.has(entry.id));
    const assignments = assignDocumentFiles(
      autoEntries.map((entry) => entry.sourceFile),
      pool,
    );
    const byEntry = new Map<string, Match>();
    const used = new Set(manuallyUsed);
    const claimedBy = new Map<string, RunEntry[]>();

    autoEntries.forEach((entry, index) => {
      const assignment = assignments[index]!;
      if (assignment.status !== "missing") used.add(fileKey(assignment.file));
      if (assignment.status === "claimed") {
        const key = fileKey(assignment.file);
        claimedBy.set(key, [...(claimedBy.get(key) ?? []), entry]);
      }
    });
    for (const entry of entries) {
      const chosen = manual.get(entry.id);
      if (chosen) {
        byEntry.set(
          entry.id,
          chosen.size > MAX_BYTES
            ? { kind: "too_large", file: chosen }
            : { kind: "ready", file: chosen, chosen: true },
        );
      }
    }
    autoEntries.forEach((entry, index) => {
      const assignment = assignments[index]!;
      if (assignment.status === "matched") {
        byEntry.set(
          entry.id,
          assignment.file.size > MAX_BYTES
            ? { kind: "too_large", file: assignment.file }
            : { kind: "ready", file: assignment.file, chosen: false },
        );
      } else if (assignment.status === "claimed") {
        const others = (claimedBy.get(fileKey(assignment.file)) ?? []).filter(
          (other) => other.id !== entry.id,
        );
        byEntry.set(entry.id, { kind: "named_twice", file: assignment.file, others });
      } else {
        const free = pool.filter((file) => !used.has(fileKey(file)));
        const nearest = describeUnmatchedDocument(entry.sourceFile, free, 1).candidates[0];
        const candidate = nearest ? free.find((file) => file.name === nearest.name) : undefined;
        byEntry.set(entry.id, candidate ? { kind: "close", candidate } : { kind: "none" });
      }
    });

    const extras = files.filter((file) => !used.has(fileKey(file)));
    const ready = entries.filter((entry) => byEntry.get(entry.id)?.kind === "ready");
    const attention = entries.filter((entry) => byEntry.get(entry.id)?.kind !== "ready");
    return { byEntry, extras, ready, attention };
  }, [entries, files, manual]);

  const usableExtras = matching.extras.filter((file) => file.size <= MAX_BYTES);
  const oversizedExtras = matching.extras.filter((file) => file.size > MAX_BYTES);
  const extrasToRun = importExtras ? usableExtras : [];
  const runCount = matching.ready.length + extrasToRun.length;

  const choose = (entryId: string, file: File) =>
    setManual((previous) => new Map(previous).set(entryId, file));

  // ---- Running -----------------------------------------------------------

  useInterval(() => setNow(Date.now()), phase === "running" ? 1000 : null);
  useBeforeUnloadGuard(phase === "running");

  const setState = (id: string, state: TaskState) =>
    setStates((previous) => new Map(previous).set(id, state));

  async function start() {
    setError(null);
    stopRef.current = false;
    setStopping(false);
    const planned: Task[] = matching.ready.map((entry) => {
      const match = matching.byEntry.get(entry.id) as Extract<Match, { kind: "ready" }>;
      return { id: entry.id, label: entry.sponsor ?? entry.sourceFile, file: match.file };
    });
    const skipped: string[] = [];

    setPhase("running");
    if (extrasToRun.length > 0) {
      const hashed = await Promise.all(
        extrasToRun.map(async (file) => ({ file, sha256: await sha256Hex(file) })),
      );
      const registered = await registerDocumentOnlyEntries({
        batchLabel,
        documents: hashed.map(({ file, sha256 }) => ({ filename: file.name, sha256 })),
      });
      if (!registered.ok) {
        setError(registered.error);
        setPhase("match");
        return;
      }
      const planIds = new Set(planned.map((task) => task.id));
      hashed.forEach(({ file }, index) => {
        const entry = registered.entries[index]!;
        if (planIds.has(entry.id)) return;
        if (entry.runnable) {
          planIds.add(entry.id);
          planned.push({ id: entry.id, label: file.name, file });
        } else
          skipped.push(
            `${file.name}: ${entry.contractId ? "already imported." : "being imported by another run."}`,
          );
      });
    }

    setNotes(skipped);
    setTasks(planned);
    setStates(new Map(planned.map((task) => [task.id, { phase: "queued" } as TaskState])));

    await runQueue(
      planned,
      async (task, attempt): Promise<QueueOutcome> => {
        const started = Date.now();
        setState(task.id, { phase: "reading", since: started });
        const result = await postImport(task);
        if (
          !result.ok &&
          result.status === "rate_limited" &&
          attempt <= MIGRATION_MAX_RATE_LIMIT_RETRIES
        ) {
          setState(task.id, { phase: "waiting" });
          return {
            kind: "retry",
            afterMs: (result.retryAfterMs ?? DEFAULT_RATE_LIMIT_PAUSE_MS) + 1000,
          };
        }
        setState(task.id, { phase: "done", result, ms: Date.now() - started });
        return { kind: "done" };
      },
      { concurrency: MIGRATION_CONCURRENCY, isStopped: () => stopRef.current },
    );
    setPhase("done");
    router.refresh();
  }

  // ---- Views -------------------------------------------------------------

  if (phase !== "match") {
    const list = tasks.map((task) => ({ task, state: states.get(task.id) ?? { phase: "queued" } }));
    const finished = list.filter(
      (item): item is { task: Task; state: Extract<TaskState, { phase: "done" }> } =>
        item.state.phase === "done",
    );
    const reading = list.filter(
      (item) => item.state.phase === "reading" || item.state.phase === "waiting",
    );
    const queued = list.filter((item) => item.state.phase === "queued");
    const ok = finished.filter((item) => item.state.result.ok);
    const clean = ok.filter(
      (item) => item.state.result.ok && item.state.result.checks === 0,
    ).length;
    const failed = finished.length - ok.length;
    const average =
      finished.length > 0
        ? finished.reduce((sum, item) => sum + item.state.ms, 0) / finished.length
        : null;
    const minutesLeft =
      average !== null && phase === "running"
        ? Math.ceil(((queued.length + reading.length) / MIGRATION_CONCURRENCY) * (average / 60_000))
        : null;

    return (
      <div className="flex flex-col gap-6">
        <Steps
          steps={MIGRATION_STEPS}
          current={phase === "done" ? 3 : 2}
          busy={phase === "running"}
          busyNote={phase === "running" ? `${reading.length} reading` : undefined}
          label="Migration steps"
        />
        {error && <Alert>{error}</Alert>}

        <section
          aria-live="polite"
          className="flex flex-col gap-3 rounded border border-line px-5 py-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-ink-900">
                {phase === "done"
                  ? stopping && queued.length > 0
                    ? `Stopped — ${finished.length} of ${tasks.length} imported`
                    : `Finished ${finished.length} of ${tasks.length}`
                  : `Importing ${finished.length + reading.length} of ${tasks.length}`}
              </h3>
              <p className="mt-0.5 max-w-3xl text-sm text-ink-700">
                {phase === "running"
                  ? `Reading ${MIGRATION_CONCURRENCY} at a time; each takes a minute or two${minutesLeft !== null ? ` — about ${pluralize(minutesLeft, "minute", "minutes")} left` : ""}. Keep this tab open. If it closes, finished drafts are kept and the rest wait on the batch page.`
                  : "Every draft waits for review. Nothing schedules until someone activates it."}
              </p>
            </div>
            {phase === "running" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={stopping}
                onClick={() => {
                  stopRef.current = true;
                  setStopping(true);
                }}
              >
                {stopping ? "Stopping after these…" : "Stop after the ones reading"}
              </Button>
            ) : (
              <PrimaryLink href={batchPath(batchLabel)}>Review the batch</PrimaryLink>
            )}
          </div>
          <ProgressBar
            size="lg"
            label="Agreements imported"
            done={finished.length}
            pending={reading.length}
            total={Math.max(tasks.length, 1)}
            complete={phase === "done" && finished.length === tasks.length}
          />
          <p className="text-[13px] text-ink-700">
            <strong>{clean}</strong> ready · <strong>{ok.length - clean}</strong> need a look ·{" "}
            <strong>{failed}</strong> failed · <strong>{queued.length + reading.length}</strong> to
            go
          </p>
        </section>

        {reading.length > 0 && (
          <section className="flex flex-col gap-2 rounded border border-brand-surface bg-[#F3F9FD] px-5 py-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-brand-link">
              Reading now
            </h3>
            <ul className="flex flex-col gap-3">
              {reading.map(({ task, state }) => (
                <li key={task.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold text-ink-900">
                      {task.label}{" "}
                      <span className="font-mono text-xs font-normal text-ink-500">
                        {task.file.name}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-[13px] text-ink-500">
                      {state.phase === "waiting"
                        ? "Waiting on the provider’s rate limit"
                        : state.phase === "reading"
                          ? `${Math.max(0, Math.round((now - state.since) / 1000))} s`
                          : ""}
                    </span>
                  </div>
                  <ProgressBar indeterminate size="sm" label={`Reading ${task.label}`} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <h3 className="border-b border-line bg-panel-50 px-4 py-2.5 text-sm font-bold text-ink-900">
              Done · {finished.length}
            </h3>
            {finished.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-500">Nothing finished yet.</p>
            ) : (
              <ul>
                {[...finished].reverse().map(({ task, state }) => {
                  const result = state.result;
                  const variant = !result.ok ? "danger" : result.checks > 0 ? "warning" : "success";
                  const label = !result.ok
                    ? "Failed"
                    : result.checks > 0
                      ? "Needs a look"
                      : "Ready";
                  return (
                    <li
                      key={task.id}
                      className="flex items-start gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
                    >
                      <Badge variant={variant}>{label}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="font-bold text-ink-900">{task.label}</span>
                        <span
                          className={cn(
                            "block text-[13px]",
                            result.ok ? "text-ink-500" : "text-danger",
                          )}
                        >
                          {describeResult(result)}
                        </span>
                      </span>
                      {result.ok && (
                        <TextLink
                          href={`/underwriting/contracts/${result.contractId}/schedule`}
                          className="whitespace-nowrap text-[13px]"
                        >
                          Open draft
                        </TextLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h3 className="border-b border-line bg-panel-50 px-4 py-2.5 text-sm font-bold text-ink-900">
              {phase === "done" ? "Not started" : "Up next"} · {queued.length}
            </h3>
            {queued.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-500">
                {phase === "done" ? "Everything chosen was run." : "Nothing left to start."}
              </p>
            ) : (
              <ul>
                {queued.slice(0, 8).map(({ task }) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
                  >
                    <Badge variant="neutral">{phase === "done" ? "Not run" : "Queued"}</Badge>
                    <span className="text-ink-900">{task.label}</span>
                  </li>
                ))}
                {queued.length > 8 && (
                  <li className="bg-panel-50 px-4 py-2.5 text-[13px] text-ink-500">
                    and {queued.length - 8} more
                  </li>
                )}
              </ul>
            )}
          </Card>
        </div>

        {notes.length > 0 && <Alert variant="note">Skipped: {notes.join(" ")}</Alert>}
      </div>
    );
  }

  const chips: { value: Filter; label: string; count: number }[] = documentsOnly
    ? []
    : [
        { value: "attention", label: "Needs attention", count: matching.attention.length },
        { value: "matched", label: "Matched", count: matching.ready.length },
        { value: "extras", label: "Not in the manifest", count: matching.extras.length },
        { value: "all", label: "All entries", count: entries.length },
      ];
  const shownEntries = documentsOnly
    ? entries
    : filter === "attention"
      ? matching.attention
      : filter === "matched"
        ? matching.ready
        : filter === "all"
          ? entries
          : [];

  return (
    <div className="flex flex-col gap-6">
      <Steps steps={MIGRATION_STEPS} current={1} label="Migration steps" />
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-4 rounded-md border-2 border-dashed border-[#9FB7CA] bg-[#F7FAFC] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink-900">
            {files.length === 0
              ? documentsOnly
                ? "Choose the documents to import"
                : "Choose the signed agreements"
              : `${pluralize(files.length, "file", "files")} chosen`}
          </div>
          <div className="text-[13px] text-ink-500">
            {documentsOnly
              ? "Each document becomes its own draft. PDF, PNG or JPEG, up to 10 MB each."
              : "Each entry is matched to its file by name. PDF, PNG or JPEG, up to 10 MB each. Choose again to add more."}
          </div>
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center rounded border border-brand-link bg-white px-4 text-sm font-bold text-brand-link hover:bg-brand-surface">
          Choose a folder
          <input
            type="file"
            multiple
            className="sr-only"
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <label className="inline-flex h-10 cursor-pointer items-center rounded border border-brand-link bg-white px-4 text-sm font-bold text-brand-link hover:bg-brand-surface">
          Add files
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {!documentsOnly && entries.length === 0 && (
        <Alert variant="note">
          Every entry in this batch already has a draft. Files you choose can still be imported as
          documents-only entries below.
        </Alert>
      )}

      {chips.length > 0 && entries.length > 0 && (
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={filter === chip.value}
              onClick={() => setFilter(chip.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
                filter === chip.value
                  ? "border-brand-surface bg-brand-surface text-brand-link"
                  : "border-line bg-white text-ink-700 hover:border-brand-primary",
              )}
            >
              {chip.label}
              <span className="text-ink-500">· {chip.count}</span>
            </button>
          ))}
        </div>
      )}

      {(documentsOnly || filter !== "extras") &&
        entries.length > 0 &&
        (shownEntries.length === 0 ? (
          <p className="text-sm text-ink-500">
            {filter === "attention" ? "Every entry has its document." : "No entries here yet."}
          </p>
        ) : (
          <TableFrame>
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Entry</Th>
                  <Th>Expects</Th>
                  <Th>What to do</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {shownEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    match={matching.byEntry.get(entry.id) ?? { kind: "none" }}
                    haveFiles={files.length > 0}
                    onChoose={(file) => choose(entry.id, file)}
                  />
                ))}
              </tbody>
            </Table>
          </TableFrame>
        ))}

      {(documentsOnly || filter === "extras" || filter === "attention") &&
        matching.extras.length > 0 && (
          <Card className="flex flex-col gap-2.5 px-5 py-4">
            <h3 className="text-[15px] font-bold text-ink-900">
              {documentsOnly
                ? `${pluralize(matching.extras.length, "document", "documents")} to import`
                : `${pluralize(matching.extras.length, "file isn’t", "files aren’t")} in the manifest`}
            </h3>
            <p className="break-words font-mono text-xs leading-relaxed text-ink-700">
              {matching.extras.map((file) => file.name).join(", ")}
            </p>
            {oversizedExtras.length > 0 && (
              <p className="text-[13px] text-danger">
                Over 10 MB, left out: {oversizedExtras.map((file) => file.name).join(", ")}
              </p>
            )}
            {!documentsOnly && (
              <CheckboxField
                checked={importExtras}
                onChange={(event) => setImportExtras(event.target.checked)}
                label="Import them too, reading every fact from the document."
                hint="Prefer adding them to the manifest when you can — a document-only draft needs a closer check. Its sponsor must already be on file."
              />
            )}
          </Card>
        )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button type="button" disabled={runCount === 0} onClick={start}>
          {runCount === 0
            ? "Import"
            : `Import ${runCount} ${runCount === 1 ? (documentsOnly ? "document" : "entry") : documentsOnly ? "documents" : "entries"}`}
        </Button>
        <SecondaryLink href={batchPath(batchLabel)}>
          {entries.length === 0 && documentsOnly ? "Cancel" : "Go to the batch"}
        </SecondaryLink>
        {!documentsOnly && matching.attention.length > 0 && runCount > 0 && (
          <span className="text-[13px] text-ink-500">
            {pluralize(matching.attention.length, "entry", "entries")} still without a usable file
            stay as “Not run”. Add their files here any time.
          </span>
        )}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  match,
  haveFiles,
  onChoose,
}: {
  entry: RunEntry;
  match: Match;
  haveFiles: boolean;
  onChoose: (file: File) => void;
}) {
  const picker = (label: string) => (
    <label className="inline-flex h-8 cursor-pointer items-center rounded border border-brand-link px-3 text-[13px] font-bold text-brand-link hover:bg-brand-surface">
      {label}
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChoose(file);
          event.target.value = "";
        }}
      />
    </label>
  );

  let badge: { label: string; variant: "success" | "warning" | "danger" | "neutral" };
  let action: ReactNode;
  switch (match.kind) {
    case "ready":
      badge = { label: match.chosen ? "Chosen" : "Matched", variant: "success" };
      action = <span className="font-mono text-xs text-ink-700">{match.file.name}</span>;
      break;
    case "too_large":
      badge = { label: formatMB(match.file.size), variant: "danger" };
      action = (
        <div className="flex flex-col gap-2">
          <span>
            Over the 10 MB limit. Save a smaller copy (printing to PDF usually does it) and choose
            that.
          </span>
          <div>{picker("Choose file…")}</div>
        </div>
      );
      break;
    case "named_twice":
      badge = { label: "Named twice", variant: "danger" };
      action = (
        <div className="flex flex-col gap-2">
          <span>
            <span className="font-mono text-xs">{match.file.name}</span> is also named by{" "}
            {match.others.map((other) => other.sponsor ?? other.sourceFile).join(", ")}. One file
            makes one draft — use it here only if it’s this entry’s.
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3"
              onClick={() => onChoose(match.file)}
            >
              Use it for this entry
            </Button>
            {picker("Choose another…")}
          </div>
        </div>
      );
      break;
    case "close":
      badge = { label: "Close match", variant: "warning" };
      action = (
        <div className="flex flex-col gap-2">
          <span>
            Found <span className="font-mono text-xs">{match.candidate.name}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-8 px-3" onClick={() => onChoose(match.candidate)}>
              Use this file
            </Button>
            {picker("Choose another…")}
          </div>
        </div>
      );
      break;
    default:
      badge = {
        label: haveFiles ? "No file" : "Waiting",
        variant: haveFiles ? "danger" : "neutral",
      };
      action = (
        <div className="flex flex-col gap-2">
          {haveFiles && <span className="text-ink-500">Nothing chosen is close to this name.</span>}
          <div>{picker("Choose file…")}</div>
        </div>
      );
  }

  return (
    <Row>
      <Cell>
        <div className="font-bold text-ink-900">{entry.sponsor ?? entry.sourceFile}</div>
        <div className="mt-0.5 text-xs text-ink-500">
          {[
            entry.row !== null ? `Row ${entry.row}` : null,
            entry.term,
            entry.failedBefore ? "Failed last time" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </Cell>
      <Cell>
        <span className="break-all font-mono text-xs">{entry.sourceFile}</span>
        <div className="mt-1.5">
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </Cell>
      <Cell className="text-[13px] text-ink-900">{action}</Cell>
    </Row>
  );
}
