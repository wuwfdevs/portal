'use client'

import React from 'react'

import { productAnalyticsConfigured } from '@/lib/analytics/dispatch'

import { openPrivacySettings } from './index'

/** "Privacy settings" in the footer's legal row (its own list item): opens the consent dialog. Coded, not a footer link, so an editor cannot drop it. Nothing without PostHog. */
export function PrivacySettingsButton({ className }: { className?: string }) {
  if (!productAnalyticsConfigured()) return null
  return (
    <li>
      <button className={className} onClick={openPrivacySettings} type="button">
        Privacy settings
      </button>
    </li>
  )
}
