"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  buildGroveEmbedCode,
  embedFormUrl,
  publicFormUrl,
} from "@/lib/academic-partnerships/embed";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

/** The public URL, the Grove embed snippet, and a live preview of it. Mirrors Audience Listening's Share tab. */
export function SharePanel({ siteUrl }: { siteUrl: string }) {
  const url = publicFormUrl(siteUrl);
  const embedSrc = embedFormUrl(siteUrl);
  const embedCode = buildGroveEmbedCode({ siteUrl });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card className="p-5">
        <SectionHeading className="mb-2" action={<CopyButton value={url} label="Copy link" />}>
          Public link
        </SectionHeading>
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
          Paste this into a Grove Responsive Embed element, unchanged.
        </p>
        <pre className="overflow-x-auto rounded border border-line bg-panel-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-700">
          {embedCode}
        </pre>
      </Card>

      <Card className="p-5">
        <SectionHeading className="mb-2">Embed preview</SectionHeading>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          What appears inside the iframe, sized to its actual content — not the fixed height in the
          snippet above. A Grove embed is cross-origin and has no way to read its own content
          height, so that snippet uses a fixed guess; this preview can measure it exactly because
          it&apos;s served from this same site.
        </p>
        <LivePreviewFrame src={embedSrc} />
      </Card>
    </div>
  );
}

/**
 * Auto-sized iframe preview. Only possible because this preview is
 * same-origin (this Settings screen and /partner/embed are both served from
 * this site) — a real Grove embed is cross-origin, where reading
 * contentDocument is blocked by the browser, which is exactly why the actual
 * embed snippet has to use a fixed height instead. See design doc §3 for why
 * there is no postMessage-based resizer script bridging that gap.
 */
function LivePreviewFrame({ src }: { src: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: ResizeObserver | undefined;

    function measure() {
      const doc = iframe?.contentDocument;
      if (!doc?.documentElement) return;
      setHeight(doc.documentElement.scrollHeight);
    }

    function onLoad() {
      measure();
      const body = iframe?.contentDocument?.body;
      if (!body) return;
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(body);
    }

    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="Embedded form preview"
      style={{ height }}
      className="w-full rounded border border-line"
    />
  );
}

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
