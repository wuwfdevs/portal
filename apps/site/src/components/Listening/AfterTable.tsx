'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { ListeningConversation } from '@wuwf/portal-contracts'

import { readConversation, saveHighlights, saveSpeakers, sendConversation } from '@/app/(frontend)/listens/table-actions'
import {
  activeSpeakers,
  afterStage,
  clockFromMs,
  lineAt,
  markFacilitator,
  markLine,
  marksHeading,
  marksPayload,
  mergeSpeakers,
  renameSpeaker,
  speakersPayload,
  toMarkEdits,
  toSpeakerEdits,
  unmarkLine,
  visibleLines,
  voiceName,
  waitingSentence,
  type MarkEdit,
  type SpeakerEdit,
} from '@/lib/listening/after'
import { cn } from '@/utilities/ui'

import { buttonDark, buttonLink, buttonSecondary, checkRow, checkbox, field, label, noticeInfo, noticeOk, noticeWarn } from './styles'

const POLL_MS = 20000
const FIRST_MINUTES = 10

/**
 * The facilitator's after-page (board 5e): who was speaking, what mattered, then send. The Portal's transcript is rendered and
 * dropped: nothing here is stored on this site. Marks are sent as where a line starts and a tag; the Portal copies the words, so
 * what was marked cannot change if the transcript is made again. Once sent, the conversation can be read but not changed.
 */
export const AfterTable: React.FC<{ initial: ListeningConversation }> = ({ initial }) => {
  const [conversation, setConversation] = useState(initial)
  const [speakers, setSpeakers] = useState<SpeakerEdit[]>(() => toSpeakerEdits(initial.speakers))
  const [marks, setMarks] = useState<MarkEdit[]>(() => toMarkEdits(initial.highlights))
  const [dirty, setDirty] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [limit, setLimit] = useState<number | null>(FIRST_MINUTES)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const stage = afterStage(conversation)
  const readOnly = stage !== 'working'

  const refresh = useCallback(async () => {
    const result = await readConversation()
    if (!result.ok) return
    setConversation(result.conversation)
    if (!dirty) {
      setSpeakers(toSpeakerEdits(result.conversation.speakers))
      setMarks(toMarkEdits(result.conversation.highlights))
    }
  }, [dirty])

  // Until the transcript exists the page asks again by itself.
  useEffect(() => {
    if (stage !== 'waiting') return
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [stage, refresh])

  const lines = useMemo(() => visibleLines(conversation.lines, limit), [conversation.lines, limit])
  const hiddenCount = conversation.lines.length - lines.length
  const firstWords = useMemo(() => {
    const out = new Map<string, string>()
    for (const line of conversation.lines) if (line.speakerId && !out.has(line.speakerId)) out.set(line.speakerId, line.text)
    return out
  }, [conversation.lines])

  const editSpeakers = (next: SpeakerEdit[]) => {
    setSpeakers(next)
    setDirty(true)
    setNote(null)
  }
  const editMarks = (next: MarkEdit[]) => {
    setMarks(next)
    setDirty(true)
    setNote(null)
  }

  const persist = async (): Promise<boolean> => {
    const named = await saveSpeakers({ speakers: speakersPayload(speakers) })
    if (!named.ok) {
      setError(named.message)
      return false
    }
    const marked = await saveHighlights({ highlights: marksPayload(marks) })
    if (!marked.ok) {
      setError(marked.message)
      return false
    }
    setDirty(false)
    return true
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (await persist()) setNote('Saved. You can come back to this page and carry on.')
    setBusy(false)
  }

  const send = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (await persist()) {
      const sent = await sendConversation()
      if (!sent.ok) setError(sent.message)
      else {
        setDirty(false)
        await refresh()
      }
    }
    setBusy(false)
  }

  if (stage === 'waiting') {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <h2 className="font-serif text-2xl font-bold">Your transcript is on its way.</h2>
        <p className="max-w-xl text-base text-ink-2">{waitingSentence(conversation.status)}</p>
        <button className={cn(buttonSecondary, 'self-start')} onClick={refresh} type="button">
          Check now
        </button>
      </div>
    )
  }

  const tags = conversation.tags

  return (
    <div className="flex flex-col gap-8">
      {stage === 'sent' ? (
        <div className={noticeOk} role="status">
          <strong>Sent. Thank you.</strong> A WUWF journalist will listen with your names and marks beside the transcript. You can read it here, but it can no longer be changed.
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-sm font-semibold text-ink-2">
          <li>1 · Name the speakers</li>
          <li>2 · Mark what mattered</li>
          <li>3 · Send to WUWF</li>
        </ol>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="transcript-h" className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-bold" id="transcript-h">
            The transcript
          </h2>
          {!readOnly && (
            <p className="text-sm text-ink-3">
              Read through. The transcript is a machine&rsquo;s first pass, so a few words will be wrong; that&rsquo;s fine. Select any line that said something true about living here{tags.length > 0 ? ', and give it a tag' : ''}.
            </p>
          )}
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {lines.map((line) => {
              const mark = marks.find((m) => m.startMs === line.startMs)
              const isOpen = open === line.startMs
              return (
                <li className={cn('rounded-sm border', mark ? 'border-wuwf-lime bg-wuwf-lime-100/50' : 'border-rule')} key={line.startMs}>
                  <button
                    aria-expanded={readOnly ? undefined : isOpen}
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-wuwf-blue-700 disabled:cursor-default"
                    disabled={readOnly}
                    onClick={() => setOpen(isOpen ? null : line.startMs)}
                    type="button"
                  >
                    <span className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-bold text-ink-2">{voiceName(speakers, line.speakerId)}</span>
                      <span className="font-mono text-ink-3">
                        {mark && <span className="mr-2 font-sans font-bold text-lime-text">★{mark.tag ? ` ${mark.tag}` : ''}</span>}
                        {clockFromMs(line.startMs)}
                      </span>
                    </span>
                    <span className="text-[0.9375rem] leading-snug text-ink">{line.text}</span>
                  </button>
                  {isOpen && !readOnly && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2.5">
                      <span className="text-sm font-semibold text-ink-2">Mark this line{tags.length > 0 ? ' as' : ''}:</span>
                      {tags.length > 0 ? (
                        tags.map((tag) => (
                          <button
                            className={cn(buttonSecondary, 'min-h-9 px-3', mark?.tag === tag && 'border-ink bg-surface-2')}
                            key={tag}
                            onClick={() => {
                              editMarks(markLine(marks, line.startMs, tag))
                              setOpen(null)
                            }}
                            type="button"
                          >
                            {tag}
                          </button>
                        ))
                      ) : (
                        <button
                          className={cn(buttonSecondary, 'min-h-9 px-3')}
                          onClick={() => {
                            editMarks(markLine(marks, line.startMs, null))
                            setOpen(null)
                          }}
                          type="button"
                        >
                          Mark it
                        </button>
                      )}
                      {mark && (
                        <button
                          className={buttonLink}
                          onClick={() => {
                            editMarks(unmarkLine(marks, line.startMs))
                            setOpen(null)
                          }}
                          type="button"
                        >
                          Remove mark
                        </button>
                      )}
                      <button className={buttonLink} onClick={() => setOpen(null)} type="button">
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {hiddenCount > 0 && (
            <p className="flex flex-wrap items-center gap-3 text-sm text-ink-3">
              Showing the first {FIRST_MINUTES} minutes.
              <button className={buttonLink} onClick={() => setLimit(null)} type="button">
                Load the rest
              </button>
            </p>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="voices-h" className="flex flex-col gap-3">
            <h2 className="font-serif text-xl font-bold" id="voices-h">
              Who was speaking
            </h2>
            {!readOnly && (
              <p className="text-sm text-ink-3">
                Everyone introduced themselves at the start; each voice&rsquo;s first words are below to jog your memory. First names are enough. Leave one blank if you&rsquo;d rather not say.
              </p>
            )}
            {conversation.contactCardCount > 0 && (
              <p className={noticeInfo}>
                {conversation.contactCardCount === 1 ? 'One person' : `${conversation.contactCardCount} people`} left WUWF a contact card. Only WUWF sees what is on it.
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {activeSpeakers(speakers).map((speaker) => {
                const others = activeSpeakers(speakers).filter((s) => s.id !== speaker.id)
                return (
                  <li className="flex flex-col gap-2 rounded-md border border-rule-strong p-3" key={speaker.id}>
                    <div className="flex flex-col gap-1">
                      <label className={label} htmlFor={`voice-${speaker.id}`}>
                        {speaker.label} · {Math.round(speaker.sharePercent)}% of the talking
                      </label>
                      <input
                        className={field}
                        disabled={readOnly}
                        id={`voice-${speaker.id}`}
                        maxLength={100}
                        onChange={(event) => editSpeakers(renameSpeaker(speakers, speaker.id, event.target.value))}
                        placeholder="First name"
                        type="text"
                        value={speaker.name}
                      />
                    </div>
                    <label className={checkRow}>
                      <input checked={speaker.isFacilitator} className={checkbox} disabled={readOnly} onChange={() => editSpeakers(markFacilitator(speakers, speaker.id))} type="checkbox" />
                      <span>That&rsquo;s me</span>
                    </label>
                    <span className="text-xs text-ink-3">
                      First heard at {clockFromMs(speaker.firstHeardMs)}
                      {firstWords.get(speaker.id) ? `: “${firstWords.get(speaker.id)!.slice(0, 120)}”` : ''}
                    </span>
                    {!readOnly && others.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="text-ink-2" htmlFor={`merge-${speaker.id}`}>
                          Same person as
                        </label>
                        <select
                          className={cn(field, 'min-h-9 w-auto py-0 text-sm')}
                          id={`merge-${speaker.id}`}
                          onChange={(event) => {
                            if (event.target.value) editSpeakers(mergeSpeakers(speakers, speaker.id, event.target.value))
                          }}
                          value=""
                        >
                          <option value="">Merge into…</option>
                          {others.map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name.trim() || other.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="marks-h" className="flex flex-col gap-3">
            <h2 className="font-serif text-xl font-bold" id="marks-h">
              {marksHeading(marks.length)}
            </h2>
            {marks.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing marked yet. Aim for five to ten lines. These are what WUWF reads first.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {marks.map((mark) => {
                  const line = lineAt(conversation.lines, mark.startMs)
                  const saved = conversation.highlights.find((h) => h.startMs === mark.startMs)
                  const text = line?.text ?? saved?.text ?? ''
                  return (
                    <li className="flex flex-col gap-1 rounded-sm border border-rule p-2.5" key={mark.startMs}>
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-lime-text">{mark.tag ?? 'Marked'}</span>
                        {!readOnly && (
                          <button className={buttonLink} onClick={() => editMarks(unmarkLine(marks, mark.startMs))} type="button">
                            Remove
                          </button>
                        )}
                      </span>
                      <span className="text-sm leading-snug text-ink">{text}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {!readOnly && (
        <section aria-labelledby="send-h" className="flex max-w-xl flex-col gap-3 border-t border-rule pt-6">
          <h2 className="font-serif text-xl font-bold" id="send-h">
            Send to WUWF
          </h2>
          <p className="text-sm text-ink-2">A WUWF journalist reads the whole transcript either way; your names and marks help them hear it right. You can save and come back to this page any time before you send.</p>
          {error && (
            <p className={noticeWarn} role="alert">
              {error}
            </p>
          )}
          {note && <p className={noticeOk}>{note}</p>}
          <div className="flex flex-wrap gap-3">
            <button className={cn(buttonDark, 'min-h-12 px-[22px] text-base')} disabled={busy} onClick={send} type="button">
              {busy ? 'Sending…' : 'Send to WUWF'}
            </button>
            <button className={cn(buttonSecondary, 'min-h-12 px-[22px] text-base')} disabled={busy || !dirty} onClick={save} type="button">
              Save for later
            </button>
          </div>
        </section>
      )}
      <Link className="self-start text-sm font-bold" href="/listens">
        Back to WUWF Listens
      </Link>
    </div>
  )
}
