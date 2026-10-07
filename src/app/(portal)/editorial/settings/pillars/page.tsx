import { listPillars } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import type { PillarRow } from "@/lib/editorial/data";
import { createPillar, deletePillar, movePillar, togglePillarActive } from "../actions";

const PILLARS_PATH = "/editorial/settings/pillars";
type PillarView = "active" | "retired";

/** Coverage pillars (docs/ui-patterns.md): a pillar is two fields, so "+ Add pillar" opens an inline card above the list. */
export default async function PillarsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string; new?: string }>;
}) {
  const { error, view: viewParam, new: newParam } = await searchParams;
  const view: PillarView = viewParam === "retired" ? "retired" : "active";
  const creating = newParam === "1";
  const allPillars = await listPillars();
  const activeCount = allPillars.filter((pillar) => pillar.active).length;
  const retiredCount = allPillars.length - activeCount;
  const pillars = allPillars.filter((pillar) =>
    view === "active" ? pillar.active : !pillar.active,
  );

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        chipsLabel="Show pillars"
        chips={[
          { label: "Active", count: activeCount, href: PILLARS_PATH, active: view === "active" },
          {
            label: "Retired",
            count: retiredCount,
            href: `${PILLARS_PATH}?view=retired`,
            active: view === "retired",
          },
        ]}
      >
        {!creating && <PrimaryLink href={`${PILLARS_PATH}?new=1`}>+ Add pillar</PrimaryLink>}
      </ListToolbar>

      {error && !creating && <Alert>{error}</Alert>}
      <Alert variant="note">
        These are the pillars writers pick from on the pitch form, each with the guiding question
        that explains what it means. A pitch that doesn&apos;t fit a current pillar isn&apos;t
        penalized — the form always offers &quot;Outside current pillars,&quot; &quot;Emerging
        issue,&quot; and &quot;Immediate public need&quot; alongside whatever&apos;s listed here.
        Changing a pillar&apos;s <em>meaning</em> (not just fixing a typo) should be a retire + add,
        since past pitches recorded the name they picked.
      </Alert>

      {creating && (
        <InlineCreateCard
          title="Add a pillar"
          action={createPillar}
          submitLabel="Add pillar"
          cancelHref={PILLARS_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[280px_minmax(0,1fr)]">
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="e.g. Growth and Resilience"
                autoFocus
              />
            </Field>
            <Field
              label="Guiding question"
              htmlFor="guiding_question"
              hint="Shown to writers on the pitch form."
            >
              <Textarea
                id="guiding_question"
                name="guiding_question"
                rows={2}
                placeholder="What enduring tension does this pillar organize coverage around?"
              />
            </Field>
          </div>
        </InlineCreateCard>
      )}

      <div>
        <h2 className="mb-2.5 text-sm font-bold text-ink-900">Coverage pillars</h2>
        <TableFrame>
          <Table stack className="md:min-w-[640px]">
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
    </div>
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
      <Cell stack="title">
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
        <Cell stack="full">
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
      <Cell stack="full">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <TextLink
            href={`/editorial/settings/pillars/${pillar.id}/edit`}
            className="px-0 text-xs font-semibold"
          >
            Edit
          </TextLink>
          <form action={togglePillarActive}>
            <input type="hidden" name="pillar_id" value={pillar.id} />
            <input type="hidden" name="next_active" value={(!pillar.active).toString()} />
            <Button type="submit" variant="link">
              {pillar.active ? "Retire" : "Restore"}
            </Button>
          </form>
          {!pillar.active && (
            <form action={deletePillar}>
              <input type="hidden" name="pillar_id" value={pillar.id} />
              <Button type="submit" variant="danger-link">
                Delete
              </Button>
            </form>
          )}
        </div>
      </Cell>
    </Row>
  );
}
