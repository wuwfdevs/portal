"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  buildGroveEmbedCode,
  publicQueryUrl,
  recommendedEmbedHeight,
} from "@/lib/audience-listening/embed";

/**
 * The two things a reporter copies out of this tool. Client-side because both
 * are clipboard writes; the strings themselves are built by the pure helpers in
 * lib/audience-listening/embed.ts, which is where they can be tested.
 *
 * Nobody should have to edit HTML: the snippet already carries the accessible
 * title, the microphone delegation, a responsive width, and a height that fits
 * this query's question count.
 */
export function ShareTab({
  publicId,
  publicTitle,
  questionCount,
  siteUrl,
  isDraft,
}: {
  publicId: string;
  publicTitle: string;
  questionCount: number;
  siteUrl: string;
  isDraft: boolean;
}) {
  const url = publicQueryUrl(siteUrl, publicId);
  const embedCode = buildGroveEmbedCode({
    siteUrl,
    publicId,
    title: publicTitle,
    questionCount,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {isDraft && (
        <Alert variant="note">
          This query is still a draft, so neither of these works yet — the page reads as though it
          doesn&apos;t exist. Open the query when you&apos;re ready to publish.
        </Alert>
      )}

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-serif text-[17px] font-bold text-ink-900">Public link</h2>
          <CopyButton value={url} label="Copy link" />
        </div>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          The standalone page. Use it in a newsletter or a social post, and give it to anyone whose
          browser blocks the microphone inside the embed.
        </p>
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
          Paste this into a Grove Responsive Embed element, unchanged. The{" "}
          <code className="font-mono">allow=&quot;microphone&quot;</code> attribute is what lets the
          recorder work inside the article — without it, browsers refuse the microphone and there is
          nothing the page can do about it.
        </p>
        <pre className="overflow-x-auto rounded border border-line bg-panel-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-700">
          {embedCode}
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          The height ({recommendedEmbedHeight(questionCount)}px) fits{" "}
          {questionCount === 1 ? "this question" : `these ${questionCount} questions`} without the
          frame scrolling. If you add questions, copy the snippet again.
        </p>
      </Card>
    </div>
  );
}

/** Mirrors the guest join link's copy affordance in Remote Interview. */
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
