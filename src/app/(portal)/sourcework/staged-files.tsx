"use client";

import { useState } from "react";
import { FileDrop } from "@/components/ui/file-drop";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatBytes } from "@/lib/format";
import {
  SOURCE_FILE_ACCEPT,
  SOURCE_FILE_HINT,
  classifySourceFile,
  titleFromFileName,
} from "@/lib/transcription/media";
import type { StagedFile } from "./use-source-uploads";

let stagedCounter = 0;

/**
 * Picking and naming the files for an upload: a drop zone, then one row per
 * staged file with its title (taken from the file name, editable) and a
 * Remove. A long list scrolls inside itself, so staging forty files doesn't
 * push the Upload button off the screen.
 */
export function StagedFiles({
  staged,
  onChange,
  disabled,
  extraAction,
}: {
  staged: StagedFile[];
  onChange: (next: StagedFile[]) => void;
  disabled?: boolean;
  /** An action beside "Choose files" in the zone, e.g. "Find in the library". */
  extraAction?: React.ReactNode;
}) {
  const [rejected, setRejected] = useState<string[]>([]);

  function add(files: File[]) {
    const problems: string[] = [];
    const accepted: StagedFile[] = [];
    for (const file of files) {
      const classified = classifySourceFile(file);
      if ("error" in classified) {
        problems.push(file.name);
        continue;
      }
      stagedCounter += 1;
      accepted.push({ key: `staged-${stagedCounter}`, file, title: titleFromFileName(file.name) });
    }
    setRejected(problems);
    if (accepted.length > 0) onChange([...staged, ...accepted]);
  }

  return (
    <div className="flex flex-col gap-3">
      <FileDrop
        accept={SOURCE_FILE_ACCEPT}
        multiple
        disabled={disabled}
        onFiles={add}
        onRejected={(files) => setRejected(files.map((file) => file.name))}
        title="Drop interviews or PDFs here"
        hint={`${SOURCE_FILE_HINT} Several at once is fine; each becomes its own source.`}
        buttonLabel={staged.length > 0 ? "Add more files" : "Choose files"}
      >
        {extraAction}
      </FileDrop>

      {rejected.length > 0 && (
        <Alert variant="danger">
          Not added: {rejected.slice(0, 3).join(", ")}
          {rejected.length > 3 ? ` and ${rejected.length - 3} more` : ""}. Use {SOURCE_FILE_HINT}
        </Alert>
      )}

      {staged.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-ink-700">
            {staged.length} file{staged.length === 1 ? "" : "s"} · titles come from the file names
          </div>
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {staged.map((item) => (
              <li key={item.key} className="flex items-center gap-2">
                <Input
                  value={item.title}
                  disabled={disabled}
                  aria-label={`Title for ${item.file.name}`}
                  onChange={(event) =>
                    onChange(
                      staged.map((s) =>
                        s.key === item.key ? { ...s, title: event.target.value } : s,
                      ),
                    )
                  }
                />
                <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">
                  {formatBytes(item.file.size)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(staged.filter((s) => s.key !== item.key))}
                  className="shrink-0 text-xs font-semibold text-ink-500 hover:underline"
                  aria-label={`Remove ${item.file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
