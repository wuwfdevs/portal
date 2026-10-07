import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DayPicker } from "@/components/ui/day-picker";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { listInventoryPools } from "@/lib/underwriting/queries";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { describeDays } from "@/lib/underwriting/demand";
import {
  addInventoryPoolTarget,
  createInventoryPool,
  removeInventoryPoolTarget,
  setInventoryPoolActive,
} from "../../pool-actions";
import { PoolTargetRows } from "./pool-target-rows";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const POOLS_PATH = "/underwriting/setup/pools";

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
 *
 * A pool is small enough to create in place (docs/ui-patterns.md): "+ New
 * pool" opens an inline card above the list with name, description, and the
 * Log targets in one step; "Add a target" on an existing pool is only for
 * later edits.
 */
export default async function InventoryPoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; error?: string; field?: string }>;
}) {
  const { q, new: newParam, error, field } = await searchParams;
  const creating = newParam === "1";
  const query = (q ?? "").trim().toLowerCase();
  const [pools, programs] = await Promise.all([listInventoryPools(), listProgramOptions()]);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));

  const shown = pools.filter(
    (pool) =>
      query === "" ||
      pool.name.toLowerCase().includes(query) ||
      pool.targets.some((target) =>
        (target.program_id ? (programNameById.get(target.program_id) ?? "") : "")
          .toLowerCase()
          .includes(query),
      ),
  );
  // A create failure lands back here with the card open; the message goes
  // under the field it names, or above the list for anything else.
  const createError = creating ? error : undefined;
  const nameError = field === "name" ? createError : undefined;
  const targetsError = field === "targets" ? createError : undefined;
  const generalError = field === "name" || field === "targets" ? undefined : error;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageHeader
          back={{ href: "/underwriting/setup", label: "Setup" }}
          title="Inventory pools"
        />
      </div>
      <ListToolbar
        search={{
          placeholder: "Search pools or programs",
          label: "Search pools",
          defaultValue: q,
        }}
      >
        {!creating && <PrimaryLink href={`${POOLS_PATH}?new=1`}>+ New pool</PrimaryLink>}
      </ListToolbar>

      {generalError && <Alert>{generalError}</Alert>}
      <Alert variant="note">
        An order&apos;s &ldquo;AM Drive&rdquo; is not a program in On Air. Each pool below maps a
        name the orders use to the real programs, station-local windows, and days a credit may land
        in. A pool with no targets can be chosen on a line but will never find a break; a target
        with no program and no window means any marked opportunity on any program.
      </Alert>

      {creating && (
        <InlineCreateCard
          title="New pool"
          action={createInventoryPool}
          submitLabel="Create pool"
          cancelHref={POOLS_PATH}
          sections={
            <div className="flex flex-col gap-2.5 border-t border-line px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold text-ink-700">On Air targets</span>
                <span className="text-xs text-ink-400">
                  Where a credit sold as this pool may land. Leave a field blank for any; fully
                  blank rows are skipped.
                </span>
              </div>
              <PoolTargetRows programs={programs} />
              {targetsError && <FieldError>{targetsError}</FieldError>}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <Label htmlFor="pool_name">Name</Label>
              <Input id="pool_name" name="name" required placeholder="Carpool" autoFocus />
              {nameError ? (
                <FieldError>{nameError}</FieldError>
              ) : (
                <FieldHint>Exactly as the orders name it.</FieldHint>
              )}
            </div>
            <div>
              <Label htmlFor="pool_description">Description</Label>
              <Input id="pool_description" name="description" />
            </div>
          </div>
        </InlineCreateCard>
      )}

      {shown.length === 0 ? (
        <EmptyState>{pools.length === 0 ? "No pools yet." : "No pools match."}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((pool) => (
            <li key={pool.id} className="rounded border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink-900">{pool.name}</span>
                  {!pool.active && <Badge variant="muted">inactive</Badge>}
                  {pool.targets.length === 0 && pool.active && (
                    <Badge variant="warning">no On Air mapping yet</Badge>
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
                      <SearchableSelect
                        id={`program_${pool.id}`}
                        name="program_id"
                        placeholder="Any program"
                        options={programs.map((program) => ({
                          id: program.id,
                          label: program.name,
                        }))}
                      />
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
                    <Label>Days</Label>
                    <DayPicker name="days_of_week" />
                    <FieldHint>None checked means any day.</FieldHint>
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

      <p className="text-xs text-ink-500">
        Windows are station-local (Central). A marked opportunity qualifies when its start falls
        inside the window. Program clocks and marked opportunities are managed in{" "}
        <TextLink href="/log/programs">On Air</TextLink>.
      </p>
    </div>
  );
}
