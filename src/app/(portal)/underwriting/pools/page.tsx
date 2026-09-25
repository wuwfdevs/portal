import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { listInventoryPools } from "@/lib/underwriting/queries";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { describeDays } from "@/lib/underwriting/demand";
import {
  addInventoryPoolTarget,
  createInventoryPool,
  removeInventoryPoolTarget,
  setInventoryPoolActive,
} from "../pool-actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5);
}

/**
 * Inventory pools (docs/underwriting-traffic-redesign.md §3): the names an
 * insertion order sells by — "AM Drive", "Total Program Rotation",
 * "Carpool" — and the Log programs, windows, and days each one means. A
 * schedule line targets a pool; its candidate breaks are the marked
 * opportunities matching any of the pool's targets. Station data, entered
 * once by traffic staff.
 */
export default async function InventoryPoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [pools, programs] = await Promise.all([listInventoryPools(), listProgramOptions()]);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Alert variant="note" className="mb-4">
          An order&apos;s &ldquo;AM Drive&rdquo; is not a program in Log. Each pool below maps a
          name the orders use to the real programs, station-local windows, and days a credit may
          land in. A pool with no targets can be chosen on a line but will never find a break; a
          target with no program and no window means any marked opportunity on any program.
        </Alert>
        {pools.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No pools yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {pools.map((pool) => (
              <li key={pool.id} className="rounded border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink-900">{pool.name}</span>
                    {!pool.active && <Badge variant="muted">inactive</Badge>}
                    {pool.targets.length === 0 && pool.active && (
                      <Badge variant="warning">no Log mapping yet</Badge>
                    )}
                  </div>
                  <form action={setInventoryPoolActive}>
                    <input type="hidden" name="pool_id" value={pool.id} />
                    <input type="hidden" name="active" value={pool.active ? "false" : "true"} />
                    <Button type="submit" variant="ghost">
                      {pool.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </form>
                </div>
                {pool.description && (
                  <p className="px-5 pt-3 text-xs text-ink-500">{pool.description}</p>
                )}
                <ul className="divide-y divide-line">
                  {pool.targets.map((target) => (
                    <li
                      key={target.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm"
                    >
                      <span className="text-ink-700">
                        {target.program_id
                          ? (programNameById.get(target.program_id) ?? "Unknown program")
                          : "Any program"}
                        {target.window_start &&
                          target.window_end &&
                          ` · ${formatTime(target.window_start)}–${formatTime(target.window_end)}`}
                        {target.days_of_week && ` · ${describeDays(target.days_of_week)}`}
                        {target.notes && (
                          <span className="ml-2 text-xs text-ink-400">{target.notes}</span>
                        )}
                      </span>
                      <form action={removeInventoryPoolTarget}>
                        <input type="hidden" name="target_id" value={target.id} />
                        <Button type="submit" variant="ghost">
                          Remove
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
                <details className="border-t border-line px-5 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                    Add a target
                  </summary>
                  <form action={addInventoryPoolTarget} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="pool_id" value={pool.id} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <Label htmlFor={`program_${pool.id}`}>Program</Label>
                        <Select id={`program_${pool.id}`} name="program_id" defaultValue="">
                          <option value="">Any program</option>
                          {programs.map((program) => (
                            <option key={program.id} value={program.id}>
                              {program.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`ws_${pool.id}`}>Window from</Label>
                        <Input id={`ws_${pool.id}`} name="window_start" type="time" />
                      </div>
                      <div>
                        <Label htmlFor={`we_${pool.id}`}>Window to</Label>
                        <Input id={`we_${pool.id}`} name="window_end" type="time" />
                      </div>
                    </div>
                    <div>
                      <Label>Days (leave all unchecked for any day)</Label>
                      <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-700">
                        {DAY_LABELS.map((label, index) => (
                          <label key={label} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              name="days_of_week"
                              value={index}
                              className="h-4 w-4"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`notes_${pool.id}`}>Notes</Label>
                      <Input id={`notes_${pool.id}`} name="notes" />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" variant="secondary">
                        Add target
                      </Button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-80">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          New pool
        </div>
        <form action={createInventoryPool} className="flex flex-col gap-4 p-5">
          <div>
            <Label htmlFor="pool_name">Name</Label>
            <Input id="pool_name" name="name" required placeholder="Carpool" />
            <FieldHint>Exactly as the orders name it.</FieldHint>
          </div>
          <div>
            <Label htmlFor="pool_description">Description</Label>
            <Textarea id="pool_description" name="description" rows={2} />
          </div>
          <Button type="submit">Create pool</Button>
        </form>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-400">
          Windows are station-local (Central). A marked opportunity qualifies when its start falls
          inside the window. Program clocks and marked opportunities are managed in{" "}
          <Link href="/log/clocks" className="font-semibold text-brand-link">
            Log
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
