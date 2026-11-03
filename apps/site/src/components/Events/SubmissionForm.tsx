'use client'

import Link from 'next/link'
import React, { useActionState, useEffect, useRef } from 'react'

import { submitEvent, type FormState } from '@/app/(frontend)/community-calendar-event-submission/actions'
import { HONEYPOT_FIELD, TOKEN_FIELD } from '@/lib/events/abuse'

// The public form for the community calendar. It posts to a server action, so it works without a script: the one-time and
// recurring sections open and close with CSS (:has on the radio buttons), not state. Every field has a real label, a refused
// answer is marked and described next to its field, and nothing here is below 44px to touch or 16px to read.

export interface CategoryOption {
  slug: string
  title: string
}

const STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const control = 'min-h-11 w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base text-ink aria-[invalid=true]:border-[var(--on-air-red)] aria-[invalid=true]:border-2'
const legend = 'px-1 font-serif text-xl font-bold text-ink'
const set = 'flex flex-col gap-4 rounded-sm border border-rule p-4 md:p-6'

type Values = Record<string, string | string[]>

export function SubmissionForm({ categories, initialToken, today }: { categories: CategoryOption[]; initialToken: string; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitEvent, { status: 'idle' })
  const errors = state.errors ?? {}
  const values: Values = state.values ?? {}
  const v = (name: string): string => {
    const x = values[name]
    return Array.isArray(x) ? (x[0] ?? '') : (x ?? '')
  }
  const checked = (name: string, value: string): boolean => {
    const x = values[name]
    return Array.isArray(x) ? x.includes(value) : x === value
  }
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state.status !== 'idle') summary.current?.focus()
  }, [state])

  if (state.status === 'ok') {
    return (
      <div ref={summary} className="flex flex-col gap-4 rounded-sm bg-wuwf-blue-100 p-6 md:p-8" role="status" tabIndex={-1}>
        <h2 className="font-serif text-3xl font-bold text-ink">Thank you. Your event has been sent.</h2>
        <p className="text-lg text-ink-2">
          WUWF staff review every event before it is listed, and may edit it or decide not to list it. We cannot promise a date, and we do not send a confirmation.
          If your event is listed it will appear on the calendar.
        </p>
        <p className="flex flex-wrap gap-4">
          <Link className="inline-flex min-h-11 items-center font-semibold text-wuwf-blue-700 underline" href="/community-calendar">
            Back to the calendar
          </Link>
          <Link className="inline-flex min-h-11 items-center font-semibold text-wuwf-blue-700 underline" href="/community-calendar-event-submission">
            Send another event
          </Link>
        </p>
      </div>
    )
  }

  const errorList = Object.entries(errors)
  const field = (name: string, label: string, opts: { type?: string; required?: boolean; mark?: boolean; hint?: string; placeholder?: string; autoComplete?: string; inputMode?: 'tel' | 'email' | 'url' | 'numeric'; min?: string; maxLength?: number } = {}) => {
    const id = `f-${name}`
    const err = errors[name]
    return (
      <div className="flex flex-col gap-1">
        <label className="text-base font-semibold text-ink" htmlFor={id}>
          {label}
          {(opts.required || opts.mark) && <span aria-hidden="true"> *</span>}
          {(opts.required || opts.mark) && <span className="sr-only"> (required)</span>}
        </label>
        {opts.hint && (
          <p className="text-sm text-ink-3" id={`${id}-hint`}>
            {opts.hint}
          </p>
        )}
        <input
          aria-describedby={[opts.hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined}
          aria-invalid={err ? true : undefined}
          autoComplete={opts.autoComplete ?? 'off'}
          className={control}
          defaultValue={v(name)}
          id={id}
          inputMode={opts.inputMode}
          maxLength={opts.maxLength}
          min={opts.min}
          name={name}
          placeholder={opts.placeholder}
          required={opts.required}
          type={opts.type ?? 'text'}
        />
        {err && (
          <p className="text-sm font-semibold text-[var(--on-air-red)]" id={`${id}-err`}>
            {err}
          </p>
        )}
      </div>
    )
  }
  const textarea = (name: string, label: string, hint: string, rows = 6) => {
    const id = `f-${name}`
    const err = errors[name]
    return (
      <div className="flex flex-col gap-1">
        <label className="text-base font-semibold text-ink" htmlFor={id}>
          {label}
        </label>
        <p className="text-sm text-ink-3" id={`${id}-hint`}>
          {hint}
        </p>
        <textarea aria-describedby={`${id}-hint${err ? ` ${id}-err` : ''}`} aria-invalid={err ? true : undefined} className={control} defaultValue={v(name)} id={id} name={name} rows={rows} />
        {err && (
          <p className="text-sm font-semibold text-[var(--on-air-red)]" id={`${id}-err`}>
            {err}
          </p>
        )}
      </div>
    )
  }
  const radio = (name: string, id: string, value: string, label: string, defaultChecked: boolean) => (
    <label className="flex min-h-11 items-center gap-3 text-base text-ink" htmlFor={id}>
      <input className="size-5" defaultChecked={defaultChecked} id={id} name={name} type="radio" value={value} />
      {label}
    </label>
  )
  // Shown only when their section is open, so they are marked but never `required` to the browser: a hidden required field would stop the form sending.
  const time = (name: string, label: string, mark = false) => field(name, label, { type: 'time', mark })
  const date = (name: string, label: string) => field(name, label, { type: 'date', mark: true, min: today })

  return (
    <form action={action} className="flex flex-col gap-8" encType="multipart/form-data">
      {state.status === 'error' && (
        <div ref={summary} className="rounded-sm border-2 border-[var(--on-air-red)] bg-surface p-4" role="alert" tabIndex={-1}>
          <p className="text-base font-bold text-ink">{state.message}</p>
          {errorList.length > 0 && (
            <ul className="mt-2 list-disc pl-6 text-base text-ink-2">
              {errorList.map(([name, message]) => (
                <li key={name}>
                  <a className="text-wuwf-blue-700 underline" href={`#f-${name}`}>
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* The timing token proves the form was open a plausible time; the hidden field catches scripts that fill every box. */}
      <input name={TOKEN_FIELD} type="hidden" value={state.token ?? initialToken} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this empty
          <input autoComplete="off" name={HONEYPOT_FIELD} tabIndex={-1} type="text" />
        </label>
      </div>

      <fieldset className={set}>
        <legend className={legend}>The event</legend>
        {field('event-title', 'Event title', { required: true, maxLength: 150 })}
        <div className="flex flex-col gap-2" id="f-event-category">
          <p className="text-base font-semibold text-ink" id="categories-label">
            Categories <span aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </p>
          <p className="text-sm text-ink-3">Choose up to three.</p>
          <div aria-labelledby="categories-label" className="grid gap-x-6 sm:grid-cols-2" role="group">
            {categories.map((c) => (
              <label className="flex min-h-11 items-center gap-3 text-base text-ink" key={c.slug}>
                <input className="size-5" defaultChecked={checked('event-category', c.slug)} name="event-category" type="checkbox" value={c.slug} />
                {c.title}
              </label>
            ))}
          </div>
          {errors['event-category'] && (
            <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['event-category']}</p>
          )}
        </div>
        {textarea('event-description', 'Description', 'Plain text. Leave a blank line between paragraphs. Say who is putting it on, what it is, and a phone number or email for questions.', 7)}
      </fieldset>

      <fieldset className={`${set} group/when`}>
        <legend className={legend}>When</legend>
        <div aria-describedby={errors['event-type'] ? 'f-event-type-err' : undefined} className="flex flex-wrap gap-x-8" id="f-event-type" role="radiogroup">
          {radio('event-type', 'et-once', 'one-time-event', 'One-time event', v('event-type') === 'one-time-event')}
          {radio('event-type', 'et-recurring', 'recurring-event', 'Recurring event', v('event-type') === 'recurring-event')}
        </div>
        {errors['event-type'] && (
          <p className="text-sm font-semibold text-[var(--on-air-red)]" id="f-event-type-err">
            {errors['event-type']}
          </p>
        )}
        <p className="text-sm text-ink-3">Times are Central time, the station&apos;s time.</p>

        <div className="hidden flex-col gap-4 group-has-[#et-once:checked]/when:flex">
          <div className="grid gap-4 sm:grid-cols-3">
            {date('once-date', 'Event date')}
            {time('once-start', 'Start time', true)}
            {time('once-end', 'End time')}
          </div>
        </div>

        <div className="hidden flex-col gap-4 group-has-[#et-recurring:checked]/when:flex group/rep">
          <div className="flex flex-wrap gap-x-8" id="f-recurring-event-repeats" role="radiogroup">
            {radio('recurring-event-repeats', 'rp-daily', 'recurring-event-repeats-daily', 'Repeats daily', checked('recurring-event-repeats', 'recurring-event-repeats-daily'))}
            {radio('recurring-event-repeats', 'rp-weekly', 'recurring-event-repeats-weekly', 'Repeats weekly', checked('recurring-event-repeats', 'recurring-event-repeats-weekly'))}
            {radio('recurring-event-repeats', 'rp-monthly', 'recurring-event-repeats-monthly', 'Repeats monthly', checked('recurring-event-repeats', 'recurring-event-repeats-monthly'))}
          </div>
          {errors['recurring-event-repeats'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['recurring-event-repeats']}</p>}

          <div className="hidden flex-col gap-4 group-has-[#rp-daily:checked]/rep:flex">
            <div className="grid gap-4 sm:grid-cols-2">
              {date('daily-start-date', 'First date')}
              {date('daily-end-date', 'Last date')}
              {time('daily-start', 'Start time', true)}
              {time('daily-end', 'End time', true)}
            </div>
          </div>

          <div className="hidden flex-col gap-4 group-has-[#rp-weekly:checked]/rep:flex">
            <div className="grid gap-4 sm:grid-cols-3">
              {date('weekly-start-date', 'First date')}
              {date('weekly-end-date', 'Last date')}
              <div className="flex flex-col gap-1">
                <label className="text-base font-semibold text-ink" htmlFor="f-weekly-interval">
                  Every how many weeks <span aria-hidden="true">*</span>
                </label>
                <select aria-invalid={errors['weekly-interval'] ? true : undefined} className={control} defaultValue={v('weekly-interval')} id="f-weekly-interval" name="weekly-interval">
                  <option value="">Choose</option>
                  {Array.from({ length: 52 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1 === 1 ? '1 (every week)' : i + 1}
                    </option>
                  ))}
                </select>
                {errors['weekly-interval'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['weekly-interval']}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2" id="f-weekly-day-0">
              <p className="text-base font-semibold text-ink">Days and times</p>
              <p className="text-sm text-ink-3">Tick each day it happens and give that day&apos;s start and end.</p>
              {errors['weekly-day-0'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['weekly-day-0']}</p>}
              {WEEKDAYS.map((name, d) => (
                <div className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_1fr]" key={name}>
                  <label className="flex min-h-11 items-center gap-3 text-base text-ink">
                    <input className="size-5" defaultChecked={checked(`weekly-day-${d}`, 'on')} name={`weekly-day-${d}`} type="checkbox" value="on" />
                    {name}
                  </label>
                  {field(`weekly-start-${d}`, `${name} start`, { type: 'time' })}
                  {field(`weekly-end-${d}`, `${name} end`, { type: 'time' })}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden flex-col gap-4 group-has-[#rp-monthly:checked]/rep:flex">
            <div className="grid gap-4 sm:grid-cols-2">
              {date('monthly-start-date', 'First date')}
              {date('monthly-end-date', 'Last date')}
              {time('monthly-start', 'Start time', true)}
              {time('monthly-end', 'End time', true)}
              <div className="flex flex-col gap-1">
                <label className="text-base font-semibold text-ink" htmlFor="f-monthly-frequency">
                  Which one <span aria-hidden="true">*</span>
                </label>
                <select aria-invalid={errors['monthly-frequency'] ? true : undefined} className={control} defaultValue={v('monthly-frequency')} id="f-monthly-frequency" name="monthly-frequency">
                  <option value="">Choose</option>
                  {['first', 'second', 'third', 'fourth', 'last'].map((o) => (
                    <option key={o} value={o}>
                      {o[0]!.toUpperCase() + o.slice(1)}
                    </option>
                  ))}
                </select>
                {errors['monthly-frequency'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['monthly-frequency']}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-base font-semibold text-ink" htmlFor="f-monthly-day-of-week">
                  Day of the week <span aria-hidden="true">*</span>
                </label>
                <select aria-invalid={errors['monthly-day-of-week'] ? true : undefined} className={control} defaultValue={v('monthly-day-of-week')} id="f-monthly-day-of-week" name="monthly-day-of-week">
                  <option value="">Choose</option>
                  {WEEKDAYS.map((n, d) => (
                    <option key={n} value={d}>
                      {n}
                    </option>
                  ))}
                </select>
                {errors['monthly-day-of-week'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['monthly-day-of-week']}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-base font-semibold text-ink" htmlFor="f-monthly-every">
                  Every how many months <span aria-hidden="true">*</span>
                </label>
                <select aria-invalid={errors['monthly-every'] ? true : undefined} className={control} defaultValue={v('monthly-every')} id="f-monthly-every" name="monthly-every">
                  <option value="">Choose</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1 === 1 ? '1 (every month)' : i + 1}
                    </option>
                  ))}
                </select>
                {errors['monthly-every'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['monthly-every']}</p>}
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Venue</legend>
        {field('venue-name', 'Venue name', { required: true, hint: 'For an online event, say so here, for example "Online via Zoom".', maxLength: 150 })}
        {field('venue-street-address', 'Street address', { autoComplete: 'off', maxLength: 150 })}
        <div className="grid gap-4 sm:grid-cols-3">
          {field('venue-city', 'City', { maxLength: 150 })}
          <div className="flex flex-col gap-1">
            <label className="text-base font-semibold text-ink" htmlFor="f-venue-state">
              State
            </label>
            <select aria-invalid={errors['venue-state'] ? true : undefined} className={control} defaultValue={v('venue-state')} id="f-venue-state" name="venue-state">
              <option value="">Choose</option>
              {STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            {errors['venue-state'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['venue-state']}</p>}
          </div>
          {field('venue-zip', 'Zip code', { inputMode: 'numeric' })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field('venue-email', 'Venue email', { type: 'email', inputMode: 'email' })}
          {field('venue-phone', 'Venue phone', { type: 'tel', inputMode: 'tel' })}
          {field('venue-website', 'Venue website', { inputMode: 'url', placeholder: 'https://example.org' })}
        </div>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Picture and tickets</legend>
        <div className="flex flex-col gap-1">
          <label className="text-base font-semibold text-ink" htmlFor="f-event-image">
            Event picture
          </label>
          <p className="text-sm text-ink-3" id="f-event-image-hint">
            Optional. A JPEG, PNG, WebP or GIF, at least 300 by 300 pixels and no bigger than 2000 by 2000, up to 4 MB. A chosen file is not kept if the form comes back with a question for you.
          </p>
          <input accept="image/jpeg,image/png,image/webp,image/gif" aria-describedby="f-event-image-hint" aria-invalid={errors['event-image'] ? true : undefined} className={`${control} file:mr-3 file:rounded-sm file:border-0 file:bg-surface-3 file:px-3 file:py-2`} id="f-event-image" name="event-image" type="file" />
          {errors['event-image'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['event-image']}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('price-price-range', 'Price or price range', { hint: 'For example $10 or $25-40.', maxLength: 60 })}
          <label className="flex min-h-11 items-center gap-3 self-end text-base text-ink">
            <input className="size-5" defaultChecked={checked('this-is-a-free-event', 'this-is-a-free-event')} name="this-is-a-free-event" type="checkbox" value="this-is-a-free-event" />
            This is a free event
          </label>
        </div>
        {errors['price-price-range'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['price-price-range']}</p>}
        {textarea('additional-pricing-information', 'Additional pricing information', 'For example: tickets must be bought online.', 3)}
        {field('ticketing-website', 'Ticket or registration website', { inputMode: 'url', placeholder: 'https://example.org' })}
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Who is putting it on</legend>
        {field('presenting-organization-name', 'Organization name', { maxLength: 120 })}
        <div className="grid gap-4 sm:grid-cols-3">
          {field('presenting-organization-email', 'Organization email', { type: 'email', inputMode: 'email' })}
          {field('presenting-organization-phone', 'Organization phone', { type: 'tel', inputMode: 'tel' })}
          {field('presenting-organization-website', 'Organization website', { inputMode: 'url', placeholder: 'https://example.org' })}
        </div>
        <div className="flex flex-col gap-1" id="f-presenting-organization-designation" role="radiogroup" aria-labelledby="designation-label">
          <p className="text-base font-semibold text-ink" id="designation-label">
            The organization is
          </p>
          <div className="flex flex-wrap gap-x-8">
            {radio('presenting-organization-designation', 'ds-na', 'n-a', 'Not stated', v('presenting-organization-designation') === 'n-a' || !v('presenting-organization-designation'))}
            {radio('presenting-organization-designation', 'ds-np', 'not-for-profit', 'Not for profit', v('presenting-organization-designation') === 'not-for-profit')}
            {radio('presenting-organization-designation', 'ds-fp', 'for-profit', 'For profit', v('presenting-organization-designation') === 'for-profit')}
          </div>
          {errors['presenting-organization-designation'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['presenting-organization-designation']}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field('artist-name', 'Artist or performer', { maxLength: 120 })}
          {field('artist-email', 'Artist email', { type: 'email', inputMode: 'email' })}
          {field('artist-website', 'Artist website', { inputMode: 'url', placeholder: 'https://example.org' })}
        </div>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Your information</legend>
        <p className="text-base text-ink-2">
          We ask so that we can contact you with questions about the event. Only WUWF staff see this. It is never shown on the site.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('your-information-name', 'Your name', { autoComplete: 'name', maxLength: 120 })}
          {field('your-information-email', 'Your email', { type: 'email', required: true, autoComplete: 'email', inputMode: 'email' })}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-base font-semibold text-ink" htmlFor="f-your-information-submitting-as">
            I am submitting this as <span aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <select aria-invalid={errors['your-information-submitting-as'] ? true : undefined} className={control} defaultValue={v('your-information-submitting-as')} id="f-your-information-submitting-as" name="your-information-submitting-as" required>
            <option value="">Choose</option>
            <option value="listener">A listener</option>
            <option value="venue">A venue</option>
            <option value="artist">An artist</option>
            <option value="promoter">A promoter</option>
          </select>
          {errors['your-information-submitting-as'] && <p className="text-sm font-semibold text-[var(--on-air-red)]">{errors['your-information-submitting-as']}</p>}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-3">
          WUWF staff may edit what is announced and decide which announcements are listed, and may reject any that do not serve the community. All submissions are reviewed before they appear on this site or are announced on air.
        </p>
        <button className="inline-flex min-h-12 items-center justify-center self-start rounded-sm bg-wuwf-blue-700 px-8 text-base font-bold text-surface hover:bg-wuwf-blue-600 disabled:opacity-60" disabled={pending} type="submit">
          {pending ? 'Sending…' : 'Send event'}
        </button>
      </div>
    </form>
  )
}
