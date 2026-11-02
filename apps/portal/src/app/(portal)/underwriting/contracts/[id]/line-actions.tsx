"use client";

import { useState, type ReactNode } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";

export interface LinePanel {
  key: string;
  label: string;
  content: ReactNode;
  variant?: "default" | "danger";
}

/**
 * A "⋮" menu whose items each open one panel below the card — server-
 * rendered forms passed in as ReactNodes, so this component only holds
 * which one is open. Used by the Copy tab's message cards (copy-panel.tsx);
 * the schedule line card moved off it in 2026-09-28's pass (line-menu.tsx,
 * docs/underwriting-traffic-redesign.md §11.7).
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
              <Button
                type="button"
                variant="link"
                onClick={() => setOpen(null)}
                className="text-brand-link"
              >
                Close
              </Button>
            </div>
            {active.content}
          </div>
        </div>
      )}
    </>
  );
}
