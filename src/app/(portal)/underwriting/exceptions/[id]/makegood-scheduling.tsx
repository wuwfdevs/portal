"use client";

import { useState, type ReactNode } from "react";
import { ChoiceCards } from "@/components/ui/choice-cards";

type How = "auto" | "pick";

/**
 * How a makegood awaiting a break gets one: left for auto-fill (the default,
 * and how most are scheduled) or a break picked here, for when the
 * underwriter or agency asked for a specific time. Choosing "pick" reveals
 * the break form passed in as children; nothing is saved by the choice itself.
 */
export function MakegoodScheduling({ id, children }: { id: string; children: ReactNode }) {
  const [how, setHow] = useState<How>("auto");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-bold text-ink-700">How should it be scheduled?</legend>
      <ChoiceCards<How>
        name={`makegood_how_${id}`}
        columns={2}
        value={how}
        onChange={setHow}
        options={[
          {
            value: "auto",
            title: "Leave it for auto-fill",
            description:
              "The next auto-fill places it first, ahead of regular credits, in the first eligible break.",
          },
          {
            value: "pick",
            title: "Pick a break now",
            description: "For when the underwriter or the agency asked for a specific time.",
          },
        ]}
      />
      {how === "pick" && (
        <div className="mt-1 rounded border border-dashed border-line px-4 py-3">{children}</div>
      )}
    </fieldset>
  );
}
