"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/input";
import { submitAccessRequest, type RequestAccessState } from "./actions";
import { TextLink } from "@/components/ui/primary-link";
import { Alert } from "@/components/ui/alert";

const initialState: RequestAccessState = { status: "idle" };

export function RequestAccessForm({ initialEmail }: { initialEmail?: string }) {
  const [state, formAction, isPending] = useActionState(submitAccessRequest, initialState);

  if (state.status === "submitted") {
    return (
      <Alert variant="success" className="p-4 text-sm">
        <p>
          Thanks — your request has been sent to a WUWF Tools administrator. You&apos;ll get an
          email once it&apos;s reviewed.
        </p>
        <TextLink href="/login" className="mt-3 inline-block">
          Back to sign in
        </TextLink>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="display_name">Full name</Label>
        <Input id="display_name" name="display_name" placeholder="Jordan Mays" required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={initialEmail}
          placeholder="you@wuwf.org"
          required
        />
      </div>
      <div>
        <Label htmlFor="note">What do you need access to? (optional)</Label>
        <Textarea
          id="note"
          name="note"
          rows={3}
          placeholder="e.g. Newsroom intern — need Editorial Planning access"
        />
      </div>
      {state.status === "error" && <FieldError>{state.message}</FieldError>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
