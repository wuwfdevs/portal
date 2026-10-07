import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { PAY_BASIS_LABEL, POOL_COSTING_LABEL } from "@/lib/bookings/labels";
import { RATES_PATH } from "@/lib/bookings/paths";
import { listLaborClasses, listPools } from "@/lib/bookings/queries";
import { formatWindow, formatWindowLines, parseWindows } from "@/lib/bookings/scheduling";
import { createLaborClass, createPool, updateLaborClass, updatePoolCatalog } from "../actions";
import { RatesTabs } from "../rates-tabs";

type Params = { new?: string; edit_class?: string; edit_pool?: string; error?: string };

const SETUP_PATH = `${RATES_PATH}/setup`;

/**
 * Classes and pools (the Setup page): the two catalogs the rest of Bookings hangs off — labor classes
 * (who does production work, and how each class is paid) and resource pools
 * (what can be booked, in what unit, costed how). Unversioned, retired
 * rather than deleted; a new class or pool needs its figures on each version
 * (Labor and Resource pools tabs) and, for a pool, a term resource on each
 * term plan. Finance or the director keeps them.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const canEdit = context.isFinance || context.isDirector;
  const [classes, pools] = await Promise.all([listLaborClasses(), listPools()]);

  return (
    <div className="flex flex-col gap-6">
      <RatesTabs active="setup" versionId={null} />
      {params.error && <Alert>{params.error}</Alert>}
      <p className="max-w-3xl text-xs text-ink-500">
        The model is built from these two lists. Adding a labor class — a second producer, an
        engineer — or a pool — a podcast suite, a second studio — needs no code: add it here, give
        it figures on the draft version, and (for a pool) a resource on the term plan. Nothing is
        deleted; retire instead.
      </p>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Labor classes</h3>
            <p className="text-xs text-ink-500">
              A class is paid by salary (salary ÷ paid hours) or by the hour, and either charged in
              a strategic price (students) or baseline-funded (professionals, incremental only).
            </p>
          </div>
          {canEdit && params.new !== "class" && (
            <Link
              href={`${SETUP_PATH}?new=class`}
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
            cancelHref={SETUP_PATH}
          >
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
                            <Select
                              id="edit-class-pay"
                              name="pay_basis"
                              defaultValue={cls.pay_basis}
                            >
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
                            href={SETUP_PATH}
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
                          href={`${SETUP_PATH}?edit_class=${cls.id}`}
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Resource pools</h3>
            <p className="text-xs text-ink-500">
              What can be booked, in what unit, and how it is costed: a share of the shared
              production pool, or its own budget lines. The default windows are what a new term plan
              starts with.
            </p>
          </div>
          {canEdit && params.new !== "pool" && (
            <Link
              href={`${SETUP_PATH}?new=pool`}
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
            cancelHref={SETUP_PATH}
          >
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
                        <input type="hidden" name="id" value={pool.id} />
                        <PoolFields defaults={pool} windows={windows} />
                        <div className="flex items-center gap-4">
                          <Button type="submit">Save</Button>
                          <Link
                            href={SETUP_PATH}
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
                        ? windows
                            .map((w) => `${w.label} ${formatWindow(w.start, w.end)}`)
                            .join(" · ")
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
                          href={`${SETUP_PATH}?edit_pool=${pool.id}`}
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
    </div>
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
