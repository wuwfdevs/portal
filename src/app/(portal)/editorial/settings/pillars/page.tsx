import Link from "next/link";
import { listPillars } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import { cn } from "@/lib/cn";
import type { PillarRow } from "@/lib/editorial/data";
import { createPillar, deletePillar, movePillar, togglePillarActive } from "../actions";

type PillarView = "active" | "retired";

export default async function PillarsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string }>;
}) {
  const { error, view: viewParam } = await searchParams;
  const view: PillarView = viewParam === "retired" ? "retired" : "active";
  const allPillars = await listPillars();
  const activeCount = allPillars.filter((pillar) => pillar.active).length;
  const retiredCount = allPillars.length - activeCount;
  const pillars = allPillars.filter((pillar) =>
    view === "active" ? pillar.active : !pillar.active,
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Alert variant="note" className="mb-4">
          These are the pillars writers pick from on the pitch form, each with the guiding question
          that explains what it means. A pitch that doesn&apos;t fit a current pillar isn&apos;t
          penalized — the form always offers &quot;Outside current pillars,&quot; &quot;Emerging
          issue,&quot; and &quot;Immediate public need&quot; alongside whatever&apos;s listed here.
          Changing a pillar&apos;s <em>meaning</em> (not just fixing a typo) should be a retire +
          add, since past pitches recorded the name they picked.
        </Alert>

        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-ink-900">Coverage pillars</h2>
          <div className="flex gap-1.5">
            <ViewTab view="active" current={view} count={activeCount} />
            <ViewTab view="retired" current={view} count={retiredCount} />
          </div>
        </div>

        <TableFrame>
          <Table className="min-w-[640px]">
            <thead>
              <HeaderRow>
                <Th>Pillar</Th>
                {view === "active" && <Th>Order</Th>}
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {pillars.map((pillar, index) => (
                <PillarRowItem
                  key={pillar.id}
                  pillar={pillar}
                  view={view}
                  isFirst={index === 0}
                  isLast={index === pillars.length - 1}
                />
              ))}
            </tbody>
          </Table>
        </TableFrame>

        {pillars.length === 0 && (
          <p className="mt-3 text-sm text-ink-500">
            {view === "active"
              ? "No pillars configured yet — the pitch form will only offer the status options until you add some."
              : "No retired pillars."}
          </p>
        )}
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-80">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Add a pillar
        </div>
        <form action={createPillar} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              placeholder="e.g. Growth and Resilience"
            />
          </div>
          <div>
            <Label htmlFor="guiding_question">Guiding question</Label>
            <Textarea
              id="guiding_question"
              name="guiding_question"
              rows={3}
              placeholder="What enduring tension does this pillar organize coverage around?"
            />
            <FieldHint>Shown to writers on the pitch form.</FieldHint>
          </div>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Add pillar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewTab({
  view,
  current,
  count,
}: {
  view: PillarView;
  current: PillarView;
  count: number;
}) {
  const label = view === "active" ? "Active" : "Retired";
  return (
    <Link
      href={
        view === "active"
          ? "/editorial/settings/pillars"
          : "/editorial/settings/pillars?view=retired"
      }
      aria-current={view === current ? "page" : undefined}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        view === current
          ? "bg-brand-surface text-brand-link"
          : "text-ink-500 hover:bg-panel-50 hover:text-ink-900",
      )}
    >
      {label}
      <span className={cn("ml-1.5", view === current ? "text-brand-link/70" : "text-ink-400")}>
        {count}
      </span>
    </Link>
  );
}

function PillarRowItem({
  pillar,
  view,
  isFirst,
  isLast,
}: {
  pillar: PillarRow;
  view: PillarView;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <Row className={pillar.active ? undefined : "bg-panel-50/40"}>
      <Cell>
        <div className="font-semibold text-ink-900">{pillar.name}</div>
        {pillar.guiding_question && (
          <div className="mt-0.5 text-xs leading-snug text-ink-500">{pillar.guiding_question}</div>
        )}
        {!pillar.active && (
          <span className="mt-1 inline-block align-middle">
            <Badge variant="muted">Retired</Badge>
          </span>
        )}
      </Cell>
      {view === "active" && (
        <Cell>
          <ReorderButtons
            action={movePillar}
            idName="pillar_id"
            id={pillar.id}
            label={pillar.name}
            isFirst={isFirst}
            isLast={isLast}
          />
        </Cell>
      )}
      <Cell>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <Link
            href={`/editorial/settings/pillars/${pillar.id}/edit`}
            className="text-xs font-semibold text-brand-link hover:underline"
          >
            Edit
          </Link>
          <form action={togglePillarActive}>
            <input type="hidden" name="pillar_id" value={pillar.id} />
            <input type="hidden" name="next_active" value={(!pillar.active).toString()} />
            <button
              type="submit"
              className="rounded text-xs font-semibold text-ink-500 hover:text-ink-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-surface"
            >
              {pillar.active ? "Retire" : "Restore"}
            </button>
          </form>
          {!pillar.active && (
            <form action={deletePillar}>
              <input type="hidden" name="pillar_id" value={pillar.id} />
              <button
                type="submit"
                className="rounded text-xs font-semibold text-danger hover:underline focus:outline-none focus:ring-2 focus:ring-brand-surface"
              >
                Delete
              </button>
            </form>
          )}
        </div>
      </Cell>
    </Row>
  );
}
