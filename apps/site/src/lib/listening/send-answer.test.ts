import { describe, expect, it, vi } from 'vitest'

import { putToSignedUrl, saveAudioAnswer, type AnswerSteps } from './send-answer'

const UPLOAD = { url: 'https://storage.example/upload?token=t', method: 'PUT' as const, headers: { 'content-type': 'audio/webm', 'x-upsert': 'true' }, expiresAt: '2026-11-09T20:00:00Z' }
const input = (blob = new Blob(['audio-bytes'], { type: 'audio/webm;codecs=opus' })) => ({ submissionId: 's', questionId: 'q', blob, durationMs: 4200 })

function steps(overrides: Partial<AnswerSteps> = {}): AnswerSteps & { order: string[] } {
  const order: string[] = []
  return {
    order,
    reserve: vi.fn(async () => {
      order.push('reserve')
      return { ok: true as const, answerId: 'a1', upload: UPLOAD }
    }),
    upload: vi.fn(async () => {
      order.push('upload')
      return true
    }),
    complete: vi.fn(async () => {
      order.push('complete')
      return { ok: true as const }
    }),
    ...overrides,
  }
}

describe('saveAudioAnswer', () => {
  it('reserves, uploads, then completes, in that order, naming the bare content type', async () => {
    const s = steps()
    const result = await saveAudioAnswer(s, input())
    expect(result).toEqual({ ok: true, answerId: 'a1' })
    expect(s.order).toEqual(['reserve', 'upload', 'complete'])
    expect(s.reserve).toHaveBeenCalledWith({ submissionId: 's', questionId: 'q', contentType: 'audio/webm' })
    expect(s.complete).toHaveBeenCalledWith({ answerId: 'a1', sizeBytes: 11, durationMs: 4200 })
  })

  it('does not say saved when the upload failed, and never completes', async () => {
    const s = steps({ upload: vi.fn(async () => false) })
    expect(await saveAudioAnswer(s, input())).toMatchObject({ ok: false, code: 'unavailable' })
    expect(s.complete).not.toHaveBeenCalled()
  })

  it('stops at a refusal from the Portal, before uploading', async () => {
    const s = steps({ reserve: vi.fn(async () => ({ ok: false as const, code: 'submission_limit' as const, message: 'x' })) })
    expect(await saveAudioAnswer(s, input())).toMatchObject({ ok: false, code: 'submission_limit' })
    expect(s.upload).not.toHaveBeenCalled()
  })

  it("passes the Portal's refusal at completion through, with the answer not saved", async () => {
    const s = steps({ complete: vi.fn(async () => ({ ok: false as const, code: 'too_long' as const, message: 'x' })) })
    expect(await saveAudioAnswer(s, input())).toMatchObject({ ok: false, code: 'too_long' })
  })

  it('refuses an empty recording without calling the Portal', async () => {
    const s = steps()
    expect(await saveAudioAnswer(s, input(new Blob([], { type: 'audio/webm' })))).toMatchObject({ ok: false, code: 'invalid_size' })
    expect(s.reserve).not.toHaveBeenCalled()
  })
})

describe('putToSignedUrl', () => {
  it('puts the blob as a raw body with exactly the headers it was given', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const blob = new Blob(['x'], { type: 'audio/webm' })
    expect(await putToSignedUrl(UPLOAD, blob, fetchImpl as unknown as typeof fetch)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(UPLOAD.url, { method: 'PUT', headers: UPLOAD.headers, body: blob })
  })

  it('reports a refusal or a network failure as false', async () => {
    expect(await putToSignedUrl(UPLOAD, new Blob(['x']), (async () => new Response(null, { status: 403 })) as unknown as typeof fetch)).toBe(false)
    expect(await putToSignedUrl(UPLOAD, new Blob(['x']), (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toBe(false)
  })
})
