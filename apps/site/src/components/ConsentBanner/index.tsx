'use client'

import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/Kit'
import { Checkbox } from '@/components/ui/checkbox'
import { DEFAULT_CONSENT, effectiveConsent } from '@/lib/analytics/consent'
import { privacySignals, readConsent, subscribeConsent, writeConsent } from '@/lib/analytics/consent-store'
import { posthog, productAnalyticsConfigured } from '@/lib/analytics/dispatch'
import {
  ALWAYS_ON_DESCRIPTION,
  ALWAYS_ON_LABEL,
  BANNER_LABEL,
  BANNER_TEXT,
  GPC_NOTE,
  MEASUREMENT_DESCRIPTION,
  MEASUREMENT_LABEL,
  SETTINGS_INTRO,
  SETTINGS_TITLE,
} from '@/lib/analytics/notice'
import { useModalDialog } from '@/utilities/useModalDialog'

/**
 * The analytics notice and the privacy settings (`ANALYTICS.md`, "Consent"). Not the Site banner global (`components/Banner`): that is the
 * station's one message to every reader, this is the site asking about measurement, and the two never share a mechanism.
 *
 * A bar at the foot of the window while no choice is recorded: what is measured, a link to the privacy page, and Accept, Decline and
 * Settings. It does not block the page and nothing waits on it: measurement is on until the visitor turns it off (owner, 2026-11-26), or off
 * from the start in a browser that sends Global Privacy Control. Settings, and "Privacy settings" at the foot of every page
 * (`PrivacySettingsButton`), open a dialog to change the choice at any time. It also starts PostHog (`posthog.start`), which follows the choice.
 *
 * With no PostHog configured for the deployment it draws nothing: there is nothing to ask about (the placement counts need no choice).
 */

const openers = new Set<() => void>()

/** Open the privacy settings, from anywhere on the page (the footer's link). */
export function openPrivacySettings(): void {
  for (const open of openers) open()
}

/** Whether a choice is recorded, as a snapshot React can compare (a string, not a fresh object each time). */
function useRecordedChoice(): string {
  return useSyncExternalStore(
    subscribeConsent,
    () => {
      const c = readConsent()
      return c ? `${c.measurement}` : 'none'
    },
    // On the server, and while hydrating: nothing is drawn until the browser has been asked.
    () => 'server',
  )
}

export function ConsentBanner({ privacyHref }: { privacyHref: string | null }) {
  const configured = productAnalyticsConfigured()
  const recorded = useRecordedChoice()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (configured) posthog.start()
  }, [configured])

  useEffect(() => {
    const show = () => setOpen(true)
    openers.add(show)
    return () => {
      openers.delete(show)
    }
  }, [])

  if (!configured || recorded === 'server') return null

  return (
    <>
      {recorded === 'none' && !open && (
        <section aria-label={BANNER_LABEL} className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-wuwf-blue-700 bg-wuwf-blue-100 text-ink shadow-3" data-consent-banner="">
          <div className="container flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-3xl text-base">
              {BANNER_TEXT}{' '}
              {privacyHref && (
                <a className="font-semibold text-ink underline underline-offset-2" href={privacyHref}>
                  How we measure visits
                </a>
              )}
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {/* Accept and Decline are the same style on purpose: a choice about being measured must not lean one way. */}
              <Button onClick={() => writeConsent({ ...DEFAULT_CONSENT, measurement: true })} variant="outline">
                Accept
              </Button>
              <Button onClick={() => writeConsent({ ...DEFAULT_CONSENT, measurement: false })} variant="outline">
                Decline
              </Button>
              <Button onClick={() => setOpen(true)} variant="link">
                Settings
              </Button>
            </div>
          </div>
        </section>
      )}
      {open && <PrivacySettingsDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function PrivacySettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const checkboxId = useId()
  const gpc = privacySignals().gpc
  const [measurement, setMeasurement] = useState(() => effectiveConsent(readConsent(), privacySignals()).measurement)
  // Return focus to whatever opened the dialog (the banner's Settings, the footer's link).
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement)

  const close = useCallback(() => {
    onClose()
    const el = opener.current
    if (el instanceof HTMLElement && el.isConnected) el.focus()
  }, [onClose])

  // A dialog that stays a dialog at every width: never closed by the window growing.
  useModalDialog({ open: true, onClose: close, container: dialog, initialFocus: heading, desktopQuery: 'not all' })

  const save = () => {
    writeConsent({ ...DEFAULT_CONSENT, measurement })
    close()
  }

  return (
    <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center md:items-center" ref={dialog} role="dialog">
      <div aria-hidden="true" className="absolute inset-0 bg-surface-dark/70" onClick={close} />
      <div className="relative flex max-h-[85dvh] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-t-xl bg-surface p-6 text-ink shadow-3 md:rounded-xl md:p-8">
        <h2 className="font-serif text-2xl font-bold outline-none" id={titleId} ref={heading} tabIndex={-1}>
          {SETTINGS_TITLE}
        </h2>
        <p className="text-base text-ink-2">{SETTINGS_INTRO}</p>
        {gpc && <p className="text-sm text-ink-3">{GPC_NOTE}</p>}
        <div className="flex gap-4 rounded-md border border-rule p-4">
          <Checkbox
            aria-describedby={`${checkboxId}-d`}
            checked={measurement}
            className="mt-1 size-6"
            id={checkboxId}
            onCheckedChange={(v) => setMeasurement(v === true)}
          />
          <div className="flex flex-col gap-1">
            <label className="min-h-6 text-base font-bold" htmlFor={checkboxId}>
              {MEASUREMENT_LABEL}
            </label>
            <p className="text-sm text-ink-3" id={`${checkboxId}-d`}>
              {MEASUREMENT_DESCRIPTION}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-4">
          <p className="text-base font-bold">{ALWAYS_ON_LABEL}</p>
          <p className="text-sm text-ink-3">{ALWAYS_ON_DESCRIPTION}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={save}>Save choices</Button>
          <Button onClick={close} variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

