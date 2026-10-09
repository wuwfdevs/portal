"use client";

import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/client";
import { usePoller } from "@/lib/use-poller";
import { GuestShell } from "./guest-shell";

const POLL_INTERVAL_MS = 4000;

/**
 * Guests who finish preflight land here until the host admits them (design
 * doc §3C). There's no notification layer in this repo (CLAUDE.md) and no
 * call layer yet (that's slice 3, where a real-time signal will exist
 * anyway) — a short client-side poll is the honest, minimal way to notice
 * admission without either of those. RLS already lets a bound guest read
 * their own row, so this is a plain browser-client select, no new policy.
 */
export function WaitingRoom({
  participantId,
  displayName,
}: {
  participantId: string;
  displayName: string;
}) {
  // One read at a time, paused while the tab is hidden; the page is refreshed
  // only once the host has admitted (or removed) this guest.
  usePoller({
    intervalMs: POLL_INTERVAL_MS,
    task: async () => {
      const { data, error } = await createClient()
        .from("ri_participants")
        .select("admitted_at, revoked_at")
        .eq("id", participantId)
        .maybeSingle();
      if (error) {
        // A failed read is not an admission; keep polling and try again next tick.
        console.error("Could not check the waiting-room status:", error);
        return false;
      }
      return Boolean(data?.admitted_at || data?.revoked_at);
    },
  });

  return (
    <GuestShell>
      <PageHeader
        size="public"
        title="You're in the waiting room"
        description={`Thanks, ${displayName}. The host will let you in shortly — keep this tab open.`}
      />
    </GuestShell>
  );
}
