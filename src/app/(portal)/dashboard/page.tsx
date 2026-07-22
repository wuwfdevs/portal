import { requireActiveProfile } from "@/lib/auth/authz";
import { listToolsForCurrentUser } from "@/lib/tools";
import { ToolCard } from "@/components/tool-card";

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
      <h1 className="mb-1.5 font-serif text-[28px] font-bold text-ink-900">
        {greetingFor(new Date())}, {firstName}
      </h1>
      <p className="mb-8 text-[15px] text-ink-500">
        Your tools are listed below. Reach out to an administrator if you need access to something
        else.
      </p>

      {tools.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No tools are available yet. Check back soon, or contact an administrator.
        </div>
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
