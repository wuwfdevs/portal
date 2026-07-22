"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestSignInLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(requestSignInLink, initialState);

  if (state.status === "sent") {
    return (
      <div className="rounded border border-success-border bg-success-bg p-4">
        <p className="text-sm text-ink-700">
          Check your email — we sent a sign-in link to <strong>{state.email}</strong>. It&apos;s
          valid for 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <Label htmlFor="email">Work or university email</Label>
      <Input id="email" name="email" type="email" placeholder="you@wuwf.org" required autoFocus />
      {state.status === "error" && <p className="mt-1.5 text-xs text-danger">{state.message}</p>}
      <Button type="submit" disabled={isPending} className="mt-4 w-full">
        {isPending ? "Sending…" : "Send sign-in link"}
      </Button>
      <p className="mt-3.5 text-xs text-ink-400">We&apos;ll email a one-time link. No password to remember.</p>
    </form>
  );
}
