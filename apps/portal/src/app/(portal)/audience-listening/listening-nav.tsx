import { SubNav } from "@/components/ui/sub-nav";
import { getInboxWorkCounts } from "@/lib/audience-listening/inbox-queries";
import { countEventsPendingReview } from "@/lib/audience-listening/event-queries";

export type ListeningSection = "queries" | "events" | "inbox" | "host-requests" | "wording" | "jobs";

/**
 * The pages of Audience Listening: the queries and the events convened around them, questions and ideas, host requests, and the wording every recording is built on. The counts are
 * what waits for a person (new questions and ideas, new host requests, and public events waiting for a coordinator's decision); a
 * host request nobody has picked up within five days is the one the website promised an answer to.
 */
export async function ListeningNav({ current }: { current: ListeningSection }) {
  const [counts, pendingEvents] = await Promise.all([getInboxWorkCounts(), countEventsPendingReview()]);
  return (
    <SubNav
      label="Audience Listening sections"
      items={[
        { href: "/audience-listening", label: "Queries", active: current === "queries" },
        { href: "/audience-listening/events", label: "Events", active: current === "events", count: pendingEvents ?? undefined },
        { href: "/audience-listening/inbox", label: "Questions and ideas", active: current === "inbox", count: counts?.inboxNew },
        { href: "/audience-listening/host-requests", label: "Host requests", active: current === "host-requests", count: counts?.hostNew },
        { href: "/audience-listening/consent", label: "Wording", active: current === "wording" },
        { href: "/audience-listening/jobs", label: "Scheduled work", active: current === "jobs" },
      ]}
    />
  );
}
