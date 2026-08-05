import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  listAllSubmissions,
  listSubmittedDepartments,
  listToolMembers,
  type SubmissionFilters,
} from "@/lib/academic-partnerships/queries";
import { DISPOSITION_BADGE, DISPOSITION_LABEL, DISPOSITIONS, STAGE_LABEL, STAGES } from "@/lib/academic-partnerships/pipeline";
import { PARTNERSHIP_TYPE_LABEL, PARTNERSHIP_TYPES } from "@/lib/academic-partnerships/partnership-types";
import type { ApDisposition, ApPartnershipType, ApStage } from "@/lib/database.types";

interface SearchParams {
  stage?: string;
  disposition?: string;
  owner?: string;
  department?: string;
  type?: string;
  q?: string;
}

export default async function AllSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const stage = STAGES.includes(params.stage as ApStage) ? (params.stage as ApStage) : undefined;
  const disposition =
    params.disposition === "any" || params.disposition === "none"
      ? params.disposition
      : DISPOSITIONS.includes(params.disposition as ApDisposition)
        ? (params.disposition as ApDisposition)
        : undefined;
  const partnershipType = PARTNERSHIP_TYPES.includes(params.type as ApPartnershipType)
    ? (params.type as ApPartnershipType)
    : undefined;

  const filters: SubmissionFilters = {
    stage,
    disposition,
    ownerId: params.owner || undefined,
    department: params.department || undefined,
    partnershipType,
    search: params.q || undefined,
  };

  const [submissions, departments, members] = await Promise.all([
    listAllSubmissions(filters),
    listSubmittedDepartments(),
    listToolMembers(),
  ]);

  const hasFilters = Boolean(
    params.stage || params.disposition || params.owner || params.department || params.type || params.q,
  );

  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <FilterField label="Search">
          <Input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Name, email, department, course…"
            className="w-56"
          />
        </FilterField>
        <FilterField label="Stage">
          <Select name="stage" defaultValue={params.stage ?? ""} className="w-auto min-w-[9rem]">
            <option value="">All</option>
            {STAGES.map((value) => (
              <option key={value} value={value}>
                {STAGE_LABEL[value]}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Disposition">
          <Select name="disposition" defaultValue={params.disposition ?? "any"} className="w-auto min-w-[9rem]">
            <option value="any">Any</option>
            <option value="none">Active (none)</option>
            {DISPOSITIONS.map((value) => (
              <option key={value} value={value}>
                {DISPOSITION_LABEL[value]}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Owner">
          <Select name="owner" defaultValue={params.owner ?? ""} className="w-auto min-w-[9rem]">
            <option value="">All</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Department">
          <Select name="department" defaultValue={params.department ?? ""} className="w-auto min-w-[9rem]">
            <option value="">All</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Type">
          <Select name="type" defaultValue={params.type ?? ""} className="w-auto min-w-[10rem]">
            <option value="">All</option>
            {PARTNERSHIP_TYPES.map((type) => (
              <option key={type} value={type}>
                {PARTNERSHIP_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </FilterField>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters && (
          <Link href="/academic-partnerships/all" className="pb-2.5 text-xs font-semibold text-brand-link">
            Clear
          </Link>
        )}
      </form>

      {submissions.length === 0 ? (
        <p className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No submissions match these filters.
        </p>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Faculty</Th>
                <Th>Department</Th>
                <Th>Type</Th>
                <Th>Stage</Th>
                <Th>Owner</Th>
                <Th>Submitted</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <Row key={submission.id}>
                  <Cell>
                    <Link
                      href={`/academic-partnerships/${submission.id}`}
                      className="font-semibold text-brand-link"
                    >
                      {submission.faculty_name}
                    </Link>
                  </Cell>
                  <Cell>{submission.department}</Cell>
                  <Cell>{PARTNERSHIP_TYPE_LABEL[submission.partnership_type]}</Cell>
                  <Cell>
                    {submission.disposition ? (
                      <Badge variant={DISPOSITION_BADGE[submission.disposition]}>
                        {DISPOSITION_LABEL[submission.disposition]}
                      </Badge>
                    ) : (
                      STAGE_LABEL[submission.stage]
                    )}
                  </Cell>
                  <Cell>{submission.ownerName ?? "Unassigned"}</Cell>
                  <Cell>{new Date(submission.created_at).toLocaleDateString("en-US")}</Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </label>
  );
}
