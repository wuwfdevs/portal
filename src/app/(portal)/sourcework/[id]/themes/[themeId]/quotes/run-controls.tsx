"use client";

import { SuggestQuotesButton, SuggestQuotesStatus, useSuggestQuotes } from "../suggest-quotes";

/** The run button and its progress for the suggested-quotes screen; a finished run refreshes the list in place. */
export function QuotesRunControls({
  projectId,
  themeId,
  label,
}: {
  projectId: string;
  themeId: string;
  label: string;
}) {
  const state = useSuggestQuotes({ projectId, themeId });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <SuggestQuotesButton state={state} label={label} className="max-lg:min-h-11" />
      </div>
      <SuggestQuotesStatus state={state} />
    </div>
  );
}
