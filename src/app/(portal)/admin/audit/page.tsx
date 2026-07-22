import { createClient } from "@/lib/supabase/server";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminAuditPage() {
  const supabase = await createClient();
  const [{ data: events }, { data: actors }] = await Promise.all([
    supabase
      .from("audit_events")
      .select("id, action, target_type, target_id, metadata, created_at, actor_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const actorNameById = new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]));

  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
            <th className="px-4 py-2.5">When</th>
            <th className="px-4 py-2.5">Actor</th>
            <th className="px-4 py-2.5">Action</th>
            <th className="px-4 py-2.5">Target</th>
          </tr>
        </thead>
        <tbody>
          {(!events || events.length === 0) && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-ink-400">
                No privileged actions have been recorded yet.
              </td>
            </tr>
          )}
          {events?.map((event) => (
            <tr key={event.id} className="border-b border-line last:border-b-0">
              <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatTimestamp(event.created_at)}</td>
              <td className="px-4 py-3 text-ink-900">
                {(event.actor_id && actorNameById.get(event.actor_id)) ?? "System"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-ink-700">{event.action}</td>
              <td className="px-4 py-3 text-ink-500">
                {event.target_type}
                {event.target_id ? ` · ${event.target_id.slice(0, 8)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
