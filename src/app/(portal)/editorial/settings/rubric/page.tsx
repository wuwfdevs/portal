import Link from "next/link";
import { getSettings, listCriteria } from "@/lib/editorial/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { createCriterion, moveCriterion, toggleCriterionActive, updateScale } from "../actions";

export default async function RubricSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [criteria, settings] = await Promise.all([listCriteria(), getSettings()]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Criterion</th>
                <th className="px-4 py-2.5">Weight</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion, index) => (
                <tr key={criterion.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-900">{criterion.name}</div>
                    <div className="text-xs text-ink-400">{criterion.description}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{criterion.weight}</td>
                  <td className="px-4 py-3">
                    {criterion.active ? (
                      <Badge variant="accent">Active</Badge>
                    ) : (
                      <Badge variant="muted">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <form action={moveCriterion}>
                        <input type="hidden" name="criterion_id" value={criterion.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={index === 0}
                          aria-label={`Move ${criterion.name} up`}
                          className="px-1 text-ink-500 disabled:text-ink-400/40"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveCriterion}>
                        <input type="hidden" name="criterion_id" value={criterion.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={index === criteria.length - 1}
                          aria-label={`Move ${criterion.name} down`}
                          className="px-1 text-ink-500 disabled:text-ink-400/40"
                        >
                          ↓
                        </button>
                      </form>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/editorial/settings/rubric/${criterion.id}/edit`}
                        className="text-xs font-semibold text-brand-link"
                      >
                        Edit
                      </Link>
                      <form action={toggleCriterionActive}>
                        <input type="hidden" name="criterion_id" value={criterion.id} />
                        <input
                          type="hidden"
                          name="next_active"
                          value={(!criterion.active).toString()}
                        />
                        <button
                          type="submit"
                          className="text-xs font-semibold text-ink-500 hover:underline"
                        >
                          {criterion.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          action={updateScale}
          className="mt-4 flex flex-wrap items-end gap-2.5 rounded border border-line px-4 py-3"
        >
          <div>
            <Label htmlFor="scale_min">Scale min</Label>
            <Input
              id="scale_min"
              name="scale_min"
              type="number"
              min={0}
              max={9}
              defaultValue={settings.scale_min}
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor="scale_max">Scale max</Label>
            <Input
              id="scale_max"
              name="scale_max"
              type="number"
              min={1}
              max={10}
              defaultValue={settings.scale_max}
              className="w-24"
            />
          </div>
          <Button type="submit" variant="secondary">
            Save scale
          </Button>
          <p className="basis-full text-xs text-ink-400">
            Applies to future scoring only — past scores keep the scale they were given on.
          </p>
        </form>
      </div>

      <div className="w-full rounded border border-line lg:w-80">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Add a criterion
        </div>
        <form action={createCriterion} className="flex flex-col gap-3.5 p-5">
          {error && <p className="text-xs text-danger">{error}</p>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" required />
          </div>
          <div>
            <Label htmlFor="guidance">Guidance for reviewers</Label>
            <textarea
              id="guidance"
              name="guidance"
              rows={3}
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink-900"
            />
            <FieldHint>Shown inline while scoring.</FieldHint>
          </div>
          <div>
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              defaultValue="1.0"
            />
          </div>
          <div className="flex justify-end border-t border-line pt-3.5">
            <Button type="submit">Add criterion</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
