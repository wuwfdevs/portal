"use client";

import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

/** Copies a guest join link. Mirrors the transcript export's copy affordance. */
export function CopyLinkButton({ link }: { link: string }) {
  const { copy, status } = useCopyToClipboard();

  function handleCopy() {
    void copy(link);
  }

  return (
    <Button type="button" variant="link" onClick={handleCopy} className="text-brand-link">
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : "Copy link"}
    </Button>
  );
}
