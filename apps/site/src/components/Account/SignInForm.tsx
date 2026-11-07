'use client'

import React, { useActionState } from 'react'

import { askForSignInLink, type SignInState } from '@/app/(frontend)/account/actions'
import { HONEYPOT } from '@/lib/audience/fields'

const control =
  'min-h-11 w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-on-air-red'

/**
 * Ask for a sign-in link (phase 7b). Posts to a server action, so it works without a script. The answer never says whether the
 * address already has an account.
 */
export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(askForSignInLink, { status: 'idle' })

  if (state.status === 'sent') {
    return (
      <div aria-live="polite" className="flex flex-col gap-3 rounded-sm border border-rule bg-surface-2 p-6" role="status">
        <h2 className="font-serif text-2xl font-bold text-ink">Check your email</h2>
        <p className="text-base text-ink-2">
          We sent a sign-in link to <strong className="text-ink">{state.email}</strong>. It works once and expires within an hour. If it does not arrive in a few
          minutes, check your spam folder, or ask for another.
        </p>
      </div>
    )
  }

  const error = state.status === 'error' ? state.message : null
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input name="next" type="hidden" value={next} />
      <div className="flex flex-col gap-1">
        <label className="text-base font-semibold text-ink" htmlFor="signin-email">
          Email address
        </label>
        <input
          aria-describedby={error ? 'signin-error' : 'signin-hint'}
          aria-invalid={error ? true : undefined}
          autoComplete="email"
          className={control}
          defaultValue={state.email ?? ''}
          id="signin-email"
          inputMode="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
        {error ? (
          <p aria-live="assertive" className="text-sm font-semibold text-on-air-red" id="signin-error">
            {error}
          </p>
        ) : (
          <p className="text-sm text-ink-3" id="signin-hint">
            We email you a link that signs you in. No password.
          </p>
        )}
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this empty
          <input autoComplete="off" name={HONEYPOT} tabIndex={-1} type="text" />
        </label>
      </div>
      <button
        className="inline-flex min-h-12 items-center justify-center self-start rounded-sm bg-wuwf-blue-700 px-6 text-base font-bold text-surface hover:bg-wuwf-blue-600 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  )
}
