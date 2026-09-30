"use client";

// Runs the migration's entries (docs/underwriting-traffic-redesign.md §14),
// one request per entry, in order, so a slow reading never holds up the
// page and a stop takes effect between entries. Two ways in: RunImports
// matches the loaded entries (manifest or documents-only) to chosen files
// by name; DocumentsOnly (§14.3) makes an entry of each chosen file first,
// keyed by its hash, and runs those. Nothing here is kept: the entries' own
// rows are the record, and the page is refreshed when a run ends.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  assignDocumentFiles,
  describeUnmatchedDocument,
} from "@/lib/underwriting/agreement-migration";
import {
  importMigrationItem,
  registerDocumentOnlyEntries,
  type MigrationRunResult,
} from "./actions";

export interface RunnableItem {
  id: string;
  sourceKey: string;
  sourceFile: string;
}

interface Task {
  id: string;
  label: string;
  file: File;
}

interface LogEntry {
  key: string;
  text: string;
  ok: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

function describe(result: MigrationRunResult): string {
  if (!result.ok) return result.error;
  if (result.status === "already_imported") return "Already imported; linked.";
  return `Imported${result.warnings > 0 ? ` — ${result.warnings} to review` : ""}.`;
}

/** The sequential run, its progress, and its log — shared by both panels. */
function useImportRun() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);

  function start(total: number) {
    stopRef.current = false;
    setRunning(true);
    setDone(0);
    setTotal(total);
    setLog([]);
  }

  function note(entry: LogEntry) {
    setLog((previous) => [...previous, entry]);
  }

  async function runTasks(tasks: Task[]) {
    setTotal(tasks.length);
    for (const [index, task] of tasks.entries()) {
      if (stopRef.current) break;
      const formData = new FormData();
      formData.set("item_id", task.id);
      formData.set("document", task.file);
      let result: MigrationRunResult;
      try {
        result = await importMigrationItem(formData);
      } catch (error) {
        result = { ok: false, status: "failed", error: (error as Error).message };
      }
      note({ key: task.label, text: describe(result), ok: result.ok });
      setDone(index + 1);
    }
  }

  function finish() {
    setRunning(false);
    router.refresh();
  }

  return {
    running,
    done,
    total,
    log,
    start,
    note,
    runTasks,
    finish,
    stop: () => {
      stopRef.current = true;
    },
  };
}

function RunControls({
  run,
  label,
  disabled,
  onStart,
}: {
  run: ReturnType<typeof useImportRun>;
  label: string;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Button type="button" disabled={run.running || disabled} onClick={onStart}>
          {run.running ? "Importing…" : label}
        </Button>
        {run.running && (
          <Button type="button" variant="secondary" onClick={run.stop}>
            Stop after this one
          </Button>
        )}
      </div>
      {(run.running || run.log.length > 0) && (
        <div className="flex flex-col gap-2">
          <ProgressBar
            label="Agreements imported"
            done={run.done}
            total={run.total}
            complete={!run.running && run.total > 0 && run.done === run.total}
          />
          <p className="text-xs text-ink-500">
            {run.done} of {run.total} done
            {run.running ? " — each reading takes up to a couple of minutes." : "."}
          </p>
          <ul className="flex flex-col gap-1 text-xs">
            {run.log.map((entry, index) => (
              <li key={index} className={entry.ok ? "text-ink-700" : "text-danger"}>
                <span className="font-semibold">{entry.key}</span>: {entry.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** The loaded entries still to run, each matched to a chosen file by name. */
export function RunImports({ items }: { items: RunnableItem[] }) {
  const run = useImportRun();
  const [files, setFiles] = useState<File[]>([]);

  const assignments = assignDocumentFiles(
    items.map((item) => item.sourceFile),
    files,
  );
  const matched = items.map((item, index) => {
    const assignment = assignments[index]!;
    return {
      item,
      file: assignment.status === "matched" ? assignment.file : null,
      claimed: assignment.status === "claimed",
    };
  });
  const ready = matched.filter(
    (entry): entry is { item: RunnableItem; file: File; claimed: boolean } =>
      entry.file !== null && entry.file.size <= MAX_BYTES,
  );
  const missing = matched.filter((entry) => entry.file === null && !entry.claimed);
  const claimed = matched.filter((entry) => entry.claimed);
  const oversized = matched.filter((entry) => entry.file !== null && entry.file.size > MAX_BYTES);

  async function onStart() {
    run.start(ready.length);
    await run.runTasks(
      ready.map(({ item, file }) => ({ id: item.id, label: item.sourceKey, file })),
    );
    run.finish();
  }

  if (items.length === 0) {
    return <p className="text-sm text-ink-500">Every entry here has been imported.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="migration_documents">Documents</Label>
        <Input
          id="migration_documents"
          type="file"
          multiple
          accept={ACCEPT}
          disabled={run.running}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <FieldHint>
          Choose every document the entries name (select them all at once). Each entry is matched by
          its file name.
        </FieldHint>
      </div>

      {files.length > 0 && (
        <ul className="text-xs text-ink-700">
          <li>
            {ready.length} of {items.length} entries to run have their document.
          </li>
          {missing.length > 0 && (
            <li className="text-danger">
              No document chosen for:
              <ul className="ml-4 list-disc">
                {missing.map((entry) => {
                  const why = describeUnmatchedDocument(entry.item.sourceFile, files);
                  return (
                    <li key={entry.item.id}>
                      <div>Expected: {why.expected}</div>
                      {why.candidates.length > 0 ? (
                        <div className="text-ink-700">
                          Close to:
                          {why.candidates.map((candidate) => (
                            <div key={candidate.name} className="ml-2">
                              {candidate.name}
                              <div className="font-mono text-ink-500">
                                compared: “{why.expectedNormalized}” vs “{candidate.normalized}”
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-ink-700">No chosen file is close to this name.</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          )}
          {claimed.length > 0 && (
            <li className="text-danger">
              Skipped — the same file matches more than one entry, so none of them will run:{" "}
              {claimed.map((entry) => entry.item.sourceFile).join(", ")}
            </li>
          )}
          {oversized.length > 0 && (
            <li className="text-danger">
              Over 10 MB: {oversized.map((entry) => entry.item.sourceFile).join(", ")}
            </li>
          )}
        </ul>
      )}

      <RunControls
        run={run}
        label={`Import ${ready.length} ${ready.length === 1 ? "entry" : "entries"}`}
        disabled={ready.length === 0}
        onStart={onStart}
      />
    </div>
  );
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Documents with no manifest entry (§14.3): each file becomes an entry keyed
 * by its hash, then runs — the reading supplies every fact. Choosing a file
 * already imported finds its entry and skips it.
 */
export function DocumentsOnly({ defaultBatchLabel }: { defaultBatchLabel: string }) {
  const run = useImportRun();
  const [batchLabel, setBatchLabel] = useState(defaultBatchLabel);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const usable = files.filter((file) => file.size <= MAX_BYTES);
  const oversized = files.filter((file) => file.size > MAX_BYTES);

  async function onStart() {
    setError(null);
    run.start(usable.length);
    const hashed = await Promise.all(
      usable.map(async (file) => ({ file, sha256: await sha256Hex(file) })),
    );
    const registered = await registerDocumentOnlyEntries({
      batchLabel,
      documents: hashed.map(({ file, sha256 }) => ({ filename: file.name, sha256 })),
    });
    if (!registered.ok) {
      setError(registered.error);
      run.finish();
      return;
    }
    const tasks: Task[] = [];
    hashed.forEach(({ file }, index) => {
      const entry = registered.entries[index]!;
      if (entry.runnable) tasks.push({ id: entry.id, label: file.name, file });
      else
        run.note({
          key: file.name,
          text: entry.contractId ? "Already imported." : "Being imported by another run.",
          ok: entry.contractId !== null,
        });
    });
    await run.runTasks(tasks);
    run.finish();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <Label htmlFor="documents_only_batch">Batch name</Label>
        <Input
          id="documents_only_batch"
          value={batchLabel}
          maxLength={80}
          disabled={run.running}
          onChange={(event) => setBatchLabel(event.target.value)}
          placeholder="Stragglers, Sept 2026"
        />
      </div>
      <div>
        <Label htmlFor="documents_only_files">Documents</Label>
        <Input
          id="documents_only_files"
          type="file"
          multiple
          accept={ACCEPT}
          disabled={run.running}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <FieldHint>
          Each document becomes its own draft, read exactly as “Create from the agreement” reads
          one. The sponsor must already be on file. A document already imported, under any entry, is
          skipped.
        </FieldHint>
        {oversized.length > 0 && (
          <p className="mt-1 text-xs text-danger">
            Over 10 MB, left out: {oversized.map((file) => file.name).join(", ")}
          </p>
        )}
      </div>
      <RunControls
        run={run}
        label={`Import ${usable.length} ${usable.length === 1 ? "document" : "documents"}`}
        disabled={usable.length === 0 || batchLabel.trim() === ""}
        onStart={onStart}
      />
    </div>
  );
}
