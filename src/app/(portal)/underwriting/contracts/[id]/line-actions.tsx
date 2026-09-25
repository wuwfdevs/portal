"use client";

import { useState, type ReactNode } from "react";
import { ActionMenu } from "@/components/ui/action-menu";

export interface LinePanel {
  key: string;
  label: string;
  content: ReactNode;
  variant?: "default" | "danger";
}

/**
 * A schedule line card's "⋮" menu: each item opens one panel below the
 * card (the manual placement form, the demand-by-period table, the
 * placements list, cancel-from-a-date) — server-rendered forms passed in
 * as ReactNodes, so this component only holds which one is open.
 */
export function LineActions({ label, panels }: { label: string; panels: LinePanel[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = panels.find((panel) => panel.key === open) ?? null;
  return (
    <>
      <ActionMenu
        label={label}
        items={panels.map((panel) => ({
          label: panel.label,
          variant: panel.variant,
          onClick: () => setOpen((current) => (current === panel.key ? null : panel.key)),
        }))}
      />
      {active && (
        <div className="basis-full">
          <div className="mt-3 rounded border border-dashed border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
                {active.label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="text-xs font-semibold text-brand-link hover:underline"
              >
                Close
              </button>
            </div>
            {active.content}
          </div>
        </div>
      )}
    </>
  );
}
