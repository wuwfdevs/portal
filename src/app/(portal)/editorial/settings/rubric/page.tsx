import Link from "next/link";
import { getSettings, listCriteria, listRubricProfiles } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import type { CriterionRow, RubricProfileRow } from "@/lib/editorial/data";
import {
  moveCriterion,
  toggleCriterionActive,
  updateModifierThreshold,
  updateScale,
} from "../actions";
import { CriterionForm } from "./criterion-form";

export default async function RubricSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [criteria, settings, profiles] = await Promise.all([
    listCriteria(),
    getSettings(),
    listRubricProfiles(),
  ]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Alert variant="note" className="mb-4">
          Weights express this newsroom&apos;s priorities and are worth revisiting periodically.
          Changing a criterion&apos;s <em>meaning</em> (not just fixing a typo) should be a retire +
          add, not an edit — past scores were given against the wording in force at the time, and
          editing in place would silently rewrite what they meant. The rubric is a structured aid to
          judgment, not an automatic commissioning system — editors always retain discretion.
        </Alert>

        {profiles.map((profile) => (
          <ProfileRubric
            key={profile.id}
            profile={profile}
            criteria={criteria.filter((c) => c.profile_id === profile.id)}
          />
        ))}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="rounded border border-line">
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
                The tool-wide core scale (criteria with no scale override use this). Changing it
                affects future scoring only — past scores keep the scale they were given on.
              </p>
            </form>
          </div>

          <div className="rounded border border-line">
            <div className="border-b border-line px-4 py-3 text-sm font-bold text-ink-900">
              Modifier threshold
            </div>
            <form
              action={updateModifierThreshold}
              className="flex flex-wrap items-end gap-3 px-4 py-4"
            >
              <div>
                <Label htmlFor="modifier_min_core_score">Minimum core score</Label>
                <Input
                  id="modifier_min_core_score"
                  name="modifier_min_core_score"
                  type="number"
                  step="0.1"
                  min={0}
                  defaultValue={settings.modifier_min_core_score}
                  className="w-28"
                />
              </div>
              <Button type="submit" variant="secondary">
                Save threshold
              </Button>
              <p className="basis-full text-xs leading-relaxed text-ink-400">
                A pitch&apos;s core score must reach this before any institutional modifier is added
                to its adjusted priority score — so the modifier can never rescue a pitch that is
                editorially weak on its own.
              </p>
            </form>
          </div>
        </div>
      </div>

      <div className="w-full shrink-0 lg:w-80">
        <CriterionForm profiles={profiles} error={error} />
      </div>
    </div>
  );
}

function ProfileRubric({
  profile,
  criteria,
}: {
  profile: RubricProfileRow;
  criteria: CriterionRow[];
}) {
  const core = criteria.filter((c) => c.criterion_type === "core");
  const modifiers = criteria.filter((c) => c.criterion_type === "modifier");
  const activeCoreWeight = core.filter((c) => c.active).reduce((sum, c) => sum + c.weight, 0);

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
        <span
          className={
            activeCoreWeight === 100 ? "text-xs text-ink-400" : "text-xs font-semibold text-danger"
          }
        >
          Active core weights sum to {activeCoreWeight}
          {activeCoreWeight !== 100 && " (expected 100)"}
        </span>
      </div>
      {profile.description && (
        <p className="mb-2.5 text-xs leading-relaxed text-ink-400">{profile.description}</p>
      )}

      <CriterionTable criteria={core} />

      {modifiers.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
            Modifiers — scored separately, never part of the core average
          </div>
          <CriterionTable criteria={modifiers} />
        </div>
      )}
    </div>
  );
}

function CriterionTable({ criteria }: { criteria: CriterionRow[] }) {
  if (criteria.length === 0) {
    return <p className="text-sm text-ink-500">Nothing here yet.</p>;
  }
  return (
    <TableFrame>
      <Table className="min-w-[640px]">
        <thead>
          <HeaderRow>
            <Th>Criterion</Th>
            <Th>Weight</Th>
            <Th>Scale</Th>
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
              <Cell className="tabular-nums text-ink-500">
                {criterion.criterion_type === "modifier" ? "—" : `×${criterion.weight}`}
              </Cell>
              <Cell className="whitespace-nowrap tabular-nums text-ink-500">
                {criterion.scale_min ?? "tool"}–{criterion.scale_max ?? "tool"}
              </Cell>
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
  );
}
