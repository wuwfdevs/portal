"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { GuestShell } from "./guest-shell";
import { bindGuestJoin } from "./actions";

/**
 * Runs once on first load of a link: gets (or creates) an anonymous session
 * and binds it to this token's participant row (design doc, "Guest
 * identity"). Binding has to happen in a Server Action rather than during
 * the page's Server Component render — signInAnonymously() needs to persist
 * a session cookie, which a Server Component can't write mid-render (see
 * lib/supabase/server.ts's comment on why its cookie adapter no-ops there).
 * router.refresh() after a successful bind re-renders the page with that
 * cookie now present, so it can find the now-bound participant row.
 */
export function GuestBootstrap({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bindGuestJoin(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <GuestShell>
      {error ? (
        <Alert>{error}</Alert>
      ) : (
        <p className="text-sm text-ink-500">Joining…</p>
      )}
    </GuestShell>
  );
}
