"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/client";
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
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("ri_participants")
        .select("admitted_at, revoked_at")
        .eq("id", participantId)
        .maybeSingle();

      if (cancelled) return;
      if (data?.admitted_at || data?.revoked_at) {
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [participantId, router]);

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
