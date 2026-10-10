"use client";

import { useState } from "react";
import { Select } from "@/components/ui/input";
import {
  actualityRangeLabel,
  lengthRangeLabel,
  type FormatSpec,
} from "@/lib/sourcework/piece-formats";

export interface GuideFormat {
  id: string;
  name: string;
  spec: FormatSpec;
}

const SECTION_LABEL = { narration: "Narration", actuality: "Actuality", anchor: "Anchor intro" };

/**
 * The format a piece is written to (docs/sourcework-analysis-design.md §6.3), for a piece
 * written by hand as much as a drafted one: pick it, then read its guide while writing.
 * Picking sets the target length; it never touches the content. The guide is a reminder of
 * what the format usually asks for, not a rule the editor enforces.
 */
export function FormatGuide({
  formats,
  formatId,
  actualityCount,
  onChange,
  disabled,
}: {
  formats: GuideFormat[];
  formatId: string | null;
  actualityCount: number;
  onChange: (formatId: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = formats.find((format) => format.id === formatId) ?? null;
  if (formats.length === 0 && !current) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor="piece-format" className="text-xs font-semibold text-ink-700">
          Format
        </label>
        <Select
          id="piece-format"
          value={formatId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
          className="w-auto max-w-full py-1.5 max-lg:min-h-11"
        >
          <option value="">No format</option>
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
            </option>
          ))}
        </Select>
        {current && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="text-[13px] font-bold text-brand-link max-lg:min-h-11"
          >
            {open ? "Hide guide" : "Show guide"}
          </button>
        )}
      </div>
      {current && open && (
        <section
          aria-label={`${current.name} guide`}
          className="rounded border border-line bg-panel-50 px-3.5 py-3 text-[13px] text-ink-700"
        >
          <p>
            <strong>{lengthRangeLabel(current.spec)}</strong> is on target (the anchor&rsquo;s intro
            isn&rsquo;t timed). Usually {actualityRangeLabel(current.spec)}; you have{" "}
            {actualityCount}. Fewer is fine when fewer clips earn their place.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {current.spec.sections.map((section, index) => (
              <li key={index}>
                <span className="font-semibold">
                  {SECTION_LABEL[section.type]}
                  {section.optional ? " (optional)" : ""}:
                </span>{" "}
                {section.guidance}
              </li>
            ))}
          </ol>
          {current.spec.style && <p className="mt-2 text-ink-500">{current.spec.style}</p>}
        </section>
      )}
    </div>
  );
}
