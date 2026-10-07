import { requireActiveProfile } from "@/lib/auth/authz";
import { listToolsForCurrentUser } from "@/lib/tools";
import { ToolCard } from "@/components/tool-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const profile = await requireActiveProfile();
  const tools = await listToolsForCurrentUser(profile.id);
  const firstName = profile.display_name.split(" ")[0];

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title={`${greetingFor(new Date())}, ${firstName}`}
        description="Your tools are listed below. Reach out to an administrator if you need access to something else."
      />

      {tools.length === 0 ? (
        <EmptyState>
          No tools are available yet. Check back soon, or contact an administrator.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {tools.map((entry) => (
            <ToolCard key={entry.tool.id} {...entry} />
          ))}
        </div>
      )}
    </div>
  );
}
