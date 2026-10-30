import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile } from "@/components/ui/stat-tile";
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
          <SectionHeading level="eyebrow" className="mb-3">
            Active pipeline by stage
          </SectionHeading>
          <BarList
            rows={stageCounts.map((row) => ({ label: STAGE_LABEL[row.stage], count: row.count }))}
            emptyLabel="Nothing in the pipeline yet."
          />
        </Card>

        <Card className="p-4">
          <SectionHeading level="eyebrow" className="mb-3">
            Closed dispositions
          </SectionHeading>
          <BarList
            rows={dispositionCounts.map((row) => ({
              label: DISPOSITION_LABEL[row.disposition],
              count: row.count,
            }))}
            emptyLabel="Nothing has closed out yet."
          />
        </Card>

        <Card className="p-4">
          <SectionHeading level="eyebrow" className="mb-1">
            By collaboration track
          </SectionHeading>
          <p className="mb-3 text-xs text-ink-400">
            Counts instances, not submissions — one inquiry naming two tracks counts toward both.
          </p>
          <BarList
            rows={trackCounts.map((row) => ({
              label: PARTNERSHIP_TYPE_LABEL[row.type],
              count: row.count,
            }))}
            emptyLabel="No submissions yet."
          />
        </Card>

        <Card className="p-4">
          <SectionHeading level="eyebrow" className="mb-3">
            By department
          </SectionHeading>
          <BarList
            rows={departmentCounts.map((row) => ({ label: row.department, count: row.count }))}
            emptyLabel="No submissions yet."
          />
        </Card>
      </div>
    </div>
  );
}
