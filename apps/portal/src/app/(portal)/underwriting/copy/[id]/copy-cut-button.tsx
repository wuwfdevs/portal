"use client";

import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

/** Copies a DAD cut number to the clipboard, so it can be pasted into DAD when recording. */
export function CopyCutButton({ cut }: { cut: string }) {
  const { copy, status } = useCopyToClipboard(1500);
  const copied = status === "copied";
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={`Copy cut ${cut}`}
      onClick={() => void copy(cut)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
