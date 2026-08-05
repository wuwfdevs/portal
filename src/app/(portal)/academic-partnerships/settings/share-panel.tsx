"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  EMBED_HEIGHT,
  buildGroveEmbedCode,
  embedFormUrl,
  publicFormUrl,
} from "@/lib/academic-partnerships/embed";

/** The public URL, the Grove embed snippet, and a live preview of it. Mirrors Audience Listening's Share tab. */
export function SharePanel({ siteUrl }: { siteUrl: string }) {
  const url = publicFormUrl(siteUrl);
  const embedSrc = embedFormUrl(siteUrl);
  const embedCode = buildGroveEmbedCode({ siteUrl });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-serif text-[17px] font-bold text-ink-900">Public link</h2>
          <CopyButton value={url} label="Copy link" />
        </div>
        <p className="break-all rounded border border-line bg-panel-50 px-3 py-2.5 font-mono text-xs text-ink-700">
          {url}
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-serif text-[17px] font-bold text-ink-900">Grove embed code</h2>
          <CopyButton value={embedCode} label="Copy embed code" />
        </div>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          Paste this into a Grove Responsive Embed element, unchanged.
        </p>
        <pre className="overflow-x-auto rounded border border-line bg-panel-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-700">
          {embedCode}
        </pre>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 font-serif text-[17px] font-bold text-ink-900">Embed preview</h2>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          What appears inside the iframe, rendered live.
        </p>
        <iframe
          src={embedSrc}
          title="Embedded form preview"
          style={{ height: EMBED_HEIGHT }}
          className="w-full rounded border border-line"
        />
      </Card>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
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
      className="shrink-0 text-xs font-semibold text-brand-link hover:underline"
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
