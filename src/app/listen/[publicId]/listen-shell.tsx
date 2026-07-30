import type { ReactNode } from "react";

/**
 * The card every public screen sits in.
 *
 * A participant should not be able to tell this is part of a larger internal
 * tools site — the same call Remote Interview's GuestShell makes for guests,
 * and for the same reason. Two differences from that one: this shell shows a
 * WUWF wordmark when it stands alone (a page you arrive at from a link needs to
 * say whose it is), and suppresses it inside an embed, where the surrounding
 * article has already said so.
 *
 * `embedded` also drops the vertical centring and outer padding: inside an
 * iframe the frame is the viewport, and centring in it just wastes the height
 * the reporter budgeted. The card itself — radius, border, shadow, and the
 * progress strip — is identical in both cases, so a Grove embed reads as the
 * same polished piece of UI as the standalone link.
 *
 * `progressPct` is null to hide the strip entirely (the confirmation screen —
 * nothing left to show progress toward) and a 0–100 number otherwise.
 */
export function ListenShell({
  embedded,
  progressPct = null,
  children,
}: {
  embedded: boolean;
  progressPct?: number | null;
  children: ReactNode;
}) {
  const card = (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(15,20,25,0.06)]">
      {progressPct !== null && (
        <div className="h-[3px] bg-panel-100">
          <div
            className="h-full bg-brand-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
      <div className="px-6 py-8 sm:px-8 sm:py-9">{children}</div>
    </div>
  );

  if (embedded) {
    return (
      <div className="min-h-screen bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-xl">{card}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-panel-50 px-4 py-8 sm:items-center sm:py-14">
      <div className="w-full max-w-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-brand-surface text-xs font-bold text-brand-link">
            W
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
            WUWF Public Media
          </span>
        </div>
        {card}
      </div>
    </div>
  );
}
