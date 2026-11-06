"use client";

import { useStation } from "@/components/station-provider";

/**
 * The notice under every public page that collects information from someone outside the portal's
 * signed-in users. What it says is the station's, set in its settings (public_notice_text, _link_label,
 * _link_url), and it renders nothing when the station has set none.
 *
 * WUWF's is the University of West Florida's requirement: UWF Policy IT-04, Information Security and
 * Privacy, §IV.I.1, says "University websites collecting protected or private information require a link
 * to this policy". It links to a locally hosted copy (public/policies/) rather than UWF's Confluence,
 * which sits behind a UWF login: a member of the public filling out one of these forms could not read the
 * policy through that link. That copy is IT-04.03-05/25, approved 05/01/2025. IT-04 is revised
 * periodically; if UWF publishes a public URL for it, or a newer version is executed, swap the file or
 * the link in the station's settings rather than let it drift.
 *
 * It is a client component only so the shared shells, some of which render inside an error boundary, can
 * read the station from context; see components/station-provider.tsx.
 */
export function PublicPolicyNotice() {
  const { notice } = useStation();
  if (!notice) return null;
  const link =
    notice.linkLabel && notice.linkUrl ? (
      <a
        href={notice.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-ink-500"
      >
        {notice.linkLabel}
      </a>
    ) : null;
  return (
    <p className="mt-6 text-center text-xs leading-relaxed text-ink-400">
      {notice.text}
      {notice.text && link ? " " : null}
      {link}
      {link ? "." : null}
    </p>
  );
}
