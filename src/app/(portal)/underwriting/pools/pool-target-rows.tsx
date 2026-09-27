"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { Input, Label } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface ProgramOption {
  id: string;
  name: string;
}

/**
 * The repeating Log-target rows inside the inline "New pool" card. The only
 * client state is the list of row keys — every field is a plain named input
 * the Server Action reads back, with each row's fields prefixed by its key
 * (`target_<k>_program_id`, …) and a hidden `target_keys` per row telling the
 * action which keys exist. A row's day checkboxes contribute zero-to-seven
 * values, which is why the fields are keyed rather than parallel `getAll`
 * arrays. Starts with one row; zero rows is allowed (the pool can still be
 * chosen on a line — it just never finds a break).
 */
export function PoolTargetRows({ programs }: { programs: ProgramOption[] }) {
  const [keys, setKeys] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  const addRow = () => {
    setKeys((current) => [...current, nextKey]);
    setNextKey((current) => current + 1);
  };
  const removeRow = (key: number) => setKeys((current) => current.filter((k) => k !== key));

  return (
    <div className="flex flex-col gap-2.5">
      {keys.map((key) => {
        const prefix = `target_${key}_`;
        return (
          <div
            key={key}
            className="flex flex-col gap-2.5 rounded border border-line bg-panel-50 p-3"
          >
            <input type="hidden" name="target_keys" value={key} />
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,2fr)_120px_120px_minmax(0,2fr)_auto]">
              <div>
                <Label htmlFor={`${prefix}program_id`}>Program</Label>
                <SearchableSelect
                  id={`${prefix}program_id`}
                  name={`${prefix}program_id`}
                  placeholder="Any program"
                  options={programs.map((program) => ({ id: program.id, label: program.name }))}
                />
              </div>
              <div>
                <Label htmlFor={`${prefix}window_start`}>From</Label>
                <Input id={`${prefix}window_start`} name={`${prefix}window_start`} type="time" />
              </div>
              <div>
                <Label htmlFor={`${prefix}window_end`}>To</Label>
                <Input id={`${prefix}window_end`} name={`${prefix}window_end`} type="time" />
              </div>
              <div>
                <Label htmlFor={`${prefix}notes`}>Notes</Label>
                <Input id={`${prefix}notes`} name={`${prefix}notes`} />
              </div>
              <Button type="button" variant="ghost" onClick={() => removeRow(key)}>
                Remove
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-ink-700">Days</span>
              <DayPicker name={`${prefix}days_of_week`} />
              <span className="text-xs text-ink-400">None checked means any day.</span>
            </div>
          </div>
        );
      })}
      {keys.length === 0 && (
        <p className="text-xs text-warning-fg">
          With no targets, this pool can be chosen on a line but will never find a break.
        </p>
      )}
      <button
        type="button"
        onClick={addRow}
        className="self-start text-xs font-semibold text-brand-link hover:underline"
      >
        + Another target
      </button>
    </div>
  );
}
