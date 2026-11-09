'use client'

import { completeAnswer, reserveAnswer } from '@/app/(frontend)/listens/actions'
import { putToSignedUrl, type AnswerSteps } from '@/lib/listening/send-answer'

/** The three steps of sending a recording, wired to the server actions and the browser's direct upload. */
export const answerSteps: AnswerSteps = {
  reserve: reserveAnswer,
  upload: (upload, blob) => putToSignedUrl(upload, blob),
  complete: completeAnswer,
}
