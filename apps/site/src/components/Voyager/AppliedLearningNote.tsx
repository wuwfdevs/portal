import Link from 'next/link'
import React from 'react'

/**
 * Shown on a Voyager story, after the body: why this work is a student's. Short on purpose; it explains the value of applied
 * learning and points to the paper, and claims nothing about a particular story.
 */
export const AppliedLearningNote: React.FC = () => (
  <aside aria-labelledby="applied-learning-heading" className="flex flex-col gap-2 rounded-sm border-l-4 border-voyager-green bg-voyager-green-100 p-6">
    <h2 className="text-xs font-bold uppercase tracking-widest text-voyager-green" id="applied-learning-heading">
      Applied learning at The Voyager
    </h2>
    <p className="font-serif text-xl font-bold text-ink">Real reporting, by students, for a real audience.</p>
    <p className="text-base text-ink-2">
      The Voyager is the student newspaper of the University of West Florida, published on the WUWF platform. Its reporters and editors learn
      by doing the work: finding the story, checking it, and standing behind it in public.
    </p>
    <Link className="inline-flex min-h-11 items-center self-start font-bold text-voyager-green underline underline-offset-4" href="/voyager">
      Read more from The Voyager
    </Link>
  </aside>
)
