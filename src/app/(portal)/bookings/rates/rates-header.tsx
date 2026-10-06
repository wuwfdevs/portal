import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { Input, Label } from "@/components/ui/input";
import type { BookingsContext } from "@/lib/bookings/access";
import { VERSION_STATUS_LABEL } from "@/lib/bookings/labels";
import { RATES_PATH, ratesHref, type RatesSection } from "@/lib/bookings/paths";
import type { BkVersionRow } from "@/lib/bookings/queries";
import { adoptVersion, reopenVersion, submitVersion, useVersionForEstimates } from "./actions";
import { RatesTabs } from "./rates-tabs";

function statusVariant(version: BkVersionRow): "accent" | "neutral" | "success" | "muted" {
  if (version.status === "adopted") return "success";
  if (version.status === "superseded") return "muted";
  if (version.status === "submitted") return "accent";
  return "neutral";
}

/**
 * The top of every versioned Rates screen: a version switch (query-string
 * chips, no client state), the version's status and what it means for
 * estimates, the lifecycle actions the viewer's roles allow, then the
 * section tabs. The error from `?error=` renders here, above whatever
 * form raised it, since the lifecycle forms live on this header.
 */
export function RatesHeader({
  context,
  versions,
  version,
  section,
  error,
  gatePending,
}: {
  context: BookingsContext;
  versions: BkVersionRow[];
  version: BkVersionRow;
  section: RatesSection;
  error?: string;
  /** Inputs still awaiting validation on this version, for the Submit hint. */
  gatePending?: number;
}) {
  const provisional = version.status !== "adopted";
  const canSubmit = context.isFinance && version.status === "draft";
  const canReopen = context.isFinance && version.status === "submitted";
  const canUse = context.isFinance && !version.in_use && version.status !== "superseded";
  const canAdopt = context.isExecutive && version.status === "submitted";

  return (
    <div className="mb-2 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Rate model</h2>
        <FilterChips
          label="Version"
          chips={versions.map((candidate) => ({
            label: `${candidate.label}${candidate.in_use ? " · in use" : ""}`,
            href: ratesHref(section, candidate.id),
            active: candidate.id === version.id,
          }))}
        />
        <span className="flex-1" />
        {context.isFinance && (
          <Link
            href={`${RATES_PATH}/versions/new?from=${version.id}`}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            + New version
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-line bg-panel-50 px-4 py-3 text-sm text-ink-700">
        <Badge variant={statusVariant(version)}>{VERSION_STATUS_LABEL[version.status]}</Badge>
        {version.in_use && <Badge variant="accent">In use for estimates</Badge>}
        <span>
          {version.in_use && provisional
            ? "In use for estimates but not adopted: every figure is provisional until Finance validates each input and the Executive Director adopts."
            : version.status === "adopted"
              ? `Adopted${version.adopted_at ? ` on ${new Date(version.adopted_at).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}${version.destination_index ? ` · recoveries to ${version.destination_index}` : ""}.`
              : version.status === "superseded"
                ? "Superseded by a later version; kept so estimates priced on it still read the rates they were priced at."
                : version.status === "submitted"
                  ? "Submitted for validation; the Executive Director can adopt it."
                  : "A draft. Change assumptions, pools and packages here, then submit for validation."}
        </span>
        {version.notes && <span className="basis-full text-xs text-ink-500">{version.notes}</span>}
        <span className="flex basis-full flex-wrap items-center gap-2 pt-1">
          {canSubmit && (
            <form action={submitVersion}>
              <input type="hidden" name="version_id" value={version.id} />
              <Button type="submit" variant="secondary" disabled={(gatePending ?? 0) > 0}>
                Submit for validation
              </Button>
              {(gatePending ?? 0) > 0 && (
                <span className="ml-2 text-xs text-ink-500">
                  {gatePending} input{gatePending === 1 ? "" : "s"} still await validation
                </span>
              )}
            </form>
          )}
          {canReopen && (
            <form action={reopenVersion}>
              <input type="hidden" name="version_id" value={version.id} />
              <Button type="submit" variant="ghost">
                Reopen as a draft
              </Button>
            </form>
          )}
          {canUse && (
            <form action={useVersionForEstimates}>
              <input type="hidden" name="version_id" value={version.id} />
              <Button type="submit" variant="secondary">
                Use for estimates{provisional ? ", provisionally" : ""}
              </Button>
            </form>
          )}
          {canAdopt && (
            <details className="basis-full">
              <summary className="cursor-pointer text-sm font-bold text-brand-link">
                Adopt this version…
              </summary>
              <form action={adoptVersion} className="mt-3 flex max-w-xl flex-col gap-3">
                <input type="hidden" name="version_id" value={version.id} />
                <div>
                  <Label htmlFor="destination_index">Destination index for recoveries</Label>
                  <Input
                    id="destination_index"
                    name="destination_index"
                    placeholder="A UWF Budget / Controller decision, recorded here"
                    defaultValue={version.destination_index ?? ""}
                  />
                </div>
                <p className="text-xs text-ink-500">
                  Adopting puts this version in use for estimates and supersedes the adopted version
                  before it. An adopted version never changes; a correction is a new version.
                </p>
                <Button type="submit" className="self-start">
                  Adopt
                </Button>
              </form>
            </details>
          )}
        </span>
      </div>

      {error && <Alert>{error}</Alert>}
      <RatesTabs active={section} versionId={version.id} />
    </div>
  );
}

/** No version exists at all — only before the foundation migration's seed has run. */
export function NoVersions({
  context,
  section,
}: {
  context: BookingsContext;
  section: RatesSection;
}) {
  return (
    <div className="flex flex-col gap-4">
      <RatesTabs active={section} versionId={null} />
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No rate model version exists yet.
        {context.isFinance && (
          <>
            {" "}
            <Link
              href={`${RATES_PATH}/versions/new`}
              className="font-bold text-brand-link hover:underline"
            >
              Create the first one
            </Link>
            .
          </>
        )}
      </div>
    </div>
  );
}
