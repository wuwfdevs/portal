/**
 * Required on every public-facing page that collects information from
 * someone outside the portal's authenticated user base (UWF Policy IT-04,
 * Information Security and Privacy, §IV.I.1: "University websites collecting
 * protected or private information require a link to this policy"). Used by
 * Audience Listening's public participation page, Academic Partnerships'
 * inquiry form, and Remote Interview's guest join screen — see each route's
 * *-shell.tsx for why those pages otherwise deliberately show no portal
 * branding; this notice is scoped to the policy requirement, not the portal.
 *
 * Links to a locally hosted copy (public/policies/) rather than UWF's
 * Confluence, which sits behind a UWF login — a member of the public filling
 * out one of these forms couldn't actually read the policy through that
 * link. This copy is IT-04.03-05/25, approved 05/01/2025 (last reviewed
 * May 2025 per the policy's own History line). IT-04 is revised
 * periodically; if UWF publishes a public (non-Confluence) URL for it, or a
 * newer version is executed, swap this file/link rather than let it drift.
 */
export function PublicPolicyNotice() {
  return (
    <p className="mt-6 text-center text-xs leading-relaxed text-ink-400">
      This page is provided by the University of West Florida under its{" "}
      <a
        href="/policies/it-04-information-security-and-privacy.pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-ink-500"
      >
        Information Security and Privacy Policy (IT-04)
      </a>
      .
    </p>
  );
}
