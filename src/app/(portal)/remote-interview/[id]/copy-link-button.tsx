"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <Button type="button" variant="link" onClick={handleCopy} className="text-brand-link">
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : "Copy link"}
    </Button>
  );
}
