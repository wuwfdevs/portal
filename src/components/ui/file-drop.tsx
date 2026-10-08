"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { matchesAccept } from "@/lib/file-accept";

/**
 * A drop zone around a file picker. The button is the keyboard and
 * screen-reader path (a real file input behind it); dragging files onto the
 * zone is the shortcut. Dropped files are checked against `accept` the same
 * way the picker does, and the ones that fail are handed to `onRejected`
 * rather than silently ignored. Files go to `onFiles`; the zone holds no
 * state about them, so the screen owns the list.
 */
export function FileDrop({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  onRejected,
  title,
  hint,
  buttonLabel,
  className,
  children,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRejected?: (files: File[]) => void;
  /** The line in the zone: "Drop interviews or PDFs here". */
  title: ReactNode;
  hint?: ReactNode;
  buttonLabel: string;
  className?: string;
  /** Extra actions beside the button ("Find in the library"). */
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept_(files: File[]) {
    const wanted = multiple ? files : files.slice(0, 1);
    const ok = wanted.filter((file) => matchesAccept(file, accept));
    const bad = wanted.filter((file) => !matchesAccept(file, accept));
    if (bad.length > 0) onRejected?.(bad);
    if (ok.length > 0) onFiles(ok);
  }

  return (
    <div
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) accept_(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "flex flex-col items-center gap-2 rounded border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragging ? "border-brand-primary bg-brand-surface/60" : "border-line bg-panel-50",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="text-[15px] font-bold text-ink-900">{title}</div>
      {hint && <div className="max-w-md text-[13px] text-ink-500">{hint}</div>}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </Button>
        {children}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          // Reset so choosing the same file again still fires a change.
          event.currentTarget.value = "";
          accept_(files);
        }}
      />
    </div>
  );
}
