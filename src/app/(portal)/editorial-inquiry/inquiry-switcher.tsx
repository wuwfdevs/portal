"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { InquirySummary } from "@/lib/editorial-inquiry/queries";
import { startNewInquiry } from "./actions";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function InquirySwitcher({
  inquiries,
  activeId,
}: {
  inquiries: InquirySummary[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[560px] items-center gap-1.5 rounded px-1.5 py-1 text-[13px] text-ink-500 hover:bg-panel-50"
      >
        <span className="max-w-[480px] overflow-hidden text-ellipsis whitespace-nowrap">
          {inquiries.find((i) => i.id === activeId)?.seedQuestion}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-3.5 w-3.5 flex-shrink-0"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 z-20 mt-1.5 w-[420px] rounded border border-line bg-white p-2 shadow-lg">
            <div className="px-2 pt-1 pb-1.5 text-[10px] font-bold tracking-wider text-ink-400 uppercase">
              Switch inquiry
            </div>
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {inquiries.map((inquiry) => (
                <Link
                  key={inquiry.id}
                  href={`/editorial-inquiry?inquiry=${inquiry.id}`}
                  onClick={() => setOpen(false)}
                  className={
                    inquiry.id === activeId
                      ? "block rounded bg-brand-surface px-2 py-2 text-[13px] text-brand-link"
                      : "block rounded px-2 py-2 text-[13px] text-ink-700 hover:bg-panel-50"
                  }
                >
                  {truncate(inquiry.seedQuestion, 70)}
                </Link>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
              <div className="px-2 text-[10px] font-bold tracking-wider text-ink-400 uppercase">
                New inquiry
              </div>
              <form action={startNewInquiry} className="flex flex-col gap-2 px-2 pb-1">
                <Textarea
                  name="seed_question"
                  required
                  rows={2}
                  placeholder="Type a new guiding question…"
                  className="text-[13px]"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Start inquiry</Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
