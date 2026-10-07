import { getSettings, listCriteria, listRubricProfiles } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/section-heading";
import { Field, Input } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import type { CriterionRow, RubricProfileRow } from "@/lib/editorial/data";
import {
  createCriterion,
  moveCriterion,
  toggleCriterionActive,
  updateModifierThreshold,
  updateScale,
} from "../actions";
import { CriterionFields } from "./criterion-form";

const RUBRIC_PATH = "/editorial/settings/rubric";
type CriterionView = "active" | "retired";

/** The rubric (docs/ui-patterns.md): "+ Add criterion" opens an inline card above the profiles' criteria tables; the scale and threshold settings stay below them. */
export default async function RubricSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string; new?: string }>;
}) {
  const { error, view: viewParam, new: newParam } = await searchParams;
  const view: CriterionView = viewParam === "retired" ? "retired" : "active";
  const creating = newParam === "1";
  const [allCriteria, settings, profiles] = await Promise.all([
    listCriteria(),
    getSettings(),
    listRubricProfiles(),
  ]);
  const activeCount = allCriteria.filter((c) => c.active).length;
  const retiredCount = allCriteria.length - activeCount;
  const criteria = allCriteria.filter((c) => (view === "active" ? c.active : !c.active));

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        chipsLabel="Show criteria"
        chips={[
          { label: "Active", count: activeCount, href: RUBRIC_PATH, active: view === "active" },
          {
            label: "Retired",
            count: retiredCount,
            href: `${RUBRIC_PATH}?view=retired`,
            active: view === "retired",
          },
        ]}
      >
        {!creating && <PrimaryLink href={`${RUBRIC_PATH}?new=1`}>+ Add criterion</PrimaryLink>}
      </ListToolbar>

      {error && !creating && <Alert>{error}</Alert>}
      <Alert variant="note">
        Weights express this newsroom&apos;s priorities and are worth revisiting periodically.
        Changing a criterion&apos;s <em>meaning</em> (not just fixing a typo) should be a retire +
        add, not an edit — past scores were given against the wording in force at the time, and
        editing in place would silently rewrite what they meant. The rubric is a structured aid to
        judgment, not an automatic commissioning system — editors always retain discretion.
      </Alert>

      {creating && (
        <InlineCreateCard
          title="Add a criterion"
          action={createCriterion}
          submitLabel="Add criterion"
          cancelHref={RUBRIC_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <CriterionFields profiles={profiles} />
        </InlineCreateCard>
      )}

      <div>
        {profiles.map((profile) => (
          <ProfileRubric
            key={profile.id}
            profile={profile}
            criteria={criteria.filter((c) => c.profile_id === profile.id)}
            view={view}
          />
        ))}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader className="px-4 py-3">Scoring scale</CardHeader>
            <form action={updateScale} className="flex flex-wrap items-end gap-3 px-4 py-4">
              <Field label="Lowest" htmlFor="scale_min">
                <Input
                  id="scale_min"
                  name="scale_min"
                  type="number"
                  min={0}
                  max={9}
                  defaultValue={settings.scale_min}
                  className="w-24"
                />
              </Field>
              <span className="pb-2.5 text-sm text-ink-400">to</span>
              <Field label="Highest" htmlFor="scale_max">
                <Input
                  id="scale_max"
                  name="scale_max"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={settings.scale_max}
                  className="w-24"
                />
              </Field>
              <Button type="submit" variant="secondary">
                Save scale
              </Button>
              <p className="basis-full text-xs leading-relaxed text-ink-400">
                The tool-wide core scale (criteria with no scale override use this). Changing it
                affects future scoring only — past scores keep the scale they were given on.
              </p>
            </form>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">Modifier threshold</CardHeader>
            <form
              action={updateModifierThreshold}
              className="flex flex-wrap items-end gap-3 px-4 py-4"
            >
              <Field label="Minimum core score" htmlFor="modifier_min_core_score">
                <Input
                  id="modifier_min_core_score"
                  name="modifier_min_core_score"
                  type="number"
                  step="0.1"
                  min={0}
                  defaultValue={settings.modifier_min_core_score}
                  className="w-28"
                />
              </Field>
              <Button type="submit" variant="secondary">
                Save threshold
              </Button>
              <p className="basis-full text-xs leading-relaxed text-ink-400">
                A pitch&apos;s core score must reach this before any institutional modifier is added
                to its adjusted priority score — so the modifier can never rescue a pitch that is
                editorially weak on its own.
              </p>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProfileRubric({
  profile,
  criteria,
  view,
}: {
  profile: RubricProfileRow;
  criteria: CriterionRow[];
  view: CriterionView;
}) {
  const core = criteria.filter((c) => c.criterion_type === "core");
  const modifiers = criteria.filter((c) => c.criterion_type === "modifier");
  const activeCoreWeight = core.reduce((sum, c) => sum + c.weight, 0);

  if (view === "retired" && criteria.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-900">
          {profile.name}
          {profile.is_default && (
            <span className="ml-2 align-middle">
              <Badge variant="accent">Default</Badge>
            </span>
          )}
          {!profile.active && (
            <span className="ml-2 align-middle">
              <Badge variant="muted">Retired</Badge>
            </span>
          )}
        </h2>
        {view === "active" && (
          <span
            className={
              activeCoreWeight === 100
                ? "text-xs text-ink-400"
                : "text-xs font-semibold text-danger"
            }
          >
            Active core weights sum to {activeCoreWeight}
            {activeCoreWeight !== 100 && " (expected 100)"}
          </span>
        )}
      </div>
      {profile.description && (
        <p className="mb-2.5 text-xs leading-relaxed text-ink-400">{profile.description}</p>
      )}

      <CriterionTable criteria={core} view={view} emptyMessage="No core criteria here yet." />

      {(modifiers.length > 0 || view === "active") && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
            Modifiers — scored separately, never part of the core average
          </div>
          <CriterionTable criteria={modifiers} view={view} emptyMessage="No modifiers here yet." />
        </div>
      )}
    </div>
  );
}

function CriterionTable({
  criteria,
  view,
  emptyMessage,
}: {
  criteria: CriterionRow[];
  view: CriterionView;
  emptyMessage: string;
}) {
  if (criteria.length === 0) {
    return <p className="text-sm text-ink-500">{emptyMessage}</p>;
  }
  return (
    <TableFrame>
      <Table stack className="md:min-w-[640px]">
        <thead>
          <HeaderRow>
            <Th>Criterion</Th>
            <Th>Weight</Th>
            <Th>Scale</Th>
            {view === "active" && <Th>Order</Th>}
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </HeaderRow>
        </thead>
        <tbody>
          {criteria.map((criterion, index) => (
            <Row key={criterion.id} className={criterion.active ? undefined : "bg-panel-50/40"}>
              <Cell stack="title">
                <div className="font-semibold text-ink-900">{criterion.name}</div>
                <div className="mt-0.5 text-xs leading-snug text-ink-500">
                  {criterion.description}
                </div>
                {criterion.guidance && (
                  <div className="mt-1 text-xs leading-snug text-ink-400">{criterion.guidance}</div>
                )}
                {criterion.anchors && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[11px] font-semibold text-brand-link">
                      Anchors
                    </summary>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {Object.entries(criterion.anchors)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([value, text]) => (
                          <li key={value} className="text-[11px] leading-snug text-ink-400">
                            <span className="font-semibold text-ink-500">{value}</span> — {text}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </Cell>
              <Cell label="Weight" className="tabular-nums text-ink-500">
                {criterion.criterion_type === "modifier" ? "—" : `×${criterion.weight}`}
              </Cell>
              <Cell label="Scale" className="whitespace-nowrap tabular-nums text-ink-500">
                {criterion.scale_min ?? "tool"}–{criterion.scale_max ?? "tool"}
              </Cell>
              {view === "active" && (
                <Cell stack="full">
                  <ReorderButtons
                    action={moveCriterion}
                    idName="criterion_id"
                    id={criterion.id}
                    label={criterion.name}
                    isFirst={index === 0}
                    isLast={index === criteria.length - 1}
                  />
                </Cell>
              )}
              <Cell stack="full">
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <TextLink
                    href={`/editorial/settings/rubric/${criterion.id}/edit`}
                    className="px-0 text-xs font-semibold"
                  >
                    Edit
                  </TextLink>
                  <form action={toggleCriterionActive}>
                    <input type="hidden" name="criterion_id" value={criterion.id} />
                    <input
                      type="hidden"
                      name="next_active"
                      value={(!criterion.active).toString()}
                    />
                    <Button type="submit" variant="link">
                      {criterion.active ? "Retire" : "Restore"}
                    </Button>
                  </form>
                </div>
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}
