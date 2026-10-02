"use client";

import { useState } from "react";

/** Copies a DAD cut number to the clipboard, so it can be pasted into DAD when recording. */
export function CopyCutButton({ cut }: { cut: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy cut ${cut}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(cut);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded border border-line bg-white px-3 text-[13px] font-bold text-brand-link hover:bg-brand-surface"
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
    </button>
  );
}
