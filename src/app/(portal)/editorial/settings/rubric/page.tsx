import Link from "next/link";
import { getSettings, listCriteria } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import { createCriterion, moveCriterion, toggleCriterionActive, updateScale } from "../actions";

export default async function RubricSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [criteria, settings] = await Promise.all([listCriteria(), getSettings()]);
  const activeCount = criteria.filter((criterion) => criterion.active).length;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-bold text-ink-900">Scoring criteria</h2>
          <span className="text-xs text-ink-400">
            {activeCount} active
            {criteria.length > activeCount && ` · ${criteria.length - activeCount} retired`}
          </span>
        </div>

        <TableFrame>
          <Table className="min-w-[640px]">
            <thead>
              <HeaderRow>
                <Th>Criterion</Th>
                <Th>Weight</Th>
                <Th>Status</Th>
                <Th>Order</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {criteria.map((criterion, index) => (
                <Row key={criterion.id} className={criterion.active ? undefined : "bg-panel-50/40"}>
                  <Cell>
                    <div className="font-semibold text-ink-900">{criterion.name}</div>
                    <div className="mt-0.5 text-xs leading-snug text-ink-500">
                      {criterion.description}
                    </div>
                    {criterion.guidance && (
                      <div className="mt-1 text-xs leading-snug text-ink-400">
                        {criterion.guidance}
                      </div>
                    )}
                  </Cell>
                  <Cell className="tabular-nums text-ink-500">×{criterion.weight}</Cell>
                  <Cell>
                    {criterion.active ? (
                      <Badge variant="accent">Active</Badge>
                    ) : (
                      <Badge variant="muted">Retired</Badge>
                    )}
                  </Cell>
                  <Cell>
                    <ReorderButtons
                      action={moveCriterion}
                      idName="criterion_id"
                      id={criterion.id}
                      label={criterion.name}
                      isFirst={index === 0}
                      isLast={index === criteria.length - 1}
                    />
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <Link
                        href={`/editorial/settings/rubric/${criterion.id}/edit`}
                        className="text-xs font-semibold text-brand-link hover:underline"
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
                          className="rounded text-xs font-semibold text-ink-500 hover:text-ink-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-surface"
                        >
                          {criterion.active ? "Retire" : "Restore"}
                        </button>
                      </form>
                    </div>
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>

        {criteria.length === 0 && (
          <p className="mt-3 text-sm text-ink-500">
            There is nothing to score against yet. Add a criterion to build the rubric.
          </p>
        )}

        <div className="mt-5 rounded border border-line">
          <div className="border-b border-line px-4 py-3 text-sm font-bold text-ink-900">
            Scoring scale
          </div>
          <form action={updateScale} className="flex flex-wrap items-end gap-3 px-4 py-4">
            <div>
              <Label htmlFor="scale_min">Lowest</Label>
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
            <span className="pb-2.5 text-sm text-ink-400">to</span>
            <div>
              <Label htmlFor="scale_max">Highest</Label>
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
            <p className="basis-full text-xs leading-relaxed text-ink-400">
              Reviewers currently score each criterion from {settings.scale_min} to{" "}
              {settings.scale_max}. Changing this affects future scoring only — past scores keep the
              scale they were given on.
            </p>
          </form>
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-80">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Add a criterion
        </div>
        <form action={createCriterion} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={80} placeholder="e.g. News value" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              required
              maxLength={200}
              placeholder="What question does this score answer?"
            />
          </div>
          <div>
            <Label htmlFor="guidance">Guidance for reviewers</Label>
            <Textarea id="guidance" name="guidance" rows={3} />
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
              className="w-24"
            />
            <FieldHint>1.0 counts the same as every other criterion.</FieldHint>
          </div>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Add criterion</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
