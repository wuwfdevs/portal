"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { submitAccessRequest, type RequestAccessState } from "./actions";

const initialState: RequestAccessState = { status: "idle" };

export function RequestAccessForm({ initialEmail }: { initialEmail?: string }) {
  const [state, formAction, isPending] = useActionState(submitAccessRequest, initialState);

  if (state.status === "submitted") {
    return (
      <div className="rounded border border-success-border bg-success-bg p-4">
        <p className="text-sm text-ink-700">
          Thanks — your request has been sent to a WUWF Tools administrator. You&apos;ll get an
          email once it&apos;s reviewed.
        </p>
        <Link href="/login" className="mt-3 inline-block text-sm font-semibold text-brand-link">
          Back to sign in
        </Link>
      </div>
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
        <textarea
          id="note"
          name="note"
          rows={3}
          placeholder="e.g. Newsroom intern — need Editorial Planning access"
          className="w-full rounded border border-line px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface sm:text-sm"
        />
      </div>
      {state.status === "error" && <p className="text-xs text-danger">{state.message}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
