"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";

export interface MessageOption {
  id: string;
  label: string;
  approvalStatus: string;
  /** Approved and inside its effective dates today — placing it needs no override. */
  usable: boolean;
}

/**
 * The placement page's message section: the rotation's pick by default,
 * folded to one line, or a specific message. The override reason appears
 * only when the chosen message actually needs one (not approved, or
 * outside its dates) — docs/underwriting-design.md §6's manager override.
 * Posts `copy_id` (blank for the rotation) and `override_reason`.
 */
export function MessageChoice({
  suggested,
  options,
}: {
  /** The rotation's next pick for this line, or null when nothing linked is eligible. */
  suggested: MessageOption | null;
  options: MessageOption[];
}) {
  const [mode, setMode] = useState<"rotation" | "specific">("rotation");
  const [copyId, setCopyId] = useState(
    options.find((option) => option.usable)?.id ?? options[0]?.id ?? "",
  );
  const selectId = useId();
  const reasonId = useId();
  const chosen = options.find((option) => option.id === copyId) ?? null;
  const needsOverride = mode === "specific" && chosen !== null && !chosen.usable;

  return (
    <div className="flex flex-col gap-2">
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded border px-3.5 py-2.5",
          mode === "rotation"
            ? "border-brand-primary bg-brand-surface/60"
            : "border-line bg-white hover:border-brand-primary",
        )}
      >
        <input
          type="radio"
          name="copy_mode"
          value="rotation"
          checked={mode === "rotation"}
          onChange={() => setMode("rotation")}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary"
        />
        <span className="flex flex-col gap-0.5 text-[13px]">
          <span className="font-semibold text-ink-900">
            Next in rotation{suggested ? ` — ${suggested.label}` : ""}
          </span>
          <span className="text-xs text-ink-500">
            {suggested
              ? "The message after the credit that airs just before the chosen break, whichever line it belongs to."
              : "Decided once a break is chosen — the message after the credit that airs just before it."}
          </span>
        </span>
      </label>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded border px-3.5 py-2.5",
          mode === "specific"
            ? "border-brand-primary bg-brand-surface/60"
            : "border-line bg-white hover:border-brand-primary",
        )}
      >
        <input
          type="radio"
          name="copy_mode"
          value="specific"
          checked={mode === "specific"}
          onChange={() => setMode("specific")}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-2 text-[13px]">
          <span className="font-semibold text-ink-900">A specific message</span>
          {mode === "specific" && (
            <span className="flex flex-col gap-3">
              <span className="block max-w-sm">
                <Label htmlFor={selectId}>Message</Label>
                <Select
                  id={selectId}
                  name="copy_id"
                  value={copyId}
                  onChange={(event) => setCopyId(event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.usable ? "" : ` (${option.approvalStatus})`}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  A hand-picked approved message is a starting point the rotation may later
                  re-sequence; placing with an override pins it.
                </FieldHint>
              </span>
              {needsOverride && (
                <span className="block max-w-sm">
                  <Label htmlFor={reasonId}>Override reason</Label>
                  <Input id={reasonId} name="override_reason" required />
                  <FieldHint>
                    This message isn&apos;t approved or is outside its dates. Only a manager&apos;s
                    override is honored.
                  </FieldHint>
                </span>
              )}
            </span>
          )}
        </span>
      </label>
      {mode === "rotation" && <input type="hidden" name="copy_id" value="" />}
    </div>
  );
}
