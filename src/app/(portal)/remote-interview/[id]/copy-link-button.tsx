"use client";

import { useState } from "react";

/** Copies a guest join link. Mirrors the transcript export's copy affordance. */
export function CopyLinkButton({ link }: { link: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs font-semibold text-brand-link hover:underline"
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : "Copy link"}
    </button>
  );
}
