import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { TOOL_STATUS } from "@/lib/admin-status";
import { toggleToolEnabled } from "./actions";
import type { ToolDefaultAccess } from "@/lib/database.types";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";

const DEFAULT_ACCESS_LABEL: Record<ToolDefaultAccess, string> = {
  invite_only: "Invite only",
  approved_staff: "Open to approved staff",
  open: "Open",
};

export default async function AdminToolsPage() {
  const supabase = await createClient();
  const { data: tools } = await supabase.from("tools").select("*").order("sort_order");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-ink-500">
          Rows come from migrations. A <span className="font-semibold">proposed</span> tool is the
          exception: an idea created here so requests on the Roadmap have something to point at.
          Proposed tools stay off the dashboard and cannot be granted to anyone.
        </p>
        <PrimaryLink href="/admin/tools/new" className="shrink-0">
          New proposed tool
        </PrimaryLink>
      </div>
      <TableFrame>
        <Table stack className="md:min-w-[860px]">
          <thead>
            <HeaderRow>
              <Th>Tool</Th>
              <Th>Description</Th>
              <Th>Route</Th>
              <Th>Status</Th>
              <Th>Enabled</Th>
              <Th>Default access</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </HeaderRow>
          </thead>
          <tbody>
            {(tools ?? []).map((tool) => (
              <Row key={tool.id}>
                <Cell stack="title" className="font-semibold text-ink-900">
                  {tool.name}
                </Cell>
                <Cell label="About" className="text-ink-500">
                  {tool.description}
                </Cell>
                <Cell label="Route" className="font-mono text-xs text-ink-500">
                  {tool.route}
                </Cell>
                <Cell stack="aside">
                  <StatusBadge map={TOOL_STATUS} value={tool.status} />
                </Cell>
                <Cell label="Enabled">
                  <form action={toggleToolEnabled}>
                    <input type="hidden" name="tool_id" value={tool.id} />
                    <input type="hidden" name="next_enabled" value={(!tool.enabled).toString()} />
                    <button
                      type="submit"
                      aria-label={tool.enabled ? "Disable tool" : "Enable tool"}
                      className={`relative h-[18px] w-[34px] rounded-full transition-colors ${
                        tool.enabled ? "bg-brand-primary" : "bg-panel-100"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                          tool.enabled ? "right-0.5" : "left-0.5 border border-line"
                        }`}
                      />
                    </button>
                  </form>
                </Cell>
                <Cell label="Access" className="text-ink-500">
                  {DEFAULT_ACCESS_LABEL[tool.default_access]}
                </Cell>
                <Cell stack="full">
                  <TextLink
                    href={`/admin/tools/${tool.id}/edit`}
                    className="px-0 text-xs font-semibold"
                  >
                    Edit
                  </TextLink>
                </Cell>
              </Row>
            ))}
          </tbody>
        </Table>
      </TableFrame>
    </div>
  );
}
