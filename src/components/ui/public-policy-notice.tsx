/**
 * Required on every public-facing page that collects information from
 * someone outside the portal's authenticated user base (UWF Policy IT-04,
 * Information Security and Privacy, §IV.I.1: "University websites collecting
 * protected or private information require a link to this policy"). Used by
 * Audience Listening's public participation page, Academic Partnerships'
 * inquiry form, and Remote Interview's guest join screen — see each route's
 * *-shell.tsx for why those pages otherwise deliberately show no portal
 * branding; this notice is scoped to the policy requirement, not the portal.
 */
export function PublicPolicyNotice() {
  return (
    <p className="mt-6 text-center text-xs leading-relaxed text-ink-400">
      This page is provided by the University of West Florida under its{" "}
      <a
        href="https://confluence.uwf.edu/download/attachments/340923307/IT-04%20Information%20Security%20and%20Privacy%20-%20executed.pdf?version=1&modificationDate=1746109492117&api=v2"
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
