'use client'

import React, { useEffect } from 'react'

import { posthog } from '@/lib/analytics/dispatch'

/**
 * A signed-in reader's account page: ties this browser's visits to their account id (the Supabase user id), the basis `ANALYTICS.md` asks
 * for ("Anonymous stays anonymous": only on an explicit sign-in). Never an email, a member or a donor id. Draws nothing.
 */
export function ReaderIdentity({ userId }: { userId: string }) {
  useEffect(() => {
    posthog.identifyReader(userId)
  }, [userId])
  return null
}

/** The sign-out form: forgets who this browser was in analytics as it submits, then the server signs the reader out. */
export function SignOutForm({ action, children }: { action: () => Promise<void>; children: React.ReactNode }) {
  return (
    <form action={action} onSubmit={() => posthog.resetIdentity()}>
      {children}
    </form>
  )
}
