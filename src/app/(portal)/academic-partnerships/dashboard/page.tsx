import { Card } from "@/components/ui/card";
import { listAllSubmissions } from "@/lib/academic-partnerships/queries";
import {
  computeDepartmentCounts,
  computeDispositionCounts,
  computeStageCounts,
  computeTotals,
  computeTrackCounts,
} from "@/lib/academic-partnerships/dashboard";
import { DISPOSITION_LABEL, STAGE_LABEL } from "@/lib/academic-partnerships/pipeline";
import { PARTNERSHIP_TYPE_LABEL } from "@/lib/academic-partnerships/partnership-types";
import { BarList } from "./bar-list";

export default async function AcademicPartnershipsDashboardPage() {
  const submissions = await listAllSubmissions({});

  const totals = computeTotals(submissions);
  const stageCounts = computeStageCounts(submissions);
  const dispositionCounts = computeDispositionCounts(submissions);
  const trackCounts = computeTrackCounts(submissions);
  const departmentCounts = computeDepartmentCounts(submissions);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total inquiries" value={totals.total} />
        <StatTile label="Active in pipeline" value={totals.active} />
        <StatTile label="Completed" value={totals.completed} />
        <StatTile
          label="Estimated students reached"
          value={totals.totalStudentsReached.toLocaleString("en-US")}
          hint={`${totals.activeStudentsReached.toLocaleString("en-US")} from active submissions`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">
            Active pipeline by stage
          </h2>
          <BarList
            rows={stageCounts.map((row) => ({ label: STAGE_LABEL[row.stage], count: row.count }))}
            emptyLabel="Nothing in the pipeline yet."
          />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">
            Closed dispositions
          </h2>
          <BarList
            rows={dispositionCounts.map((row) => ({
              label: DISPOSITION_LABEL[row.disposition],
              count: row.count,
            }))}
            emptyLabel="Nothing has closed out yet."
          />
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
            By collaboration track
          </h2>
          <p className="mb-3 text-xs text-ink-400">
            Counts instances, not submissions — one inquiry naming two tracks counts toward both.
          </p>
          <BarList
            rows={trackCounts.map((row) => ({ label: PARTNERSHIP_TYPE_LABEL[row.type], count: row.count }))}
            emptyLabel="No submissions yet."
          />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">
            By department
          </h2>
          <BarList
            rows={departmentCounts.map((row) => ({ label: row.department, count: row.count }))}
            emptyLabel="No submissions yet."
          />
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </Card>
  );
}
