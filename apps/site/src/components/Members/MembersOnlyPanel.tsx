import Link from 'next/link'
import React from 'react'

/**
 * Shown in place of a members-only story's body and audio (board 23's "For WUWF members" panel), in the station's look.
 * A themed show passes its own class names. The page it sits on is cached and the same for everyone; a member follows the link to
 * the private member view, which checks their membership (phase 7c-2). The owner confirms the wording.
 */
export function MembersOnlyPanel({
  isEpisode,
  supportHref,
  showHref,
  showTitle,
  level,
  memberHref,
  classNames,
}: {
  isEpisode: boolean
  supportHref: string
  showHref?: string | null
  showTitle?: string | null
  /** The station's qualifying level in words ("a sustaining membership of $8 a month or more"), when set. */
  level?: string | null
  /** The private member view of this piece (/account/listen/<id>): it signs a reader in, or explains how to connect a membership. */
  memberHref?: string | null
  classNames?: { box?: string; eyebrow?: string; heading?: string; text?: string; primary?: string; secondary?: string }
}) {
  const what = isEpisode ? 'episode' : 'piece'
  return (
    <section
      aria-labelledby="members-only-heading"
      className={classNames?.box ?? 'flex flex-col gap-4 rounded-sm border border-rule bg-surface-2 p-6 md:p-8'}
    >
      <p className={classNames?.eyebrow ?? 'text-xs font-bold uppercase tracking-widest text-wuwf-blue-700'}>For WUWF members</p>
      <h2 className={classNames?.heading ?? 'font-serif text-2xl font-bold text-ink'} id="members-only-heading">
        This {what} is for WUWF sustaining members.
      </h2>
      <p className={classNames?.text ?? 'max-w-[40rem] text-base text-ink-2'}>
        {showTitle ? `${showTitle} is made by WUWF Public Media. ` : ''}
        Supporting the show is supporting the station: a sustaining membership is a tax-deductible gift to WUWF.
        {level ? ` Members' listening comes with ${level}.` : ''}
      </p>
      <p className={classNames?.text ?? 'max-w-[40rem] text-base text-ink-2'}>
        Already a member?{' '}
        <Link className="font-semibold underline" href={memberHref ?? '/account'}>
          {memberHref ? `Sign in to ${isEpisode ? 'listen' : 'read'}` : 'Go to your account'}
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          className={
            classNames?.primary ??
            'inline-flex min-h-12 items-center justify-center rounded-sm bg-wuwf-blue-700 px-6 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline'
          }
          href={supportHref}
        >
          Become a member
        </Link>
        {showHref && (
          <Link
            className={
              classNames?.secondary ??
              'inline-flex min-h-12 items-center justify-center rounded-sm border border-rule-strong px-6 text-base font-bold text-ink hover:no-underline'
            }
            href={showHref}
          >
            {isEpisode ? 'Hear the free episodes' : 'More from the show'}
          </Link>
        )}
      </div>
    </section>
  )
}
