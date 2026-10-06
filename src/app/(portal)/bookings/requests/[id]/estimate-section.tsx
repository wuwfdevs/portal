import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { PRODUCTION_RATE_LABEL, formatQuantity } from "@/lib/bookings/labels";
import { requestHref } from "@/lib/bookings/paths";
import { estimateTotals, isAdjusted, legacyRateDelta, recipeDifference } from "@/lib/bookings/pricing";
import { LINE_KIND_LABEL } from "@/lib/bookings/projects";
import type {
  BkEstimateLineRow,
  BkPoolRow,
  PricingContext,
  ProjectDetail,
} from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import type { BkEstimateLineKind, BkPricingTreatment } from "@/lib/database.types";
import {
  addEstimateLine,
  adjustLineScope,
  removeEstimateLine,
  resetLineScope,
  setPricing,
  updateEstimateLine,
} from "../actions";

const TREATMENTS: readonly BkPricingTreatment[] = ["strategic", "incremental", "external"];
const LINE_KINDS: readonly BkEstimateLineKind[] = ["package", "labor", "expense"];

/**
 * The estimate (docs/bookings-design.md §4): the priced-as strip with its
 * reason, the lines, totals, and — for production staff while the project
 * is still being estimated — the pricing control and the add-line card.
 */
export function EstimateSection({
  detail,
  pricing,
  canEdit,
  isExecutive,
  openCard,
  editingLine,
  adjustingLine,
  pools,
}: {
  detail: ProjectDetail;
  pricing: PricingContext | null;
  canEdit: boolean;
  isExecutive: boolean;
  /** `?adjust=<lineId>` — the package line whose scope is being adjusted (§20.6). */
  adjustingLine: string | null;
  pools: BkPoolRow[];
  /** `?new=line&kind=` */
  openCard: { kind: BkEstimateLineKind } | null;
  /** `?line=<id>` */
  editingLine: string | null;
}) {
  const { project, lines } = detail;
  const here = requestHref(project.id);
  const totals = estimateTotals(lines.map(asLike));
  const delta = legacyRateDelta(lines.map(asLike));
  const provisional = pricing ? pricing.version.status !== "adopted" : true;

  return (
    <section className="flex flex-col gap-3 rounded border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Estimate</h3>
        <span className="text-xs text-ink-500">
          Priced from{" "}
          {detail.version_label ? `rate model ${detail.version_label}` : "the rate model in use"}
          {provisional ? " — provisional until a version is adopted" : ""}.
        </span>
      </div>

      {!pricing && (
        <Alert variant="note">
          No rate card is recorded for estimates. Finance records one on the Rates tab (Rate card →
          Record for estimates) before a line can be priced.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-line bg-panel-50 px-4 py-3 text-sm text-ink-700">
        {project.priced_as ? (
          <>
            <Badge variant="accent">{PRODUCTION_RATE_LABEL[project.priced_as]}</Badge>
            {project.pricing_overridden_by && <Badge variant="warning">Changed by hand</Badge>}
            <span>{project.pricing_reason}</span>
          </>
        ) : (
          <span>
            Not priced yet. The rate is worked out from the partner and the strategic question once a
            line is added.
          </span>
        )}
      </div>

      {canEdit &&
        (project.stage === "request" || project.stage === "estimate") &&
        project.disposition === null && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-bold text-brand-link">
              Change how it is priced
            </summary>
            <form
              action={setPricing}
              className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-end"
            >
              <input type="hidden" name="project_id" value={project.id} />
              <div>
                <Label htmlFor="treatment">Rate</Label>
                <Select
                  id="treatment"
                  name="treatment"
                  defaultValue={
                    project.pricing_overridden_by ? (project.priced_as ?? "derived") : "derived"
                  }
                >
                  <option value="derived">Worked out from the facts</option>
                  {TREATMENTS.map((t) => (
                    <option key={t} value={t}>
                      {PRODUCTION_RATE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="pricing_reason">Why</Label>
                <Input
                  id="pricing_reason"
                  name="reason"
                  maxLength={300}
                  placeholder="Required when changing the worked-out rate"
                />
                <FieldHint>
                  Giving a rate that makes WUWF contribute staff time, against what the facts say,
                  is the Executive Director&apos;s call
                  {isExecutive ? "" : " — it will be refused for anyone else"}; every change is
                  audited.
                </FieldHint>
              </div>
              <Button type="submit" variant="secondary">
                Apply
              </Button>
            </form>
          </details>
        )}

      {lines.length === 0 ? (
        <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
          No lines yet. Add a service package, labor hours beyond a package, or a direct expense.
        </p>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Line</Th>
                <Th className="text-right">Quantity</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Amount</Th>
                {canEdit && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </HeaderRow>
            </thead>
            <tbody>
              {lines.map((line) =>
                editingLine === line.id && canEdit ? (
                  <Row key={line.id}>
                    <Cell colSpan={canEdit ? 5 : 4} stack="full">
                      <form
                        action={updateEstimateLine}
                        className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end"
                      >
                        <input type="hidden" name="project_id" value={project.id} />
                        <input type="hidden" name="line_id" value={line.id} />
                        {line.kind === "expense" ? (
                          <>
                            <div className="col-span-2">
                              <Label htmlFor="l_label">Expense</Label>
                              <Input
                                id="l_label"
                                name="label"
                                required
                                maxLength={200}
                                defaultValue={line.label}
                              />
                            </div>
                            <div>
                              <Label htmlFor="l_cost">Cost each</Label>
                              <Input
                                id="l_cost"
                                name="unit_cost"
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                defaultValue={String(costOf(line))}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 text-sm text-ink-900 sm:col-span-3">
                            {line.label}
                          </div>
                        )}
                        <div>
                          <Label htmlFor="l_quantity">Quantity</Label>
                          <Input
                            id="l_quantity"
                            name="quantity"
                            type="number"
                            step="0.25"
                            min="0.25"
                            required
                            defaultValue={String(line.quantity)}
                          />
                        </div>
                        <div className="flex items-end gap-3">
                          <Button type="submit" variant="secondary">
                            Save
                          </Button>
                          <Link
                            href={here}
                            className="pb-2.5 text-sm font-bold text-brand-link hover:underline"
                          >
                            Cancel
                          </Link>
                        </div>
                        <div className="col-span-2 sm:col-span-5">
                          <Label htmlFor="l_notes">Notes</Label>
                          <Input
                            id="l_notes"
                            name="notes"
                            maxLength={300}
                            defaultValue={line.notes ?? ""}
                          />
                        </div>
                      </form>
                    </Cell>
                  </Row>
                ) : (
                  <Row key={line.id}>
                    <Cell stack="title">
                      {line.label}
                      <span className="block text-xs text-ink-500">
                        {LINE_KIND_LABEL[line.kind]}
                        {line.notes ? ` · ${line.notes}` : ""}
                      </span>
                      {isAdjusted(asLike(line)) && (
                        <span className="mt-1 block text-xs text-warning-fg">
                          <Badge variant="warning">Adjusted scope</Badge>{" "}
                          {describeDifference(line, pricing, pools)} — {line.adjustment_reason}
                        </span>
                      )}
                    </Cell>
                    <Cell label="Quantity" className="text-right">
                      {formatQuantity(Number(line.quantity))} {line.unit_label}
                      {Number(line.quantity) === 1 ? "" : "s"}
                    </Cell>
                    <Cell label="Rate" className="text-right">
                      {formatDollars(Number(line.unit_rate))}
                    </Cell>
                    <Cell label="Amount" className="text-right font-semibold">
                      {formatDollars(Number(line.amount))}
                    </Cell>
                    {canEdit && (
                      <Cell stack="full" className="text-right">
                        <span className="inline-flex items-center gap-2">
                          <Link
                            href={requestHref(project.id, { line: line.id })}
                            className="text-sm font-bold text-brand-link hover:underline"
                          >
                            Edit
                          </Link>
                          {line.kind === "package" &&
                            line.recipe_labor_hours &&
                            (project.stage === "request" || project.stage === "estimate") && (
                              <Link
                                href={requestHref(project.id, { adjust: line.id })}
                                className="text-sm font-bold text-brand-link hover:underline"
                              >
                                Adjust scope
                              </Link>
                            )}
                          <form action={removeEstimateLine} className="inline">
                            <input type="hidden" name="project_id" value={project.id} />
                            <input type="hidden" name="line_id" value={line.id} />
                            <Button type="submit" variant="ghost">
                              Remove
                            </Button>
                          </form>
                        </span>
                      </Cell>
                    )}
                  </Row>
                ),
              )}
              <Row className="bg-panel-50/60">
                <Cell stack="title" className="font-semibold">
                  Total
                </Cell>
                <Cell stack="hide" />
                <Cell stack="hide" />
                <Cell label="Total" className="text-right font-semibold">
                  {formatDollars(totals.total)}
                </Cell>
                {canEdit && <Cell stack="hide" />}
              </Row>
            </tbody>
          </Table>
        </TableFrame>
      )}

      {delta !== null && (
        <p className="text-xs text-ink-500">
          Against the $500-a-webcast convention: {delta >= 0 ? "+" : "−"}
          {formatDollars(Math.abs(delta))}
          {project.legacy_rate_delta !== null ? " (recorded at approval)" : ""}.
        </p>
      )}

      {canEdit && pricing && adjustingLine && (
        <ScopeCard
          line={lines.find((l) => l.id === adjustingLine) ?? null}
          projectId={project.id}
          classes={pricing.classes}
          pools={pools}
          cancelHref={here}
        />
      )}

      {canEdit &&
        pricing &&
        project.disposition === null &&
        (project.stage === "request" || project.stage === "estimate") &&
        (openCard ? (
          <InlineCreateCard
            title="Add a line"
            action={addEstimateLine}
            submitLabel="Add the line"
            cancelHref={here}
          >
            <input type="hidden" name="project_id" value={project.id} />
            <input type="hidden" name="kind" value={openCard.kind} />
            <FilterChips
              label="Kind"
              className="mb-4"
              chips={LINE_KINDS.map((kind) => ({
                label: LINE_KIND_LABEL[kind],
                href: requestHref(project.id, { new: "line", kind }),
                active: kind === openCard.kind,
              }))}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {openCard.kind === "package" && (
                <div className="sm:col-span-2">
                  <Label htmlFor="package_id">Service package</Label>
                  <Select id="package_id" name="package_id" required defaultValue="">
                    <option value="" disabled>
                      Choose a package
                    </option>
                    {pricing.packages
                      .filter(
                        (pkg) =>
                          pkg.active &&
                          (pkg.agreement_id === null || pkg.agreement_id === project.agreement_id),
                      )
                      .map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name} ({pkg.unit_label})
                        </option>
                      ))}
                  </Select>
                  <FieldHint>
                    Its hours and equipment are copied onto the line.
                  </FieldHint>
                </div>
              )}
              {openCard.kind === "labor" && (
                <div className="sm:col-span-2">
                  <Label htmlFor="labor_class_id">Labor class</Label>
                  <Select id="labor_class_id" name="labor_class_id" required defaultValue="">
                    <option value="" disabled>
                      Choose a class
                    </option>
                    {pricing.classes
                      .filter((cls) => cls.active)
                      .map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                  </Select>
                  <FieldHint>
                    Hours beyond a package, at the class&apos;s loaded rate; a baseline-funded class
                    is WUWF&apos;s contribution when strategic.
                  </FieldHint>
                </div>
              )}
              {openCard.kind === "expense" && (
                <>
                  <div>
                    <Label htmlFor="e_label">Expense</Label>
                    <Input
                      id="e_label"
                      name="label"
                      required
                      maxLength={200}
                      placeholder="Travel to Fort Walton Beach"
                    />
                  </div>
                  <div>
                    <Label htmlFor="e_cost">Cost each</Label>
                    <Input
                      id="e_cost"
                      name="unit_cost"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                    />
                    <FieldHint>At cost; plus the assessment for an external project.</FieldHint>
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="0.25"
                  min="0.25"
                  required
                  defaultValue="1"
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="n_notes">Notes</Label>
                <Textarea id="n_notes" name="notes" rows={2} maxLength={300} />
              </div>
            </div>
          </InlineCreateCard>
        ) : (
          <div>
            <Link
              href={requestHref(project.id, { new: "line", kind: "package" })}
              className="text-sm font-bold text-brand-link hover:underline"
            >
              + Add a line
            </Link>
          </div>
        ))}
    </section>
  );
}

function asLike(line: BkEstimateLineRow) {
  return { ...line, labor_hours: line.labor_hours ?? {} };
}

/** The cost typed for an expense line, kept apart from the rate derived from it (§18.8). */
function costOf(line: BkEstimateLineRow): number {
  return Number(line.direct_cost ?? line.unit_rate);
}

function nameOf<T extends { id: string; name: string }>(rows: readonly T[], id: string, fallback: string): string {
  return rows.find((row) => row.id === id)?.name ?? fallback;
}

function describeDifference(
  line: BkEstimateLineRow,
  pricing: PricingContext | null,
  pools: BkPoolRow[],
): string {
  const diff = recipeDifference(asLike(line));
  const parts = [
    ...diff.labor.map(
      (row) =>
        `${nameOf(pricing?.classes ?? [], row.classId, "Crew")}: ${formatQuantity(row.standard)} → ${formatQuantity(row.actual)} h`,
    ),
    ...diff.resources.map(
      (row) =>
        `${nameOf(pools, row.poolId, "Equipment")}: ${formatQuantity(row.standard)} → ${formatQuantity(row.actual)}`,
    ),
  ];
  return parts.join("; ");
}

/**
 * Adjust one package line's hours, units or crew for this project, with a
 * required reason (docs/bookings-design.md §20.6): a project-level override that
 * never changes the package or the rate model version.
 */
function ScopeCard({
  line,
  projectId,
  classes,
  pools,
  cancelHref,
}: {
  line: BkEstimateLineRow | null;
  projectId: string;
  classes: PricingContext["classes"];
  pools: BkPoolRow[];
  cancelHref: string;
}) {
  if (!line || line.kind !== "package" || !line.recipe_labor_hours || !line.recipe_resource_units) {
    return null;
  }
  const labor = line.labor_hours ?? {};
  const units = line.resource_units ?? {};
  const classIds = [...new Set([...Object.keys(line.recipe_labor_hours), ...Object.keys(labor)])];
  const poolIds = [...new Set([...Object.keys(line.recipe_resource_units), ...Object.keys(units)])];
  return (
    <section className="flex flex-col gap-3 rounded border border-warning-fg/30 bg-warning-bg/40 p-4">
      <h4 className="text-sm font-bold text-ink-900">Adjust the scope of {line.label}</h4>
      <p className="text-xs text-ink-600">
        The standard package is the starting point. What you change here applies to this request
        only — the package and the rates are not touched — and the request is flagged as adjusted.
        Hours and units are per {line.unit_label}.
      </p>
      <form action={adjustLineScope} className="flex flex-col gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="line_id" value={line.id} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {classIds.map((id) => (
            <div key={id}>
              <Label htmlFor={`hours_${id}`}>{nameOf(classes, id, "Crew")} hours</Label>
              <Input
                id={`hours_${id}`}
                name={`hours_${id}`}
                type="number"
                step="0.25"
                min="0"
                defaultValue={String(labor[id] ?? 0)}
              />
              <FieldHint>Standard: {formatQuantity(Number(line.recipe_labor_hours?.[id] ?? 0))}</FieldHint>
            </div>
          ))}
          {poolIds.map((id) => (
            <div key={id}>
              <Label htmlFor={`units_${id}`}>{nameOf(pools, id, "Equipment")}</Label>
              <Input
                id={`units_${id}`}
                name={`units_${id}`}
                type="number"
                step="0.25"
                min="0"
                defaultValue={String(units[id] ?? 0)}
              />
              <FieldHint>Standard: {formatQuantity(Number(line.recipe_resource_units?.[id] ?? 0))}</FieldHint>
            </div>
          ))}
        </div>
        <div>
          <Label htmlFor="scope_reason">Why is this scope different?</Label>
          <Input
            id="scope_reason"
            name="reason"
            required
            maxLength={300}
            defaultValue={line.adjustment_reason ?? ""}
            placeholder="Two stages, so a second crew"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">Adjust the scope</Button>
          <Link href={cancelHref} className="text-sm font-bold text-brand-link hover:underline">
            Cancel
          </Link>
        </div>
      </form>
      {line.adjustment_reason && (
        <form action={resetLineScope}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="line_id" value={line.id} />
          <Button type="submit" variant="secondary">
            Back to the standard package
          </Button>
        </form>
      )}
    </section>
  );
}
