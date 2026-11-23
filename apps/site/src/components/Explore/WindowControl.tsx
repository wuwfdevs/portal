'use client'

import React, { useCallback, useMemo, useRef } from 'react'

import { formatSpan, formatYear, histogram, positionOf, scaleFor, scaleTicks, stepYear, yearAt, type YearSpan } from '@/lib/explore/years'

const BUCKETS = 48

/**
 * The time window: two handles on a track whose scale changes grain at 1000 BCE and at 1500 (`lib/explore/years`), a histogram of the episodes above it, and the years it holds in words.
 * Each handle is a slider: drag it, or focus it and use the arrow keys (one grain a step), Page Up and Down (ten), Home and End. The track is one shape for a pointer and for a keyboard, and
 * a screen reader hears the year and which end it is. The histogram is a picture of the same counts the list gives, so it carries a text label and nothing else depends on it.
 * Colours are the band's tone (`--tone-*`), so the control is right on whatever ground the page's theme gives the band.
 */
export function WindowControl({
  value,
  onChange,
  spans,
  thisYear,
  onReset,
  atFull,
}: {
  value: YearSpan
  onChange: (next: YearSpan) => void
  /** Every episode's span, for the histogram. */
  spans: ReadonlyArray<YearSpan | null>
  thisYear: number
  onReset: () => void
  /** Whether the window is already the whole scale (the reset has nothing to do). */
  atFull: boolean
}) {
  const scale = useMemo(() => scaleFor(thisYear), [thisYear])
  const ticks = useMemo(() => scaleTicks(scale, thisYear), [scale, thisYear])
  const bars = useMemo(() => histogram(spans, scale, BUCKETS), [spans, scale])
  const track = useRef<HTMLDivElement>(null)
  const first = scale[0]!.from
  const last = scale[scale.length - 1]!.to

  const fromPos = positionOf(scale, value.from)
  const toPos = positionOf(scale, value.to)

  const move = useCallback(
    (which: 'from' | 'to', year: number) => {
      onChange(which === 'from' ? { from: Math.min(year, value.to), to: value.to } : { from: value.from, to: Math.max(year, value.from) })
    },
    [onChange, value.from, value.to],
  )

  const drag = (which: 'from' | 'to') => (event: React.PointerEvent<HTMLDivElement>) => {
    const el = track.current
    if (!el) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const at = (clientX: number) => {
      const r = el.getBoundingClientRect()
      return yearAt(scale, (clientX - r.left) / r.width)
    }
    const onMove = (e: PointerEvent) => move(which, at(e.clientX))
    const done = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
  }

  const key = (which: 'from' | 'to') => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = which === 'from' ? value.from : value.to
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = stepYear(scale, current, 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = stepYear(scale, current, -1)
    else if (event.key === 'PageUp') next = Array.from({ length: 10 }).reduce<number>((y) => stepYear(scale, y, 1), current)
    else if (event.key === 'PageDown') next = Array.from({ length: 10 }).reduce<number>((y) => stepYear(scale, y, -1), current)
    else if (event.key === 'Home') next = first
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    move(which, next)
  }

  const handle = (which: 'from' | 'to', pos: number, year: number) => (
    <div
      aria-label={which === 'from' ? 'Window starts' : 'Window ends'}
      aria-orientation="horizontal"
      aria-valuemax={last}
      aria-valuemin={first}
      aria-valuenow={year}
      aria-valuetext={formatYear(year)}
      className="absolute top-0 z-10 flex size-11 -translate-x-1/2 touch-none cursor-grab items-center justify-center outline-none focus-visible:[&>span]:ring-4 focus-visible:[&>span]:ring-[color:var(--tone-accent)] active:cursor-grabbing"
      onKeyDown={key(which)}
      onPointerDown={drag(which)}
      role="slider"
      style={{ left: `${pos * 100}%` }}
      tabIndex={0}
    >
      <span className="block size-5 rounded-full border-[3px] shadow-1 [background-color:var(--tone-card)] [border-color:var(--tone-accent)]" />
    </div>
  )

  return (
    <div className="flex flex-col gap-1 border-t px-6 pb-3 pt-3.5 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider [color:var(--tone-muted)]">Time window</span>
          <span aria-live="polite" className="whitespace-nowrap font-serif text-xl font-semibold sm:text-[1.375rem]">
            {formatSpan(value.from, value.to)}
          </span>
        </div>
        <button className="inline-flex min-h-11 items-center text-sm font-bold underline-offset-2 hover:underline disabled:opacity-50 [color:var(--tone-accent)]" disabled={atFull} onClick={onReset} type="button">
          Reset
        </button>
      </div>
      <div aria-label="Time window. Drag a handle, or focus it and use the arrow keys." className="relative h-[7rem]" role="group">
        <div aria-label={`Episodes by year, ${bars.counts.reduce((a, b) => a + b, 0)} marks across ${BUCKETS} slices of the timeline`} className="absolute inset-x-0 top-0 flex h-14 items-end" role="img">
          {bars.counts.map((n, i) => (
            <span
              className="mx-px flex-1 rounded-t-sm [background-color:color-mix(in_srgb,var(--tone-accent)_40%,transparent)]"
              key={i}
              style={{ height: `${bars.max === 0 ? 0 : Math.max(n > 0 ? 6 : 0, Math.round((n / bars.max) * 100))}%` }}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 top-[3.625rem] h-11" ref={track}>
          <div className="absolute inset-x-0 top-[1.375rem] h-1 -translate-y-1/2 rounded-full [background-color:var(--tone-rule)]" />
          <div className="absolute top-[1.375rem] h-1 -translate-y-1/2 rounded-full [background-color:var(--tone-accent)]" style={{ left: `${fromPos * 100}%`, width: `${Math.max(0, toPos - fromPos) * 100}%` }} />
          {handle('from', fromPos, value.from)}
          {handle('to', toPos, value.to)}
        </div>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-4 text-xs [color:var(--tone-muted)]">
          {ticks.map((t, i) => (
            // The first two labels start at their tick and the last ends at its, so on a phone the two close to the left edge (10,000 BCE, 1,000 BCE) never overlap; "1 CE" is for a wide screen.
            <span className={`absolute whitespace-nowrap${t.year === 1 ? ' max-sm:hidden' : ''}`} key={t.year} style={{ left: `${t.position * 100}%`, transform: i <= 1 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
