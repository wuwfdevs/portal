'use client'

import React, { useState } from 'react'

import { EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedAllow } from '@/lib/embeds'

/** What a Feature's video is: a hosted video (the embed address `lib/embeds` resolved) or a file in the video library. */
export type FrameSource = { kind: 'embed'; src: string } | { kind: 'file'; url: string; mimeType?: string | null }

/**
 * A video in a picture's place (the hubs redesign: RadioLive's latest set). The still is the Feature's picture with a play disc on it; nothing from the video's host
 * is requested until the reader presses play (a real button, 44px or more), and then the frame is the site's own sandboxed embed, or the browser's own controls for
 * a file. The press is the play: the video starts, with no second press. Nothing plays before it. Without script the still stays, and the Feature's own buttons
 * (a link to the video) are still there.
 */
export function VideoFrame({ title, source, children }: { title: string; source: FrameSource; children?: React.ReactNode }) {
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return source.kind === 'embed' ? (
      <iframe
        allow={embedAllow('video')}
        allowFullScreen
        className="size-full border-0"
        referrerPolicy={EMBED_REFERRER_POLICY}
        sandbox={EMBED_SANDBOX}
        src={`${source.src}${source.src.includes('?') ? '&' : '?'}autoplay=1`}
        title={title}
      />
    ) : (
      <video aria-label={title} autoPlay className="size-full bg-ink" controls playsInline>
        <source src={source.url} type={source.mimeType ?? undefined} />
      </video>
    )
  }
  return (
    <div className="relative size-full bg-ink">
      {children}
      <button
        aria-label={`Play video: ${title}`}
        className="absolute left-1/2 top-1/2 inline-flex size-[4.25rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-wuwf-lime text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface"
        onClick={() => setPlaying(true)}
        type="button"
      >
        <svg aria-hidden="true" fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
          <path d="M7 4l14 8-14 8z" />
        </svg>
      </button>
    </div>
  )
}
