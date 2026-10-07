import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { PAY_BASIS_LABEL, POOL_COSTING_LABEL } from "@/lib/bookings/labels";
import type { BkLaborClassRow, BkPoolRow } from "@/lib/bookings/queries";
import { formatWindow, formatWindowLines, parseWindows } from "@/lib/bookings/scheduling";
import { createLaborClass, createPool, updateLaborClass, updatePoolCatalog } from "./actions";

export type CatalogParams = { new?: string; edit_class?: string; edit_pool?: string };

/**
 * The labor class and pool catalogs (docs/bookings-design.md §23). They used to be a page
 * of their own; they now render under the Labor and Resource pools figures they feed, and
 * on the Setup route. `href` builds this screen's URL with the given catalog query fields
 * and is also what each form returns to (`return_to`), so an action lands back where it
 * was raised. Finance or the director keeps them.
 */
export function ClassCatalog({
  classes,
  canEdit,
  params,
  href,
}: {
  classes: BkLaborClassRow[];
  canEdit: boolean;
  params: CatalogParams;
  href: (extra: Record<string, string>) => string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900">Labor classes</h3>
          <p className="text-xs text-ink-500">
            A class is paid by salary (salary ÷ paid hours) or by the hour, and either charged in a
            strategic price (students) or baseline-funded (professionals, incremental only).
          </p>
        </div>
        {canEdit && params.new !== "class" && (
          <Link
            href={href({ new: "class" })}
            className="text-sm font-bold text-brand-link hover:underline"
          >
            + Labor class
          </Link>
        )}
      </div>
      {canEdit && params.new === "class" && (
        <InlineCreateCard
          title="New labor class"
          action={createLaborClass}
          submitLabel="Add class"
          cancelHref={href({})}
        >
          <input type="hidden" name="return_to" value={href({})} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="class-name">Name</Label>
              <Input id="class-name" name="name" required autoFocus placeholder="Engineer" />
            </div>
            <div>
              <Label htmlFor="class-pay">Pay basis</Label>
              <Select id="class-pay" name="pay_basis" defaultValue="salaried">
                <option value="salaried">{PAY_BASIS_LABEL.salaried}</option>
                <option value="hourly">{PAY_BASIS_LABEL.hourly}</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-900">
              <input type="checkbox" name="charged_in_strategic" className="size-4" />
              Charged in a strategic price
            </label>
          </div>
          <FieldHint>
            Leave the box clear for a baseline-funded professional; tick it for student or OPS
            labor.
          </FieldHint>
        </InlineCreateCard>
      )}
      <TableFrame>
        <Table stack>
          <thead>
            <HeaderRow>
              <Th>Class</Th>
              <Th>Pay basis</Th>
              <Th>In a strategic price</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </HeaderRow>
          </thead>
          <tbody>
            {classes.map((cls) =>
              canEdit && params.edit_class === cls.id ? (
                <Row key={cls.id}>
                  <Cell colSpan={5} stack="full">
                    <form action={updateLaborClass} className="flex flex-col gap-3">
                      <input type="hidden" name="return_to" value={href({})} />
                      <input type="hidden" name="id" value={cls.id} />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div>
                          <Label htmlFor="edit-class-name">Name</Label>
                          <Input
                            id="edit-class-name"
                            name="name"
                            required
                            autoFocus
                            defaultValue={cls.name}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-class-pay">Pay basis</Label>
                          <Select id="edit-class-pay" name="pay_basis" defaultValue={cls.pay_basis}>
                            <option value="salaried">{PAY_BASIS_LABEL.salaried}</option>
                            <option value="hourly">{PAY_BASIS_LABEL.hourly}</option>
                          </Select>
                          <FieldHint>
                            Changing it needs new figures on each draft version.
                          </FieldHint>
                        </div>
                        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-900">
                          <input
                            type="checkbox"
                            name="charged_in_strategic"
                            className="size-4"
                            defaultChecked={cls.charged_in_strategic}
                          />
                          Charged in a strategic price
                        </label>
                        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-900">
                          <input
                            type="checkbox"
                            name="active"
                            className="size-4"
                            defaultChecked={cls.active}
                          />
                          Active
                        </label>
                      </div>
                      <div className="flex items-center gap-4">
                        <Button type="submit">Save</Button>
                        <Link
                          href={href({})}
                          className="text-sm font-bold text-brand-link hover:underline"
                        >
                          Cancel
                        </Link>
                      </div>
                    </form>
                  </Cell>
                </Row>
              ) : (
                <Row key={cls.id} className={cls.active ? undefined : "text-ink-400"}>
                  <Cell stack="title">
                    <span className="font-semibold text-ink-900">{cls.name}</span>
                    <span className="ml-2 text-xs text-ink-400">{cls.key}</span>
                  </Cell>
                  <Cell label="Pay basis">{PAY_BASIS_LABEL[cls.pay_basis]}</Cell>
                  <Cell label="In a strategic price">
                    {cls.charged_in_strategic ? "Charged" : "Baseline-funded"}
                  </Cell>
                  <Cell label="Status">
                    <Badge variant={cls.active ? "success" : "muted"}>
                      {cls.active ? "Active" : "Retired"}
                    </Badge>
                  </Cell>
                  <Cell stack="aside" className="text-right">
                    {canEdit && (
                      <Link
                        href={href({ edit_class: cls.id })}
                        className="text-sm font-bold text-brand-link hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                  </Cell>
                </Row>
              ),
            )}
          </tbody>
        </Table>
      </TableFrame>
    </section>
  );
}

export function PoolCatalog({
  pools,
  canEdit,
  params,
  href,
}: {
  pools: BkPoolRow[];
  canEdit: boolean;
  params: CatalogParams;
  href: (extra: Record<string, string>) => string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900">Resource pools</h3>
          <p className="text-xs text-ink-500">
            What can be booked, in what unit, and how it is costed: a share of the shared production
            pool, or its own budget lines. The default windows are what a new term plan starts with.
          </p>
        </div>
        {canEdit && params.new !== "pool" && (
          <Link
            href={href({ new: "pool" })}
            className="text-sm font-bold text-brand-link hover:underline"
          >
            + Pool
          </Link>
        )}
      </div>
      {canEdit && params.new === "pool" && (
        <InlineCreateCard
          title="New pool"
          action={createPool}
          submitLabel="Add pool"
          cancelHref={href({})}
        >
          <input type="hidden" name="return_to" value={href({})} />
          <PoolFields />
        </InlineCreateCard>
      )}
      <TableFrame>
        <Table stack>
          <thead>
            <HeaderRow>
              <Th>Pool</Th>
              <Th>Unit</Th>
              <Th>Costing</Th>
              <Th>Default windows</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </HeaderRow>
          </thead>
          <tbody>
            {pools.map((pool) => {
              const windows = parseWindows(pool.default_windows);
              return canEdit && params.edit_pool === pool.id ? (
                <Row key={pool.id}>
                  <Cell colSpan={6} stack="full">
                    <form action={updatePoolCatalog} className="flex flex-col gap-3">
                      <input type="hidden" name="return_to" value={href({})} />
                      <input type="hidden" name="id" value={pool.id} />
                      <PoolFields defaults={pool} windows={windows} />
                      <div className="flex items-center gap-4">
                        <Button type="submit">Save</Button>
                        <Link
                          href={href({})}
                          className="text-sm font-bold text-brand-link hover:underline"
                        >
                          Cancel
                        </Link>
                      </div>
                    </form>
                  </Cell>
                </Row>
              ) : (
                <Row key={pool.id} className={pool.active ? undefined : "text-ink-400"}>
                  <Cell stack="title">
                    <span className="font-semibold text-ink-900">{pool.name}</span>
                    <span className="ml-2 text-xs text-ink-400">{pool.key}</span>
                  </Cell>
                  <Cell label="Unit">{pool.unit_label}</Cell>
                  <Cell label="Costing">{POOL_COSTING_LABEL[pool.costing]}</Cell>
                  <Cell label="Default windows" className="text-xs text-ink-500">
                    {windows.length > 0
                      ? windows.map((w) => `${w.label} ${formatWindow(w.start, w.end)}`).join(" · ")
                      : "None (not booked by the window)"}
                  </Cell>
                  <Cell label="Status">
                    <Badge variant={pool.active ? "success" : "muted"}>
                      {pool.active ? "Active" : "Retired"}
                    </Badge>
                  </Cell>
                  <Cell stack="aside" className="text-right">
                    {canEdit && (
                      <Link
                        href={href({ edit_pool: pool.id })}
                        className="text-sm font-bold text-brand-link hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </tbody>
        </Table>
      </TableFrame>
    </section>
  );
}

function PoolFields({
  defaults,
  windows,
}: {
  defaults?: {
    name: string;
    unit_label: string;
    costing: "allocated" | "own_lines";
    active: boolean;
  };
  windows?: ReturnType<typeof parseWindows>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="pool-name">Name</Label>
          <Input
            id="pool-name"
            name="name"
            required
            autoFocus
            defaultValue={defaults?.name ?? ""}
            placeholder="Podcast suite"
          />
        </div>
        <div>
          <Label htmlFor="pool-unit">Unit</Label>
          <Input
            id="pool-unit"
            name="unit_label"
            required
            defaultValue={defaults?.unit_label ?? ""}
            placeholder="half-day, day, hour, event"
          />
        </div>
        <div>
          <Label htmlFor="pool-costing">Costing</Label>
          <Select id="pool-costing" name="costing" defaultValue={defaults?.costing ?? "allocated"}>
            <option value="allocated">{POOL_COSTING_LABEL.allocated}</option>
            <option value="own_lines">{POOL_COSTING_LABEL.own_lines}</option>
          </Select>
        </div>
        {defaults && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-900">
            <input
              type="checkbox"
              name="active"
              className="size-4"
              defaultChecked={defaults.active}
            />
            Active
          </label>
        )}
      </div>
      <div>
        <Label htmlFor="pool-windows">Default windows, one per line</Label>
        <Textarea
          id="pool-windows"
          name="windows"
          rows={3}
          defaultValue={
            windows ? formatWindowLines(windows) : "Morning 08:00–12:00\nAfternoon 13:00–17:00"
          }
        />
        <FieldHint>
          A label and 24-hour times: &quot;Morning 08:00–12:00&quot;. Leave empty for a pool that is
          not booked by the window.
        </FieldHint>
      </div>
    </div>
  );
}
