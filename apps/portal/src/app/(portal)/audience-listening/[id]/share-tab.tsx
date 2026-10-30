"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  buildGroveEmbedCode,
  publicQueryUrl,
  recommendedEmbedHeight,
} from "@/lib/audience-listening/embed";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

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
        <SectionHeading className="mb-2" action={<CopyButton value={url} label="Copy link" />}>
          Public link
        </SectionHeading>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          The standalone page. Use it in a newsletter or a social post, and give it to anyone whose
          browser blocks the microphone inside the embed.
        </p>
        <p className="break-all rounded border border-line bg-panel-50 px-3 py-2.5 font-mono text-xs text-ink-700">
          {url}
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading
          className="mb-2"
          action={<CopyButton value={embedCode} label="Copy embed code" />}
        >
          Grove embed code
        </SectionHeading>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          Paste this into a Grove Responsive Embed element, unchanged. The{" "}
          <code className="font-mono">allow=&quot;microphone&quot;</code> attribute is what lets the
          recorder work inside the article — without it, browsers refuse the microphone and there is
          nothing the page can do about it.
        </p>
        <Alert variant="note" className="mb-3">
          <span className="font-semibold">
            If the embed says recording has to open in a new tab,
          </span>{" "}
          the CMS dropped that permission — either by stripping the attribute, or by wrapping this
          iframe inside one of its own that doesn&apos;t pass it on. Every frame in the chain has to
          allow the microphone, and we only control the innermost one. Nothing is broken: the embed
          detects it and sends people to the public link, which always works. If you&apos;d rather
          not have that extra step, publish the public link on its own instead of the embed.
        </Alert>
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
  const { copy, status } = useCopyToClipboard();

  function handleCopy() {
    void copy(value);
  }

  return (
    <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={handleCopy}>
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : label}
    </Button>
  );
}
