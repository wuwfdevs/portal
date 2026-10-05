import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { OWNER_LABEL, formatAssumptionValue } from "@/lib/bookings/labels";
import { ratesHref } from "@/lib/bookings/paths";
import {
  getVersionDetail,
  listVersions,
  pickVersion,
  type BkAssumptionRow,
} from "@/lib/bookings/queries";
import {
  MODEL_INPUT_KEYS,
  MODEL_INPUT_LABEL,
  POOL_LABEL,
  POOL_KEYS,
  adoptionGate,
  formatDollars,
  sensitivity,
} from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import {
  createAssumption,
  deleteAssumption,
  setAssumptionValidation,
  updateAssumption,
} from "./actions";
import { NoVersions, RatesHeader } from "./rates-header";
import { ValidationBadge, ValidationControls } from "./validation-controls";

type Params = { version?: string; edit?: string; new?: string; accept?: string; error?: string };

const OWNER_OPTIONS = ["finance", "director", "executive"] as const;

function AssumptionEditRow({
  row,
  versionId,
  cancelHref,
}: {
  row: BkAssumptionRow;
  versionId: string;
  cancelHref: string;
}) {
  return (
    <Row>
      <Cell colSpan={6} stack="full">
        <form action={updateAssumption} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="version_id" value={versionId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <Label htmlFor={`label-${row.id}`}>Name</Label>
              <Input
                id={`label-${row.id}`}
                name="label"
                defaultValue={row.label}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor={`value-${row.id}`}>Value</Label>
              <Input
                id={`value-${row.id}`}
                name="value"
                inputMode="decimal"
                defaultValue={String(row.value)}
                required
              />
              <FieldHint>A share as a decimal: 0.35 is 35%.</FieldHint>
            </div>
            <div>
              <Label htmlFor={`unit-${row.id}`}>Unit</Label>
              <Input id={`unit-${row.id}`} name="unit" defaultValue={row.unit} required />
            </div>
            <div>
              <Label htmlFor={`owner-${row.id}`}>Validated by</Label>
              <Select id={`owner-${row.id}`} name="owner" defaultValue={row.owner}>
                {OWNER_OPTIONS.map((owner) => (
                  <option key={owner} value={owner}>
                    {OWNER_LABEL[owner]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`basis-${row.id}`}>Source or basis</Label>
              <Input id={`basis-${row.id}`} name="basis" defaultValue={row.basis ?? ""} />
            </div>
            <div>
              <Label htmlFor={`source_url-${row.id}`}>Source link</Label>
              <Input
                id={`source_url-${row.id}`}
                name="source_url"
                type="url"
                defaultValue={row.source_url ?? ""}
              />
            </div>
            <div>
              <Label htmlFor={`needed-${row.id}`}>What validating it takes</Label>
              <Input
                id={`needed-${row.id}`}
                name="validation_needed"
                defaultValue={row.validation_needed ?? ""}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`notes-${row.id}`}>Notes</Label>
            <Textarea id={`notes-${row.id}`} name="notes" rows={2} defaultValue={row.notes ?? ""} />
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit">Save</Button>
            <Link href={cancelHref} className="text-sm font-bold text-brand-link hover:underline">
              Cancel
            </Link>
            <span className="flex-1" />
            <FieldHint>A changed value goes back to awaiting validation.</FieldHint>
          </div>
        </form>
      </Cell>
    </Row>
  );
}

function AssumptionsTable({
  title,
  intro,
  rows,
  versionId,
  params,
  canEdit,
  canValidate,
  showKind,
}: {
  title: string;
  intro: string;
  rows: BkAssumptionRow[];
  versionId: string;
  params: Params;
  canEdit: boolean;
  canValidate: boolean;
  showKind: boolean;
}) {
  const here = (extra?: Record<string, string>) => ratesHref("assumptions", versionId, extra);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <p className="text-xs text-ink-500">{intro}</p>
      </div>
      {rows.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-4 text-sm text-ink-500">
          Nothing here yet.
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Input</Th>
                <Th className="text-right">Value</Th>
                <Th>Source or basis</Th>
                <Th>Validation</Th>
                <Th>Owner</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map((row) =>
                canEdit && params.edit === row.id ? (
                  <AssumptionEditRow
                    key={row.id}
                    row={row}
                    versionId={versionId}
                    cancelHref={here()}
                  />
                ) : (
                  <Row key={row.id}>
                    <Cell stack="title">
                      <div className="font-semibold text-ink-900">{row.label}</div>
                      {showKind && (
                        <div className="text-xs text-ink-400">
                          {row.kind === "shared_pool_line"
                            ? "Shared production resource pool"
                            : row.kind === "webcast_pool_line"
                              ? "Webcasting operating pool"
                              : row.key
                                ? MODEL_INPUT_LABEL[
                                    row.key as (typeof MODEL_INPUT_KEYS)[number]
                                  ] === row.label
                                  ? "Model input"
                                  : `Model input · ${MODEL_INPUT_LABEL[row.key as (typeof MODEL_INPUT_KEYS)[number]] ?? row.key}`
                                : "Model input"}
                        </div>
                      )}
                      {row.notes && <div className="mt-1 text-xs text-ink-500">{row.notes}</div>}
                    </Cell>
                    <Cell label="Value" className="text-right tabular-nums">
                      <span className="font-semibold text-ink-900">
                        {formatAssumptionValue(Number(row.value), row.unit)}
                      </span>
                      <span className="block text-xs text-ink-400">{row.unit}</span>
                    </Cell>
                    <Cell label="Source">
                      {row.source_url ? (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-link hover:underline"
                        >
                          {row.basis ?? "Source"}
                        </a>
                      ) : (
                        (row.basis ?? "—")
                      )}
                    </Cell>
                    <Cell label="Validation">
                      <div className="flex flex-col gap-1.5">
                        <ValidationBadge state={row.validation_state} />
                        {row.validation_state === "pending" && row.validation_needed && (
                          <span className="text-xs text-ink-500">{row.validation_needed}</span>
                        )}
                        {canValidate && (
                          <ValidationControls
                            action={setAssumptionValidation}
                            id={row.id}
                            versionId={versionId}
                            state={row.validation_state}
                            note={row.validation_note}
                            acceptOpen={params.accept === row.id}
                            acceptHref={here({ accept: row.id })}
                            closeHref={here()}
                          />
                        )}
                        {!canValidate && row.validation_note && (
                          <span className="text-xs text-ink-500">{row.validation_note}</span>
                        )}
                      </div>
                    </Cell>
                    <Cell label="Owner">{OWNER_LABEL[row.owner]}</Cell>
                    <Cell stack="full" className="text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={here({ edit: row.id })}
                            className="text-sm font-bold text-brand-link hover:underline"
                          >
                            Edit
                          </Link>
                          <form action={deleteAssumption}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="version_id" value={versionId} />
                            <Button type="submit" variant="ghost" className="text-xs text-ink-500">
                              Remove
                            </Button>
                          </form>
                        </div>
                      )}
                    </Cell>
                  </Row>
                ),
              )}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </section>
  );
}

export default async function RatesAssumptionsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const versions = await listVersions();
  const version = pickVersion(versions, params.version);
  if (!version) return <NoVersions context={context} section="assumptions" />;
  const detail = await getVersionDetail(version);

  const canEdit = context.isFinance && version.status === "draft";
  const canValidate =
    context.isFinance && (version.status === "draft" || version.status === "submitted");
  const sourced = detail.assumptions.filter((row) => row.section === "sourced");
  const working = detail.assumptions.filter((row) => row.section === "working");
  const gate = adoptionGate([
    ...detail.assumptions.map((row) => ({ validationState: row.validation_state })),
    ...detail.pools.map((row) => ({ validationState: row.validation_state })),
  ]);
  const computed = cardForVersion(detail);
  const usedKeys = new Set(detail.assumptions.map((row) => row.key).filter(Boolean));
  const freeKeys = MODEL_INPUT_KEYS.filter((key) => !usedKeys.has(key));
  const here = (extra?: Record<string, string>) => ratesHref("assumptions", version.id, extra);

  return (
    <div className="flex flex-col gap-6">
      <RatesHeader
        context={context}
        versions={versions}
        version={version}
        section="assumptions"
        error={params.error}
        gatePending={gate.pending}
      />

      {canEdit && params.new === "1" && (
        <InlineCreateCard
          title="Add an input"
          action={createAssumption}
          submitLabel="Add input"
          cancelHref={here()}
        >
          <input type="hidden" name="version_id" value={version.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-kind">What kind of input</Label>
              <Select id="new-kind" name="kind" defaultValue="shared_pool_line">
                <option value="shared_pool_line">Budget line in the shared production pool</option>
                <option value="webcast_pool_line">Budget line in the webcasting pool</option>
                <option value="model_input">A model input the rate math reads</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-key">Model input (for a model input only)</Label>
              <Select id="new-key" name="key" defaultValue="">
                <option value="">—</option>
                {freeKeys.map((key) => (
                  <option key={key} value={key}>
                    {MODEL_INPUT_LABEL[key]}
                  </option>
                ))}
              </Select>
              <FieldHint>Only inputs this version doesn&apos;t have yet are offered.</FieldHint>
            </div>
            <div>
              <Label htmlFor="new-label">Name</Label>
              <Input id="new-label" name="label" required autoFocus />
            </div>
            <div>
              <Label htmlFor="new-section">Section</Label>
              <Select id="new-section" name="section" defaultValue="working">
                <option value="sourced">Sourced cost input</option>
                <option value="working">Working assumption</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-value">Value</Label>
              <Input id="new-value" name="value" inputMode="decimal" required />
              <FieldHint>A share as a decimal: 0.35 is 35%.</FieldHint>
            </div>
            <div>
              <Label htmlFor="new-unit">Unit</Label>
              <Input
                id="new-unit"
                name="unit"
                placeholder="per year, per hour, of salary, hours…"
                required
              />
            </div>
            <div>
              <Label htmlFor="new-basis">Source or basis</Label>
              <Input id="new-basis" name="basis" />
            </div>
            <div>
              <Label htmlFor="new-source_url">Source link</Label>
              <Input id="new-source_url" name="source_url" type="url" />
            </div>
            <div>
              <Label htmlFor="new-owner">Validated by</Label>
              <Select id="new-owner" name="owner" defaultValue="finance">
                {OWNER_OPTIONS.map((owner) => (
                  <option key={owner} value={owner}>
                    {OWNER_LABEL[owner]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="new-needed">What validating it takes</Label>
              <Input id="new-needed" name="validation_needed" />
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="new-notes">Notes</Label>
            <Textarea id="new-notes" name="notes" rows={2} />
          </div>
        </InlineCreateCard>
      )}

      <AssumptionsTable
        title="Sourced current cost inputs"
        intro="FY26–27 operating and auxiliary budget lines. The shared production pool is the sum of its lines; the webcasting pool is the sum of its own."
        rows={sourced}
        versionId={version.id}
        params={params}
        canEdit={canEdit}
        canValidate={canValidate}
        showKind
      />

      <AssumptionsTable
        title="Working assumptions"
        intro="Validate before adoption. Each row names who must validate it and what that takes; changing a value never changes an adopted version."
        rows={working}
        versionId={version.id}
        params={params}
        canEdit={canEdit}
        canValidate={canValidate}
        showKind={false}
      />

      {canEdit && params.new !== "1" && (
        <div>
          <Link
            href={here({ new: "1" })}
            className="text-sm font-bold text-brand-link hover:underline"
          >
            + Add an input
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded border border-line bg-white p-4">
          <h3 className="text-sm font-bold text-ink-900">
            Derived — recomputed from the rows above
          </h3>
          {computed.ok ? (
            <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-500">Professional loaded hourly cost</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatDollars(computed.card.derived.proLoadedHourly, { cents: true })}
              </dd>
              <dt className="text-ink-500">Student / OPS loaded hourly cost</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatDollars(computed.card.derived.studentLoadedHourly, { cents: true })}
              </dd>
              <dt className="text-ink-500">Shared production resource pool</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatDollars(computed.card.derived.sharedPoolAnnual)} / yr
              </dd>
              <dt className="text-ink-500">Webcast operations per event</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatDollars(computed.card.derived.webcastOpsPerEvent)}
              </dd>
              <dt className="text-ink-500">Baseline institutional capacity</dt>
              <dd className="text-right font-semibold tabular-nums">
                {computed.card.derived.baselineCapacityDays} days
              </dd>
              {POOL_KEYS.map((pool) => (
                <div key={pool} className="contents">
                  <dt className="text-ink-500">
                    {POOL_LABEL[pool]}, per {computed.card.derived.pools[pool].unitLabel}
                  </dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {formatDollars(computed.card.derived.pools[pool].costPerUnit, { cents: true })}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-500">
              This version can&apos;t be priced yet. Missing:{" "}
              {[
                ...computed.missing.missing.map((key) => MODEL_INPUT_LABEL[key]),
                ...computed.missing.missingPools.map((pool) => `${POOL_LABEL[pool]} pool`),
              ].join(", ")}
              .
            </p>
          )}
        </section>

        <section className="rounded border border-line bg-white p-4">
          <h3 className="text-sm font-bold text-ink-900">Adoption gate</h3>
          <p className="mt-3 text-sm text-ink-700">
            {gate.pending === 0 ? (
              version.status === "adopted" ? (
                "Every input was validated or accepted as is, and this version is adopted."
              ) : (
                "Every input is validated or accepted as is. Finance can submit this version, and the Executive Director adopts it."
              )
            ) : (
              <>
                <span className="font-semibold text-ink-900">
                  {gate.pending} of {gate.total}
                </span>{" "}
                inputs await validation. Finance must mark each one validated, or accepted as is
                with a note, before this version can be submitted; the Executive Director adopts it.
              </>
            )}
          </p>
          {version.status !== "adopted" && (
            <p className="mt-2 text-xs text-ink-500">
              Until then estimates price at the version in use and every figure stays labelled
              provisional.
            </p>
          )}
        </section>

        <section className="rounded border border-line bg-white p-4">
          <h3 className="text-sm font-bold text-ink-900">What moves the price most</h3>
          {computed.ok ? (
            <>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {sensitivity(
                  (() => {
                    // cardForVersion already proved the model assembles; rebuild it for the moves.
                    const assembled = computed.card;
                    return {
                      inputs: Object.fromEntries(
                        MODEL_INPUT_KEYS.map((key) => [
                          key,
                          Number(detail.assumptions.find((row) => row.key === key)?.value ?? 0),
                        ]),
                      ) as Record<(typeof MODEL_INPUT_KEYS)[number], number>,
                      sharedPoolLines: detail.assumptions
                        .filter((row) => row.kind === "shared_pool_line")
                        .map((row) => Number(row.value)),
                      webcastPoolLines: detail.assumptions
                        .filter((row) => row.kind === "webcast_pool_line")
                        .map((row) => Number(row.value)),
                      pools: Object.fromEntries(
                        POOL_KEYS.map((pool) => [
                          pool,
                          {
                            allocationShare: assembled.derived.pools[pool].allocationShare,
                            availableUnits: assembled.derived.pools[pool].availableUnits,
                            unitLabel: assembled.derived.pools[pool].unitLabel,
                          },
                        ]),
                      ) as Record<
                        (typeof POOL_KEYS)[number],
                        { allocationShare: number; availableUnits: number; unitLabel: string }
                      >,
                    };
                  })(),
                  computed.specs,
                )
                  .slice(0, 4)
                  .map((row) => {
                    const biggest = computed.specs.reduce<{ name: string; delta: number } | null>(
                      (best, spec) => {
                        const delta = row.deltas[spec.key] ?? 0;
                        return !best || Math.abs(delta) > Math.abs(best.delta)
                          ? { name: `${spec.name} (${spec.unitLabel})`, delta }
                          : best;
                      },
                      null,
                    );
                    return (
                      <li key={row.move.key} className="flex items-baseline justify-between gap-3">
                        <span className="text-ink-700">
                          {row.move.label}{" "}
                          <span className="text-ink-400">{row.move.moveLabel}</span>
                        </span>
                        <span className="whitespace-nowrap text-right font-semibold tabular-nums text-ink-900">
                          {biggest && biggest.delta !== 0
                            ? `${biggest.delta > 0 ? "+" : "−"}${formatDollars(Math.abs(biggest.delta), { cents: true })}`
                            : "—"}
                          {biggest && (
                            <span className="block text-xs font-normal text-ink-400">
                              {biggest.name}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                Computed by re-running the rate math with one input moved, so validation effort goes
                where it changes the card.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Available once the version can be priced.</p>
          )}
        </section>
      </div>
    </div>
  );
}
