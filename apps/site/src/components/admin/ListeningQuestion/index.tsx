'use client'

import type { ListeningAuthoringQuery, ListeningAuthoringStatus, ListeningAuthoringSummary } from '@wuwf/portal-contracts'
import type { TextFieldClientComponent } from 'payload'

import { AUTHORING_MAX_QUESTIONS } from '@wuwf/portal-contracts'
import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import { publicIdFromInput } from '@/lib/listening/placement'

import { addQuestion, blankDraft, draftFromQuery, draftProblem, moveQuestion, removeQuestion, saveBody, STATUS_LABEL, statusActions, type QueryDraft } from './form'

/**
 * The block editor's "Listening query" field. A query is what staff write, open and close in the Portal; it holds one or more questions. The value stored is still
 * the query's 16-character code (nothing about the block's data changed); what changed is how an editor gets one. Pick a query the Portal already holds, or write a
 * new one right here, change it, and open or close it, without leaving the story. Everything goes through this site's server (`/api/listening-authoring/*`) to the Portal, which owns the
 * data and every rule: nothing is stored on the site, and a refusal shows the Portal's own sentence.
 *
 * A code or an address can still be pasted (the old way), for a query this editor's Portal account cannot list.
 */
const ENDPOINT = '/api/listening-authoring'

type Answer<T> = ({ ok: true } & T) | { ok: false; error: string; message: string }

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<Answer<T>> {
  try {
    const response = await fetch(`${ENDPOINT}/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const payload = (await response.json()) as Answer<T>
    return payload && typeof payload === 'object' && 'ok' in payload ? payload : { ok: false, error: 'unavailable', message: 'The answer could not be read.' }
  } catch {
    return { ok: false, error: 'unavailable', message: 'The site could not be reached. Nothing was changed.' }
  }
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, marginTop: 8, display: 'grid', gap: 10, background: 'var(--theme-elevation-50)' }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--theme-elevation-150)', borderRadius: 4, background: 'var(--theme-input-bg)', color: 'var(--theme-text)', font: 'inherit' }
const small: React.CSSProperties = { fontSize: 13, color: 'var(--theme-elevation-600)', margin: 0 }
const button = (primary = false): React.CSSProperties => ({ padding: '7px 12px', borderRadius: 4, border: '1px solid var(--theme-elevation-300)', background: primary ? 'var(--theme-elevation-800)' : 'transparent', color: primary ? 'var(--theme-elevation-0)' : 'var(--theme-text)', font: 'inherit', cursor: 'pointer' })

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      {children}
      {hint ? <span style={small}>{hint}</span> : null}
    </label>
  )
}

export const ListeningQuestion: TextFieldClientComponent = ({ path, field }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path })
  const code = publicIdFromInput(value)

  const [list, setList] = useState<ListeningAuthoringSummary[] | null>(null)
  const [listNote, setListNote] = useState<string | null>(null)
  const [loaded, setCurrent] = useState<ListeningAuthoringQuery | null>(null)
  // What was loaded counts only while it is the chosen question (clearing or changing the choice drops it without an effect).
  const current = loaded && loaded.publicId === code ? loaded : null
  const [draft, setDraft] = useState<QueryDraft | null>(null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void call<{ queries: ListeningAuthoringSummary[] }>('list').then((answer) => {
      setList(answer.ok ? answer.queries : null)
      setListNote(answer.ok ? null : answer.message)
    })
  }, [])

  useEffect(refresh, [refresh])

  // The chosen question's details, for its status and its Edit form.
  useEffect(() => {
    let live = true
    if (!code) return
    void call<{ query: ListeningAuthoringQuery }>('get', { publicId: code }).then((answer) => {
      if (live) setCurrent(answer.ok ? answer.query : null)
    })
    return () => {
      live = false
    }
  }, [code])

  const label = typeof field.label === 'string' ? field.label : 'Listening query'
  const description = typeof field.admin?.description === 'string' ? field.admin.description : undefined
  const startNew = () => {
    setEditingCode(null)
    setDraft(blankDraft())
    setMessage(null)
  }
  const startEdit = () => {
    if (!current) return
    setEditingCode(current.publicId)
    setDraft(draftFromQuery(current))
    setMessage(null)
  }

  const save = async () => {
    if (!draft) return
    const problem = draftProblem(draft)
    if (problem) return setMessage(problem)
    setBusy(true)
    const answer = await call<{ query: ListeningAuthoringQuery; created: boolean }>('save', saveBody(draft, editingCode))
    setBusy(false)
    if (!answer.ok) return setMessage(answer.message)
    setValue(answer.query.publicId)
    setCurrent(answer.query)
    setDraft(null)
    setMessage(answer.created ? 'Saved as a draft and chosen for this story. Open it to the public when it is ready.' : 'Saved.')
    refresh()
  }

  const changeStatus = async (status: ListeningAuthoringStatus) => {
    if (!code) return
    setBusy(true)
    const answer = await call<{ query: ListeningAuthoringQuery }>('set-status', { publicId: code, status })
    setBusy(false)
    if (!answer.ok) return setMessage(answer.message)
    setCurrent(answer.query)
    setMessage(null)
    refresh()
  }

  const update = (patch: Partial<QueryDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const locked = (current?.submissionCount ?? 0) > 0 && editingCode !== null

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <FieldLabel label={label} path={path} required={field.required} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          aria-label="Choose a listening query"
          disabled={list === null}
          onChange={(e) => {
            setValue(e.target.value)
            setDraft(null)
            setMessage(null)
          }}
          style={{ ...input, flex: '1 1 260px', width: 'auto' }}
          value={code ?? ''}
        >
          <option value="">{list === null ? 'Choose a query (not available with this account)' : 'Choose a query…'}</option>
          {code && !list?.some((q) => q.publicId === code) ? <option value={code}>{current ? current.publicTitle : code}</option> : null}
          {(list ?? []).map((q) => (
            <option key={q.publicId} value={q.publicId}>
              {q.publicTitle} — {q.status}
            </option>
          ))}
        </select>
        <button disabled={busy} onClick={startNew} style={button()} type="button">
          New query
        </button>
        {current && !draft ? (
          <button disabled={busy} onClick={startEdit} style={button()} type="button">
            Edit this query
          </button>
        ) : null}
      </div>
      {listNote ? <p style={{ ...small, marginTop: 6 }}>{listNote}</p> : null}

      {current && !draft ? (
        <div style={{ ...box, marginTop: 8 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{current.publicTitle}</p>
          <p style={small}>
            {STATUS_LABEL[current.status]} · {current.questions.length} question{current.questions.length === 1 ? '' : 's'} · {current.submissionCount} answered
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {statusActions(current.status).map((a) => (
              <button disabled={busy} key={a.to} onClick={() => void changeStatus(a.to)} style={button(a.to === 'open')} type="button">
                {a.label}
              </button>
            ))}
          </div>
          {current.status === 'draft' ? <p style={small}>Nobody sees this query until it is opened. A story that holds it shows nothing until then.</p> : null}
        </div>
      ) : null}

      {draft ? (
        <div style={box}>
          <p style={{ margin: 0, fontWeight: 600 }}>{editingCode ? 'Edit this query' : 'A new query'}</p>
          {locked ? <p style={small}>People have already answered, so the questions can be reworded but not removed or reordered.</p> : null}
          <Labeled hint="For staff in the Portal. People never see it." label="Internal title">
            <input maxLength={200} onChange={(e) => update({ internalTitle: e.target.value })} style={input} value={draft.internalTitle} />
          </Labeled>
          <Labeled hint="The headline people see." label="Public title">
            <input maxLength={200} onChange={(e) => update({ publicTitle: e.target.value })} style={input} value={draft.publicTitle} />
          </Labeled>
          <Labeled hint="A sentence or two: why you are asking, what happens to the answers." label="Introduction">
            <textarea maxLength={2000} onChange={(e) => update({ publicIntro: e.target.value })} rows={3} style={input} value={draft.publicIntro} />
          </Labeled>

          <p style={{ margin: 0, fontWeight: 600 }}>Questions</p>
          {draft.questions.map((q, i) => (
            <div key={q.id ?? `new-${i}`} style={{ ...box, marginTop: 0, background: 'var(--theme-bg)' }}>
              <Labeled label={`Question ${i + 1}`}>
                <textarea
                  maxLength={500}
                  onChange={(e) => update({ questions: draft.questions.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)) })}
                  rows={2}
                  style={input}
                  value={q.prompt}
                />
              </Labeled>
              <Labeled hint="Optional. A hint on how to answer." label="Guidance">
                <input
                  maxLength={500}
                  onChange={(e) => update({ questions: draft.questions.map((x, j) => (j === i ? { ...x, guidance: e.target.value } : x)) })}
                  style={input}
                  value={q.guidance}
                />
              </Labeled>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                <Labeled label="Longest recording (seconds)">
                  <input
                    inputMode="numeric"
                    onChange={(e) => update({ questions: draft.questions.map((x, j) => (j === i ? { ...x, seconds: e.target.value } : x)) })}
                    style={{ ...input, width: 110 }}
                    value={q.seconds}
                  />
                </Labeled>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input checked={q.required} onChange={(e) => update({ questions: draft.questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} type="checkbox" />
                  Required
                </label>
                {!locked ? (
                  <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => setDraft(moveQuestion(draft, i, -1))} style={button()} type="button">
                      ↑
                    </button>
                    <button aria-label={`Move question ${i + 1} down`} disabled={i === draft.questions.length - 1} onClick={() => setDraft(moveQuestion(draft, i, 1))} style={button()} type="button">
                      ↓
                    </button>
                    <button onClick={() => setDraft(removeQuestion(draft, i))} style={button()} type="button">
                      Remove
                    </button>
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          <div>
            <button disabled={draft.questions.length >= AUTHORING_MAX_QUESTIONS} onClick={() => setDraft(addQuestion(draft))} style={button()} type="button">
              Add a question
            </button>
            <span style={{ ...small, marginLeft: 8 }}>Up to {AUTHORING_MAX_QUESTIONS}.</span>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>More: who is asking, when it is open, notes</summary>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <Labeled hint="Who is asking: “Leigh Ostrander”." label="Asked by">
                <input maxLength={120} onChange={(e) => update({ askedBy: e.target.value })} style={input} value={draft.askedBy} />
              </Labeled>
              <Labeled hint="Where it is from: “the WUWF News desk”." label="From">
                <input maxLength={120} onChange={(e) => update({ fromLabel: e.target.value })} style={input} value={draft.fromLabel} />
              </Labeled>
              <Labeled hint="What it belongs to: “After Isaias”." label="Part of">
                <input maxLength={120} onChange={(e) => update({ contextLabel: e.target.value })} style={input} value={draft.contextLabel} />
              </Labeled>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input checked={draft.allowTextAnswers} onChange={(e) => update({ allowTextAnswers: e.target.checked })} type="checkbox" />
                People may write an answer as well as record one
              </label>
              <Labeled hint="Optional. Leave both empty to open and close it by hand." label="Opens at">
                <input onChange={(e) => update({ opensAt: e.target.value })} style={input} type="datetime-local" value={draft.opensAt} />
              </Labeled>
              <Labeled label="Closes at">
                <input onChange={(e) => update({ closesAt: e.target.value })} style={input} type="datetime-local" value={draft.closesAt} />
              </Labeled>
              <Labeled hint="Staff only. Never shown to the public." label="Internal notes">
                <textarea maxLength={2000} onChange={(e) => update({ internalNotes: e.target.value })} rows={2} style={input} value={draft.internalNotes} />
              </Labeled>
              <p style={small}>Who is asked for a name or an email, the consent wording and transcription keep their usual settings; change them in the Portal.</p>
            </div>
          </details>

          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={() => void save()} style={button(true)} type="button">
              {busy ? 'Saving…' : editingCode ? 'Save changes' : 'Save as a draft and use it here'}
            </button>
            <button disabled={busy} onClick={() => { setDraft(null); setMessage(null) }} style={button()} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p aria-live="polite" role="status" style={{ ...small, marginTop: 8, color: 'var(--theme-text)' }}>
          {message}
        </p>
      ) : null}

      <details open={list === null && listNote !== null ? true : undefined} style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', ...small }}>Or paste a query’s code or address</summary>
        <input
          aria-label="Query code or address"
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…/listens/abcd1234efgh5678"
          style={{ ...input, marginTop: 6 }}
          value={value ?? ''}
        />
      </details>

      {showError ? <FieldError message={errorMessage} path={path} showError={showError} /> : null}
      {description ? <FieldDescription description={description} path={path} /> : null}
    </div>
  )
}
