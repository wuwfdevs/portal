"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { emailFacilitatorLink, type AfterLinkState } from "../../../../conversation-actions";

const INITIAL: AfterLinkState = { ok: false };

/**
 * Emails this table's facilitator the link to the after-page. Nothing sends on its own; staff press this once the transcript is ready.
 * If the email does not go, the link comes back here so it can be handed over another way. A new link replaces the last.
 */
export function FacilitatorLink({ eventId, tableId, disabled, sendLabel }: { eventId: string; tableId: string; disabled: boolean; sendLabel: string }) {
  const [state, formAction, pending] = useActionState(emailFacilitatorLink, INITIAL);
  const { copy, status } = useCopyToClipboard();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="table_id" value={tableId} />
      <div>
        <Button type="submit" variant="secondary" disabled={disabled || pending}>
          {pending ? "Sending…" : sendLabel}
        </Button>
      </div>
      {state.ok && state.message && <Alert variant="success">{state.message}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      {state.url && (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <Input readOnly value={state.url} aria-label="Facilitator link" className="min-w-0 flex-1" onFocus={(event) => event.currentTarget.select()} />
          <Button type="button" variant="secondary" onClick={() => void copy(state.url ?? "")}>
            {status === "copied" ? "Copied" : status === "failed" ? "Select and copy it" : "Copy"}
          </Button>
        </div>
      )}
    </form>
  );
}
