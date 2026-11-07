import React from 'react'

/**
 * The notice every public page that collects information carries (CLAUDE.md → Privacy): UWF Policy IT-04, Information Security
 * and Privacy, §IV.I.1, requires a link to the policy. The wording and the locally hosted copy (IT-04.03-05/25, approved
 * 05/01/2025) are the Portal's, so a reader sees the same line in both; the policy itself sits behind a UWF login on UWF's own
 * site. If UWF publishes a public address or a newer version, replace the file.
 */
export function PolicyNotice() {
  return (
    <p className="text-sm text-ink-3">
      This page is provided by the University of West Florida under its{' '}
      <a className="font-semibold text-wuwf-blue-700 underline" href="/policies/it-04-information-security-and-privacy.pdf" rel="noopener noreferrer" target="_blank">
        Information Security and Privacy Policy (IT-04)
      </a>
      .
    </p>
  )
}
