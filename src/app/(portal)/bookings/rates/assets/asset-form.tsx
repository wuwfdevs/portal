import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  ASSET_BURDEN_LABEL,
  ASSET_CONDITION_LABEL,
  ASSET_FUNDING_LABEL,
} from "@/lib/bookings/labels";
import type { BkAssetRow, BkPoolRow } from "@/lib/bookings/queries";

const FUNDINGS = ["station", "foundation_gift", "grant_restricted", "uwf"] as const;
const BURDENS = ["low", "medium", "high"] as const;
const CONDITIONS = ["good", "fair", "worn", "out_of_service"] as const;

/**
 * The one asset form, shared by /assets/new and /assets/[id]/edit
 * (docs/ui-patterns.md rule 3). A server component: the page passes the
 * action and the record's current values; the error from `?error=` renders
 * inside the form.
 */
export function AssetForm({
  action,
  defaults,
  pools,
  submitLabel,
  cancelHref,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: BkAssetRow;
  pools: BkPoolRow[];
  submitLabel: string;
  cancelHref: string;
  error?: string;
}) {
  const num = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  return (
    <form action={action} className="flex w-full max-w-2xl flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {defaults && <input type="hidden" name="id" value={defaults.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="name">Asset</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={200}
            defaultValue={defaults?.name ?? ""}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="tag">Tag</Label>
          <Input
            id="tag"
            name="tag"
            maxLength={60}
            defaultValue={defaults?.tag ?? ""}
            placeholder="0417-A"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="pool_id">Pool</Label>
          <Select
            id="pool_id"
            name="pool_id"
            defaultValue={defaults?.pool_id ?? pools[0]?.id ?? ""}
          >
            {pools
              .filter((pool) => pool.active || pool.id === defaults?.pool_id)
              .map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="funding">Funding</Label>
          <Select id="funding" name="funding" defaultValue={defaults?.funding ?? "station"}>
            {FUNDINGS.map((funding) => (
              <option key={funding} value={funding}>
                {ASSET_FUNDING_LABEL[funding]}
              </option>
            ))}
          </Select>
          <FieldHint>
            Foundation, member and restricted-grant funding is not prepaid institutional capacity.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="acquired_on">Acquired on</Label>
          <Input
            id="acquired_on"
            name="acquired_on"
            type="date"
            defaultValue={defaults?.acquired_on ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="acquisition_cost">Acquisition cost ($)</Label>
          <Input
            id="acquisition_cost"
            name="acquisition_cost"
            inputMode="decimal"
            defaultValue={num(defaults?.acquisition_cost)}
          />
        </div>
        <div>
          <Label htmlFor="annual_cost">Annual cost ($, a subscription or service)</Label>
          <Input
            id="annual_cost"
            name="annual_cost"
            inputMode="decimal"
            defaultValue={num(defaults?.annual_cost)}
          />
        </div>
        <div>
          <Label htmlFor="useful_life_years">Realistic useful life (years)</Label>
          <Input
            id="useful_life_years"
            name="useful_life_years"
            inputMode="decimal"
            defaultValue={num(defaults?.useful_life_years)}
          />
          <FieldHint>How long it will really serve before it must be replaced.</FieldHint>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="replacement_cost">Replacement cost ($)</Label>
          <Input
            id="replacement_cost"
            name="replacement_cost"
            inputMode="decimal"
            defaultValue={num(defaults?.replacement_cost)}
          />
          <FieldHint>
            What replacing it would cost now. A pool sets aside this ÷ the useful life each year —
            economic capital consumption, not an accounting depreciation schedule. Blank adds zero.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="annual_maintenance">Annual maintenance ($)</Label>
          <Input
            id="annual_maintenance"
            name="annual_maintenance"
            inputMode="decimal"
            defaultValue={num(defaults?.annual_maintenance)}
          />
          <FieldHint>Blank adds zero.</FieldHint>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="maintenance_burden">Maintenance burden</Label>
          <Select
            id="maintenance_burden"
            name="maintenance_burden"
            defaultValue={defaults?.maintenance_burden ?? "low"}
          >
            {BURDENS.map((burden) => (
              <option key={burden} value={burden}>
                {ASSET_BURDEN_LABEL[burden]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="condition">Condition</Label>
          <Select id="condition" name="condition" defaultValue={defaults?.condition ?? "good"}>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {ASSET_CONDITION_LABEL[condition]}
              </option>
            ))}
          </Select>
          <FieldHint>
            Out of service takes the asset off the active list; nothing is deleted.
          </FieldHint>
        </div>
      </div>
      <div>
        <Label htmlFor="restrictions">Restrictions</Label>
        <Input
          id="restrictions"
          name="restrictions"
          defaultValue={defaults?.restrictions ?? ""}
          placeholder="CPB — public-service use; not for external hire"
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
