import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { formatQuantity } from "@/lib/bookings/labels";
import { plannedFigures } from "@/lib/bookings/observed";
import type { BkHoursUsedRow, BkPoolRow, ProjectDetail } from "@/lib/bookings/queries";
import { confirmHoursUsed } from "../actions";

type HoursUsedRow = BkHoursUsedRow;

/**
 * What the delivered project used (docs/bookings-design.md §3F, §20.8):
 * prefilled from the estimate, one click to confirm as planned or the figures
 * to correct. It feeds the term report and the next version, never the price.
 */
export function HoursUsed({
  detail,
  classes,
  pools,
  confirmed,
  canEdit,
}: {
  detail: ProjectDetail;
  classes: { id: string; name: string }[];
  pools: BkPoolRow[];
  confirmed: HoursUsedRow[];
  canEdit: boolean;
}) {
  const planned = plannedFigures(
    detail.lines.map((l) => ({
      kind: l.kind,
      package_id: l.package_id,
      label: l.label,
      quantity: Number(l.quantity),
      labor_hours: l.labor_hours ?? {},
      resource_units: l.resource_units ?? {},
      recipe_labor_hours: l.recipe_labor_hours,
      recipe_resource_units: l.recipe_resource_units,
    })),
  );
  const classIds = Object.keys(planned.labor);
  const poolIds = Object.keys(planned.resources);
  if (classIds.length === 0 && poolIds.length === 0) return null;
  const usedFor = (kind: "labor" | "units", id: string): number | null => {
    const row = confirmed.find(
      (r) => r.kind === kind && (kind === "labor" ? r.labor_class_id : r.pool_id) === id,
    );
    return row ? Number(row.used) : null;
  };
  const isConfirmed = confirmed.length > 0;
  const nameOf = (rows: { id: string; name: string }[], id: string) =>
    rows.find((r) => r.id === id)?.name ?? "—";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Hours and equipment used</h3>
        {isConfirmed ? (
          <Badge variant="success">Confirmed</Badge>
        ) : (
          <span className="text-xs text-ink-500">
            Prefilled from the estimate. Confirm as planned, or correct what was different.
          </span>
        )}
      </div>
      <form action={confirmHoursUsed} className="flex flex-col gap-3">
        <input type="hidden" name="project_id" value={detail.project.id} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {classIds.map((id) => (
            <div key={id}>
              <Label htmlFor={`used_hours_${id}`}>{nameOf(classes, id)} hours</Label>
              <Input
                id={`used_hours_${id}`}
                name={`hours_${id}`}
                type="number"
                step="0.25"
                min="0"
                disabled={!canEdit}
                defaultValue={String(usedFor("labor", id) ?? planned.labor[id])}
              />
              <FieldHint>Planned {formatQuantity(planned.labor[id]!)}</FieldHint>
            </div>
          ))}
          {poolIds.map((id) => (
            <div key={id}>
              <Label htmlFor={`used_units_${id}`}>{nameOf(pools, id)}</Label>
              <Input
                id={`used_units_${id}`}
                name={`units_${id}`}
                type="number"
                step="0.25"
                min="0"
                disabled={!canEdit}
                defaultValue={String(usedFor("units", id) ?? planned.resources[id])}
              />
              <FieldHint>Planned {formatQuantity(planned.resources[id]!)}</FieldHint>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" name="mode" value="as_planned">
              Confirm as planned
            </Button>
            <Button type="submit" name="mode" value="custom" variant="secondary">
              Save these figures
            </Button>
            <FieldHint>
              Used figures feed the term report and the next rate version. They never change the
              estimate&apos;s price.
            </FieldHint>
          </div>
        )}
      </form>
    </Card>
  );
}
