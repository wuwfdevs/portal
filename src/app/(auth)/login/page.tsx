import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { LoginForm } from "./login-form";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "tools-support@wuwf.org";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  const profile = await getCurrentProfile();

  if (profile?.account_status === "active") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-50 px-6 py-12">
      <div className="w-full max-w-[400px] rounded border border-line bg-white p-9">
        <Image
          src="/wuwf-logo.png"
          alt="WUWF 88.1"
          height={34}
          width={80}
          className="mb-7 h-[34px] w-auto"
        />

        {profile?.account_status === "pending" ? (
          <PendingPanel />
        ) : profile?.account_status === "invited" ? (
          <InvitedPanel />
        ) : profile?.account_status === "disabled" ? (
          <DisabledPanel />
        ) : (
          <>
            <h1 className="mb-2 font-serif text-2xl font-bold text-ink-900">
              Sign in to WUWF Tools
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-ink-500">
              Access is limited to approved WUWF staff, students, faculty collaborators, and
              university partners. Having a WUWF or UWF email address does not by itself grant
              access.
            </p>
            {error === "sign_in_failed" && <SignInFailure reason={reason} />}
            <LoginForm />
            <div className="my-6 border-t border-line" />
            <p className="text-sm text-ink-500">
              Don&apos;t have access yet?{" "}
              <Link href="/request-access" className="font-semibold">
                Request access
              </Link>{" "}
              ·{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold">
                Get help signing in
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Why a sign-in link didn't go through.
 *
 * This used to say "that link has expired" for every failure, which sent
 * someone chasing a timeout while the real cause was a PKCE code_verifier
 * mismatch — a link requested on one hostname and opened on another. Only
 * claim expiry when the provider actually said so; otherwise describe what
 * happened and show the code, so a report names something searchable.
 */
function SignInFailure({ reason }: { reason?: string }) {
  const explanation = explainSignInFailure(reason);

  return (
    <div className="mb-4 rounded border border-danger/30 bg-danger/[0.04] p-3">
      <p className="text-sm font-bold text-danger">We couldn&apos;t complete your sign-in</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-700">{explanation}</p>
      <p className="mt-2 text-sm text-ink-500">Request a new link below to try again.</p>
      {reason && <p className="mt-2 font-mono text-[11px] text-ink-400">Reference: {reason}</p>}
    </div>
  );
}

function explainSignInFailure(reason?: string): string {
  switch (reason) {
    case "otp_expired":
    case "token_expired":
      return "That link has expired. Sign-in links are valid for 15 minutes.";
    case "bad_code_verifier":
      return "That link was opened on a different address, or in a different browser, from the one that requested it. Request a link from the address you want to sign in on, and open it in the same browser.";
    case "no_code":
      return "That link arrived without its sign-in code. Some email clients rewrite links — try copying the address into your browser instead.";
    case "flow_state_not_found":
      return "That link has already been used, or a newer one replaced it. Only the most recent link works.";
    default:
      return "The link couldn't be verified. This usually means it was already used, or a newer link replaced it.";
  }
}

function PendingPanel() {
  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl font-bold text-ink-900">Access pending approval</h1>
      <p className="mb-6 text-sm leading-relaxed text-ink-500">
        Your request was received. An administrator will review it — you&apos;ll get an email once
        it&apos;s approved.
      </p>
      <SignOutButton />
    </div>
  );
}

function InvitedPanel() {
  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl font-bold text-ink-900">Invitation pending</h1>
      <p className="mb-6 text-sm leading-relaxed text-ink-500">
        You&apos;ve been invited but haven&apos;t completed sign-in yet. Check your email for the
        invitation link.
      </p>
      <SignOutButton />
    </div>
  );
}

function DisabledPanel() {
  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl font-bold text-ink-900">Access disabled</h1>
      <p className="mb-6 text-sm leading-relaxed text-ink-500">
        This account no longer has access to WUWF Tools. Contact an administrator if you believe
        this is a mistake.
      </p>
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary">
        Sign out
      </Button>
    </form>
  );
}
