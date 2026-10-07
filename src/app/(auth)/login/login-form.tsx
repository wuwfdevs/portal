"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { requestSignInLink, type LoginState } from "./actions";
import { Alert } from "@/components/ui/alert";
import { SecondaryLink } from "@/components/ui/primary-link";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(requestSignInLink, initialState);

  if (state.status === "sent") {
    return (
      <Alert variant="success" className="p-4 text-sm">
        <p>
          Check your email — we sent a sign-in link to <strong>{state.email}</strong>. It&apos;s
          valid for 15 minutes.
        </p>
      </Alert>
    );
  }

  if (state.status === "no_account") {
    return (
      <Alert variant="note" className="p-4 text-sm">
        <p className="text-ink-700">
          We couldn&apos;t find an account for <strong>{state.email}</strong>. If you&apos;re new
          here, request access instead — an administrator will review it.
        </p>
        <SecondaryLink
          href={`/request-access?email=${encodeURIComponent(state.email)}`}
          className="mt-3"
        >
          Request access
        </SecondaryLink>
      </Alert>
    );
  }

  return (
    <form action={formAction}>
      <Label htmlFor="email">Work or university email</Label>
      <Input id="email" name="email" type="email" placeholder="you@wuwf.org" required autoFocus />
      {state.status === "error" && <FieldError>{state.message}</FieldError>}
      <Button type="submit" disabled={isPending} className="mt-4 w-full">
        {isPending ? "Sending…" : "Send sign-in link"}
      </Button>
      <p className="mt-3.5 text-xs text-ink-400">
        We&apos;ll email a one-time link. No password to remember.
      </p>
    </form>
  );
}
