"use client";

// Runs the migration's entries (docs/underwriting-traffic-redesign.md §14):
// the administrator chooses the folder's documents once, each runnable
// entry is matched to its file by name, and the entries are imported one
// at a time — one request per entry, in order — so a slow reading never
// holds up the page and a stop takes effect between entries. Nothing here
// is kept: the entries' own rows are the record, and the page is refreshed
// when the run ends.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { matchDocumentFile } from "@/lib/underwriting/agreement-migration";
import { importMigrationItem, type MigrationRunResult } from "./actions";

export interface RunnableItem {
  id: string;
  sourceKey: string;
  sourceFile: string;
  underwriterName: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function RunImports({ items }: { items: RunnableItem[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [log, setLog] = useState<{ key: string; text: string; ok: boolean }[]>([]);
  const stopRef = useRef(false);

  const matched = items.map((item) => ({ item, file: matchDocumentFile(item.sourceFile, files) }));
  const ready = matched.filter(
    (entry): entry is { item: RunnableItem; file: File } =>
      entry.file !== null && entry.file.size <= MAX_BYTES,
  );
  const missing = matched.filter((entry) => entry.file === null);
  const oversized = matched.filter((entry) => entry.file !== null && entry.file.size > MAX_BYTES);

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setDone(0);
    setLog([]);
    for (const [index, { item, file }] of ready.entries()) {
      if (stopRef.current) break;
      const formData = new FormData();
      formData.set("item_id", item.id);
      formData.set("document", file);
      let result: MigrationRunResult;
      try {
        result = await importMigrationItem(formData);
      } catch (error) {
        result = { ok: false, status: "failed", error: (error as Error).message };
      }
      const text = result.ok
        ? result.status === "imported"
          ? `Imported${result.warnings > 0 ? ` — ${result.warnings} to review` : ""}.`
          : "Already imported; linked."
        : result.error;
      setLog((previous) => [...previous, { key: item.sourceKey, text, ok: result.ok }]);
      setDone(index + 1);
    }
    setRunning(false);
    router.refresh();
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
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          disabled={running}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <FieldHint>
          Choose every document the manifest names (select them all at once). Each entry is matched
          by its file name.
        </FieldHint>
      </div>

      {files.length > 0 && (
        <ul className="text-xs text-ink-700">
          <li>
            {ready.length} of {items.length} entries to run have their document.
          </li>
          {missing.length > 0 && (
            <li className="text-danger">
              No document chosen for: {missing.map((entry) => entry.item.sourceFile).join(", ")}
            </li>
          )}
          {oversized.length > 0 && (
            <li className="text-danger">
              Over 10 MB: {oversized.map((entry) => entry.item.sourceFile).join(", ")}
            </li>
          )}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" disabled={running || ready.length === 0} onClick={run}>
          {running
            ? "Importing…"
            : `Import ${ready.length} ${ready.length === 1 ? "entry" : "entries"}`}
        </Button>
        {running && (
          <Button type="button" variant="secondary" onClick={() => (stopRef.current = true)}>
            Stop after this one
          </Button>
        )}
      </div>

      {(running || log.length > 0) && (
        <div className="flex flex-col gap-2">
          <ProgressBar
            label="Agreements imported"
            done={done}
            total={ready.length}
            complete={!running && done === ready.length}
          />
          <p className="text-xs text-ink-500">
            {done} of {ready.length} done
            {running ? " — each reading takes up to a couple of minutes." : "."}
          </p>
          <ul className="flex flex-col gap-1 text-xs">
            {log.map((entry) => (
              <li key={entry.key} className={entry.ok ? "text-ink-700" : "text-danger"}>
                <span className="font-semibold">{entry.key}</span>: {entry.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
