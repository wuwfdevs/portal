"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

/** The phone's slot picker: the list beside the editor is a select here. */
export function SlotSelect({
  slots,
  value,
  path = "/sourcework/editors",
}: {
  slots: { slot: string; label: string }[];
  value: string;
  path?: string;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Prompt"
      value={value}
      onChange={(event) => router.push(`${path}?slot=${event.target.value}`)}
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
