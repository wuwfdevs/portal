import { SubNav } from "@/components/ui/sub-nav";
import { getInboxWorkCounts } from "@/lib/audience-listening/inbox-queries";

export type ListeningSection = "queries" | "inbox" | "host-requests";

/**
 * The pages of Audience Listening: the queries, questions and ideas, and host requests. The counts are what waits for a person (new
 * questions and ideas, and new host requests, counting overdue ones in the host requests badge); a host request nobody has
 * picked up within five days is the one the website promised an answer to.
 */
export async function ListeningNav({ current }: { current: ListeningSection }) {
  const counts = await getInboxWorkCounts();
  return (
    <SubNav
      label="Audience Listening sections"
      items={[
        { href: "/audience-listening", label: "Queries", active: current === "queries" },
        { href: "/audience-listening/inbox", label: "Questions and ideas", active: current === "inbox", count: counts?.inboxNew },
        { href: "/audience-listening/host-requests", label: "Host requests", active: current === "host-requests", count: counts?.hostNew },
      ]}
    />
  );
}
