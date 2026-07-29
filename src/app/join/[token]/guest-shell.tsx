import type { ReactNode } from "react";

/**
 * A guest should not be able to tell this is part of a larger internal tools
 * site (design doc §4) — no portal nav, no reference to "WUWF Tools Portal,"
 * just the interview. Every screen in this route (bootstrap, error,
 * preflight, waiting room, admitted) shares this shell.
 */
export function GuestShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-50 px-4 py-10">
      <div className="w-full max-w-md rounded border border-line bg-white p-6 sm:p-8">{children}</div>
    </div>
  );
}
