import type { ReactNode } from "react";
import { PublicPolicyNotice } from "@/components/ui/public-policy-notice";

/**
 * A guest should not be able to tell this is part of a larger internal tools
 * site (design doc §4) — no portal nav, no reference to "WUWF Tools Portal,"
 * just the interview. Every screen in this route (bootstrap, error,
 * preflight, waiting room, admitted) shares this shell. The policy notice at
 * the bottom is the one deliberate exception to "no reference to anything
 * beyond the interview" — UWF Policy IT-04 §IV.I.1 requires it on any page
 * collecting information from someone outside the portal's authenticated
 * users, which a guest joining a session is.
 */
export function GuestShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-50 px-4 py-10">
      <div className="w-full max-w-md rounded border border-line bg-white p-6 sm:p-8">
        {children}
        <PublicPolicyNotice />
      </div>
    </div>
  );
}
