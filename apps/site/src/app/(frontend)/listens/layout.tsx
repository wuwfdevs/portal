import React from 'react'

/**
 * Every page under here shows what a reader typed or holds (answers, recordings, an email address, membership details), so its text is
 * masked in analytics replays (`data-ph-mask`, `lib/analytics/posthog.ts`). `contents`: the wrapper adds no box, so the pages lay out as before.
 */
export default function MaskedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="contents" data-ph-mask="">
      {children}
    </div>
  )
}
