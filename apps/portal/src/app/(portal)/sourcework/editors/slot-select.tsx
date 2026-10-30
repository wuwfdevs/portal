"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

/** The phone's picker for a prompt or a format: the list beside the editor is a select here. */
export function SlotSelect({
  slots,
  value,
  path = "/sourcework/editors",
  param = "slot",
  label = "Prompt",
}: {
  slots: { slot: string; label: string }[];
  value: string;
  path?: string;
  /** The query parameter the choice goes in. */
  param?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => router.push(`${path}?${param}=${event.target.value}`)}
      className="min-h-12 font-semibold"
    >
      {slots.map((entry) => (
        <option key={entry.slot} value={entry.slot}>
          {entry.label}
        </option>
      ))}
    </Select>
  );
}
