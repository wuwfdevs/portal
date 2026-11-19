'use client'

import Link from 'next/link'
import React, { useActionState, useEffect, useRef, useState } from 'react'

import { submitInquiry, type InquiryState } from '@/app/(frontend)/sponsor/actions'
import { buttonPrimary, textLink } from '@/components/PageParts'
import { HONEYPOT_FIELD, TOKEN_FIELD } from '@/lib/events/abuse'
import { phoneHref } from '@/lib/page-content'
import { LIMITS } from '@/lib/sponsorship/inquiry'
import { SPONSOR_PATHS } from '@/lib/sponsorship/paths'

const control =
  'min-h-11 w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-on-air-red'

export type InquiryCopy = {
  submit: string
  sending: string
  thanksTitle: string
  thanksPrefix: string
  notice: string
  guidelinesNote: string
  guidelinesLink: string
  labels: { name: string; organization: string; email: string; phone: string; interests: string; budget: string; message: string; required: string }
}

/** Where the form asks for its timing token. A page that holds the form is cached, so the token cannot be in the page (PAGE-BLOCKS.md → Rendering). */
export const TOKEN_URL = '/sponsor/inquiry-token'

/**
 * "Get a proposal" (board 16). Posts to a server action. The timing token is fetched when the form is shown, because the page is cached; the
 * action answers a form with no token as "open for a long time" and hands back a fresh one, and keeps what was typed. Every field has a
 * real label, a refused answer is marked and described next to its field, and nothing is below 44px to touch or 16px to read. Nobody signs
 * in to ask. The form is its own light panel on any tone.
 */
export const Form: React.FC<{ copy: InquiryCopy; interests: string[]; budgets: string[]; phone: string }> = ({ copy, interests, budgets, phone }) => {
  const [state, action, pending] = useActionState<InquiryState, FormData>(submitInquiry, { status: 'idle' })
  const [token, setToken] = useState('')
  useEffect(() => {
    let live = true
    fetch(TOKEN_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { token?: unknown } | null) => {
        if (live && typeof j?.token === 'string') setToken(j.token)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  const errors = state.errors ?? {}
  const values = state.values ?? {}
  const v = (name: string): string => {
    const x = values[name]
    return Array.isArray(x) ? (x[0] ?? '') : (x ?? '')
  }
  const picked = (name: string): boolean => {
    const x = values.interests
    return Array.isArray(x) && x.includes(name)
  }
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state.status !== 'idle') summary.current?.focus()
  }, [state])

  if (state.status === 'ok') {
    return (
      <div className="flex flex-col gap-3 rounded-sm bg-wuwf-blue-100 p-6 text-ink md:p-8" ref={summary} role="status" tabIndex={-1}>
        <h3 className="font-serif text-3xl font-bold">{copy.thanksTitle}</h3>
        <p className="text-lg text-ink-2">
          {copy.thanksPrefix} {state.chosen}.
        </p>
        {phone && (
          <p className="text-base text-ink-2">
            <a className={textLink} href={phoneHref(phone) ?? undefined}>
              {phone}
            </a>
          </p>
        )}
      </div>
    )
  }

  const field = (name: 'name' | 'organization' | 'email' | 'phone', label: string, opts: { required?: boolean; type?: string; autoComplete?: string; inputMode?: 'tel' | 'email' } = {}) => {
    const id = `inquiry-${name}`
    const err = errors[name]
    return (
      <div className="flex flex-col gap-1">
        <label className="text-base font-semibold" htmlFor={id}>
          {label}
          {opts.required && <span aria-hidden="true"> *</span>}
          {opts.required && <span className="sr-only"> ({copy.labels.required})</span>}
        </label>
        <input
          aria-describedby={err ? `${id}-err` : undefined}
          aria-invalid={err ? true : undefined}
          autoComplete={opts.autoComplete}
          className={control}
          defaultValue={v(name)}
          id={id}
          inputMode={opts.inputMode}
          maxLength={LIMITS[name]}
          name={name}
          required={opts.required}
          type={opts.type ?? 'text'}
        />
        {err && (
          <p className="text-sm font-semibold text-on-air-red" id={`${id}-err`}>
            {err}
          </p>
        )}
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-5 rounded-sm border border-rule-strong bg-surface p-6 text-ink md:p-8" noValidate={false}>
      {state.status === 'error' && state.message && (
        <div className="rounded-sm border-2 border-on-air-red bg-surface p-4" ref={summary} role="alert" tabIndex={-1}>
          <p className="font-semibold">{state.message}</p>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {field('name', copy.labels.name, { required: true, autoComplete: 'name' })}
        {field('organization', copy.labels.organization, { required: true, autoComplete: 'organization' })}
        {field('email', copy.labels.email, { required: true, type: 'email', autoComplete: 'email', inputMode: 'email' })}
        {field('phone', copy.labels.phone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold">{copy.labels.interests}</legend>
        <div className="flex flex-wrap gap-2">
          {interests.map((name) => (
            <label
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-rule-strong bg-surface px-4 text-sm font-bold has-[:checked]:border-2 has-[:checked]:border-wuwf-blue-700 has-[:checked]:bg-wuwf-blue-100 has-[:checked]:text-wuwf-blue-700 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              key={name}
            >
              <input className="size-4 accent-wuwf-blue-700" defaultChecked={picked(name)} name="interests" type="checkbox" value={name} />
              {name}
            </label>
          ))}
        </div>
        {errors.interests && <p className="text-sm font-semibold text-on-air-red">{errors.interests}</p>}
      </fieldset>

      <div className="flex max-w-sm flex-col gap-1">
        <label className="text-base font-semibold" htmlFor="inquiry-budget">
          {copy.labels.budget}
        </label>
        <select className={control} defaultValue={v('budget') || budgets[0]} id="inquiry-budget" name="budget">
          {budgets.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-base font-semibold" htmlFor="inquiry-message">
          {copy.labels.message}
        </label>
        <textarea className={control} defaultValue={v('message')} id="inquiry-message" maxLength={LIMITS.message} name="message" rows={5} />
      </div>

      {/* Bots fill every field they can find; a person never sees this one. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input autoComplete="off" name={HONEYPOT_FIELD} tabIndex={-1} type="text" />
        </label>
      </div>
      <input name={TOKEN_FIELD} type="hidden" value={state.token ?? token} />

      <div className="flex flex-col gap-3">
        <button className={`${buttonPrimary} self-start disabled:opacity-60`} disabled={pending} type="submit">
          {pending ? copy.sending : copy.submit}
        </button>
        {copy.notice && <p className="max-w-2xl text-sm text-ink-3">{copy.notice}</p>}
        {copy.guidelinesNote && (
          <p className="text-sm text-ink-3">
            {copy.guidelinesNote}{' '}
            {copy.guidelinesLink && (
              <Link className={textLink} href={SPONSOR_PATHS.guidelines}>
                {copy.guidelinesLink}
              </Link>
            )}
          </p>
        )}
      </div>
    </form>
  )
}
