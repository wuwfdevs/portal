import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { toggleToolEnabled } from "./actions";
import type { ToolStatus, ToolDefaultAccess } from "@/lib/database.types";

const STATUS_BADGE: Record<ToolStatus, { label: string; variant: "accent" | "neutral" | "muted" }> =
  {
    available: { label: "Available", variant: "accent" },
    in_development: { label: "In development", variant: "neutral" },
    planned: { label: "Planned", variant: "muted" },
    proposed: { label: "Proposed", variant: "muted" },
  };

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
        <Link
          href="/admin/tools/new"
          className="shrink-0 rounded bg-brand-primary px-4 py-2 text-sm font-bold text-white hover:bg-[#2278B8]"
        >
          New proposed tool
        </Link>
      </div>
      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
              <th className="px-4 py-2.5">Tool</th>
              <th className="px-4 py-2.5">Description</th>
              <th className="px-4 py-2.5">Route</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Enabled</th>
              <th className="px-4 py-2.5">Default access</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(tools ?? []).map((tool) => {
              const badge = STATUS_BADGE[tool.status];
              return (
                <tr key={tool.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ink-900">{tool.name}</td>
                  <td className="px-4 py-3 text-ink-500">{tool.description}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{tool.route}</td>
                  <td className="px-4 py-3">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {DEFAULT_ACCESS_LABEL[tool.default_access]}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tools/${tool.id}/edit`}
                      className="text-xs font-semibold text-brand-link"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
