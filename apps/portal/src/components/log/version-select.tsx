"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

export interface VersionSelectOption {
  id: string;
  label: string;
}

/**
 * The clock page's version picker: a labelled dropdown (a clock can have many
 * versions, so not a toggle — and the page's only toggle is Timeline | Ring).
 * Choosing one navigates to `?version=<id>`, keeping the other query params
 * (`from`) but dropping view/hour/slot, which belong to the version left behind.
 */
export function VersionSelect({
  options,
  currentId,
  basePath,
  keepParams,
}: {
  options: VersionSelectOption[];
  currentId: string;
  basePath: string;
  keepParams: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Version</span>
      <Select
        value={currentId}
        onChange={(event) => {
          const params = new URLSearchParams({ ...keepParams, version: event.target.value });
          router.push(`${basePath}?${params.toString()}`);
        }}
        compact
        className="h-[38px] font-semibold"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
