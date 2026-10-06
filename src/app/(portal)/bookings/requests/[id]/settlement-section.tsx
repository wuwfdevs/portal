import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import type { BkSettlementRow } from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import {
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_STATE_LABEL,
  type SettlementResult,
  type SettlementState,
} from "@/lib/bookings/settlements";
import { formatDateShort } from "@/lib/log/program-status";
import { draftSettlementAction, postSettlementAction } from "../settlement-actions";

const money = (value: number) => formatDollars(value, { cents: true });

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-500">{label}</dt>
      <dd className="text-sm font-bold text-ink-900">{value}</dd>
      {hint && <dd className="text-xs text-ink-500">{hint}</dd>}
    </div>
  );
}

/**
 * Settling a delivered project at actual cost (docs/bookings-design.md §21).
 * Finance sees the draft the confirmed hours give, types what each direct expense
 * actually cost, and posts it under a journal entry number; everyone else reads it.
 * The amount charged is the approved estimate's, with expenses at actual cost —
 * the hours change what the work cost WUWF, never what the partner is charged.
 */
export function SettlementSection({
  projectId,
  state,
  settlement,
  preview,
  fundingIndexDefault,
  expenseLines,
  isFinance,
}: {
  projectId: string;
  state: SettlementState;
  settlement: BkSettlementRow | null;
  /** What the confirmed figures give now; null once posted (a posting is frozen). */
  preview: SettlementResult | null;
  fundingIndexDefault: string | null;
  expenseLines: { id: string; label: string; estimatedCost: number; actualCost: number | null }[];
  isFinance: boolean;
}) {
  const posted = settlement?.status === "posted";
  const figures = preview && preview.ok ? preview.figures : null;
  const kind = settlement?.kind ?? figures?.kind ?? null;

  return (
    <section className="flex flex-col gap-3 rounded border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Settlement</h3>
        <Badge variant={posted ? "success" : state === "drafted" ? "accent" : "neutral"}>
          {SETTLEMENT_STATE_LABEL[state]}
        </Badge>
        {kind && <span className="text-xs text-ink-500">{SETTLEMENT_KIND_LABEL[kind]}</span>}
      </div>

      {posted && settlement && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label={settlement.kind === "recharge" ? "Recharged" : "Invoiced"}
              value={money(Number(settlement.amount))}
              hint={`Estimated ${money(Number(settlement.estimated_recovery))}`}
            />
            <Figure
              label="Actual cost to WUWF"
              value={money(Number(settlement.actual_full_cost))}
              hint={
                settlement.estimated_full_cost === null
                  ? undefined
                  : `Estimated ${money(Number(settlement.estimated_full_cost))}`
              }
            />
            <Figure
              label="WUWF contributed"
              value={money(Number(settlement.wuwf_contribution))}
              hint={
                settlement.estimated_contribution === null
                  ? undefined
                  : `Estimated ${money(Number(settlement.estimated_contribution))}`
              }
            />
            <Figure
              label="Journal entry"
              value={settlement.journal_entry_number ?? "—"}
              hint={
                settlement.kind === "recharge" && settlement.funding_index
                  ? `Index ${settlement.funding_index}`
                  : undefined
              }
            />
          </dl>
          <FieldHint>
            Posted {settlement.posted_at ? formatDateShort(settlement.posted_at.slice(0, 10)) : ""}.
            A posted settlement is final; note a correction on the project instead.
          </FieldHint>
        </>
      )}

      {!posted && state === "awaiting_hours" && (
        <Alert variant="note">
          Settling waits on the hours and equipment used. Production confirms them above, once the
          work is delivered.
        </Alert>
      )}

      {!posted && preview && !preview.ok && state !== "awaiting_hours" && (
        <Alert variant="warning">{preview.error}</Alert>
      )}

      {!posted && figures && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label={figures.kind === "recharge" ? "To recharge" : "To invoice"}
              value={money(figures.amount)}
              hint={`Estimated ${money(figures.estimatedRecovery)}`}
            />
            <Figure
              label="Actual cost to WUWF"
              value={money(figures.fullCost)}
              hint={
                figures.costVariance === null
                  ? undefined
                  : figures.costVariance === 0
                    ? "As estimated"
                    : `${money(Math.abs(figures.costVariance))} ${figures.costVariance > 0 ? "over" : "under"} the estimate`
              }
            />
            <Figure
              label="WUWF contributes"
              value={money(figures.contribution)}
              hint="Cost the partner's payment doesn't cover"
            />
            {figures.kind === "invoice" && (
              <Figure
                label="Margin · assessment"
                value={`${money(figures.margin)} · ${money(figures.assessment)}`}
              />
            )}
          </dl>
          <details className="text-xs text-ink-600">
            <summary className="cursor-pointer font-bold text-brand-link">Show cost</summary>
            <p className="mt-2">
              Labor {money(figures.laborCost)} · equipment and space {money(figures.resourceCost)} ·
              direct expenses {money(figures.directCost)}. Hours and equipment are the confirmed
              figures, costed at the rate card this project was priced on.
            </p>
          </details>
        </>
      )}

      {!posted && isFinance && (state === "ready_to_draft" || state === "drafted") && (
        <form action={draftSettlementAction} className="flex flex-col gap-3">
          <input type="hidden" name="project_id" value={projectId} />
          {expenseLines.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {expenseLines.map((line) => (
                <div key={line.id}>
                  <Label htmlFor={`expense_${line.id}`}>{line.label}, actual cost</Label>
                  <Input
                    id={`expense_${line.id}`}
                    name={`expense_${line.id}`}
                    inputMode="decimal"
                    defaultValue={line.actualCost === null ? "" : String(line.actualCost)}
                    placeholder={String(line.estimatedCost)}
                  />
                  <FieldHint>
                    Estimated {money(line.estimatedCost)}. Blank settles as estimated.
                  </FieldHint>
                </div>
              ))}
            </div>
          )}
          {kind === "recharge" && (
            <div className="max-w-xs">
              <Label htmlFor="settlement_funding_index">Funding index</Label>
              <Input
                id="settlement_funding_index"
                name="funding_index"
                defaultValue={settlement?.funding_index ?? fundingIndexDefault ?? ""}
              />
            </div>
          )}
          <div>
            <Label htmlFor="settlement_notes">Notes</Label>
            <Textarea
              id="settlement_notes"
              name="notes"
              rows={2}
              defaultValue={settlement?.notes ?? ""}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary">
              {settlement ? "Update the draft" : "Draft the settlement"}
            </Button>
            <FieldHint>
              Drafting again recalculates from the hours confirmed now. It never changes the
              estimate.
            </FieldHint>
          </div>
        </form>
      )}

      {!posted && isFinance && state === "drafted" && settlement && (
        <form
          action={postSettlementAction}
          className="flex flex-col gap-3 border-t border-line pt-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          {settlement.kind === "recharge" && (
            <input type="hidden" name="funding_index" value={settlement.funding_index ?? ""} />
          )}
          <div className="max-w-xs">
            <Label htmlFor="journal_entry_number">Journal entry number</Label>
            <Input id="journal_entry_number" name="journal_entry_number" required />
            <FieldHint>
              Post it in the university&apos;s own system first, then enter its number here. Posting
              settles the project.
            </FieldHint>
          </div>
          <div>
            <Button type="submit">Post the settlement</Button>
          </div>
        </form>
      )}

      {!posted && !isFinance && state !== "awaiting_hours" && (
        <FieldHint>Finance drafts and posts the settlement.</FieldHint>
      )}
    </section>
  );
}
