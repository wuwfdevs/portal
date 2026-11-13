"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { issueOrganizerLink, type OrganizerLinkState } from "../../event-actions";

const INITIAL: OrganizerLinkState = { ok: false };

/**
 * The organizer's link. The person running the event opens it signed in to the website, and their account becomes the event's
 * organizer (the console at the website). It is shown here once: the database keeps a hash. Making another replaces it, and claiming
 * it replaces whoever organized the event before.
 */
export function OrganizerLink({ eventId, hasOrganizer, canIssue }: { eventId: string; hasOrganizer: boolean; canIssue: boolean }) {
  const [state, formAction, pending] = useActionState(issueOrganizerLink, INITIAL);
  const { copy, status } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-500">
        {hasOrganizer
          ? "An account on the website runs this event's room. Making a new link lets a different account take over."
          : "No account runs this event's room yet. Make a link and give it to the person running the event; they open it signed in to the website."}
      </p>
      {canIssue ? (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="event_id" value={eventId} />
          <div>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Making the link…" : hasOrganizer ? "Make a new organizer link" : "Make an organizer link"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-ink-400">Only a coordinator makes an organizer link.</p>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && state.url && (
        <div className="flex flex-col gap-2" role="status">
          <Alert variant="note">This link is shown once. Copy it now; opening it signed in makes that account the organizer, and anyone with it can.</Alert>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={state.url} aria-label="Organizer link" className="min-w-0 flex-1" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="secondary" onClick={() => void copy(state.url ?? "")}>
              {status === "copied" ? "Copied" : status === "failed" ? "Select and copy it" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
