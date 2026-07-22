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
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const profile = await getCurrentProfile();

  if (profile?.account_status === "active") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-50 px-6 py-12">
      <div className="w-full max-w-[400px] rounded border border-line bg-white p-9">
        <Image src="/wuwf-logo.png" alt="WUWF 88.1" height={34} width={80} className="mb-7 h-[34px] w-auto" />

        {profile?.account_status === "pending" ? (
          <PendingPanel />
        ) : profile?.account_status === "invited" ? (
          <InvitedPanel />
        ) : profile?.account_status === "disabled" ? (
          <DisabledPanel />
        ) : (
          <>
            <h1 className="mb-2 font-serif text-2xl font-bold text-ink-900">Sign in to WUWF Tools</h1>
            <p className="mb-6 text-sm leading-relaxed text-ink-500">
              Access is limited to approved WUWF staff, students, faculty collaborators, and
              university partners. Having a WUWF or UWF email address does not by itself grant
              access.
            </p>
            {error === "link_expired" && (
              <div className="mb-4 rounded border border-line bg-white p-3">
                <p className="text-sm font-bold text-danger">Sign-in error</p>
                <p className="text-sm text-ink-500">
                  That link has expired. Sign-in links are valid for 15 minutes — request a new one.
                </p>
              </div>
            )}
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
