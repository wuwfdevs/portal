"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildGroveEmbedCode, embedFormUrl, publicFormUrl } from "@/lib/bookings/embed";

/**
 * The public URL, the Grove embed snippet, and a live preview of it — the
 * Academic Partnerships settings screen's Share panel, pointed at /book.
 */
export function SharePanel({ siteUrl }: { siteUrl: string }) {
  const url = publicFormUrl(siteUrl);
  const embedSrc = embedFormUrl(siteUrl);
  const embedCode = buildGroveEmbedCode({ siteUrl });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-900">Public link</h3>
          <CopyButton value={url} label="Copy link" />
        </div>
        <p className="break-all rounded border border-line bg-panel-50 px-3 py-2.5 font-mono text-xs text-ink-700">
          {url}
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-900">Grove embed code</h3>
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
        <h3 className="mb-2 text-sm font-bold text-ink-900">Preview</h3>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          What appears inside the iframe, sized to its content. A Grove embed is cross-origin and
          cannot read its own height, so the snippet above uses a fixed one; this preview is served
          from this site and can measure it.
        </p>
        <LivePreviewFrame src={embedSrc} />
      </Card>
    </div>
  );
}

/** Auto-sized preview — possible only because it is same-origin; see the Academic Partnerships panel. */
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
    <Button type="button" variant="link" onClick={handleCopy} className="shrink-0 text-brand-link">
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : label}
    </Button>
  );
}
