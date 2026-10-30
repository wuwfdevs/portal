"use client";

// The "create a one-off live read" form, plus NPR "look-ahead" picking —
// one form, not two, since a look-ahead is still an ordinary live_read item
// (see rundown-actions.ts's createLiveReadItem). Needs "use client" only for
// the picker: clicking an NPR story pre-fills the title/script fields and
// stamps which story it came from, all still submitted through the same
// plain <form action={createLiveReadItem}>.
//
// No longer wraps itself in a <details> — it's now one of the two modes
// inside an insertion point (insertion-point.tsx), which controls its own
// visibility, so this component just renders the bare fields.
//
// "Keep in library" writes the read to the content library as well, so it's
// offered in tomorrow's picker instead of vanishing with this rundown — the
// up-front twin of the item card's after-the-fact "Save to library" (see
// rundown-actions.ts's saveLiveReadToLibrary). Hidden once an NPR look-ahead
// is picked: a story teaser is dated by nature.

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { estimateReadSeconds } from "@/lib/log/read-time";
import type { LogContentType } from "@/lib/database.types";
import { createLiveReadItem } from "../../rundown-actions";

export interface NprLookaheadItem {
  npr_item_id: string;
  title: string;
  teaser: string | null;
  /** Pre-formatted estimated station-local air time (e.g. "~07:49"), or null when no estimate could be derived — see lib/log/npr-story-times.ts. */
  estimatedTimeLabel: string | null;
}

export function LiveReadForm({
  rundownId,
  breakId,
  beforeItemId,
  nprItems,
}: {
  rundownId: string;
  breakId: string;
  beforeItemId: string | null;
  nprItems: NprLookaheadItem[];
}) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const estimatedSeconds = estimateReadSeconds(script);
  const [sourceNprItemId, setSourceNprItemId] = useState("");
  const [sourceNprItemTitle, setSourceNprItemTitle] = useState("");
  const [keepInLibrary, setKeepInLibrary] = useState(false);
  const isLookahead = sourceNprItemId !== "";

  const applyLookahead = (item: NprLookaheadItem) => {
    setTitle(`Look ahead: ${item.title}`);
    setScript(item.teaser ?? "");
    setSourceNprItemId(item.npr_item_id);
    setSourceNprItemTitle(item.title);
  };

  return (
    <div className="flex flex-col gap-2">
      {nprItems.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-500">
            Coming up after this break — use as look-ahead:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {nprItems.map((item) => (
              <Button
                key={item.npr_item_id}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applyLookahead(item)}
              >
                {item.estimatedTimeLabel && (
                  <span className="mr-1 font-mono font-normal text-ink-400 tabular-nums">
                    {item.estimatedTimeLabel}
                  </span>
                )}
                {item.title}
              </Button>
            ))}
          </div>
        </div>
      )}
      <form action={createLiveReadItem} className="flex flex-col gap-2">
        <input type="hidden" name="rundown_id" value={rundownId} />
        <input type="hidden" name="break_id" value={breakId} />
        <input type="hidden" name="before_item_id" value={beforeItemId ?? ""} />
        <input type="hidden" name="source_npr_item_id" value={sourceNprItemId} />
        <input type="hidden" name="source_npr_item_title" value={sourceNprItemTitle} />
        <Field label="Title" htmlFor={`live-title-${breakId}`}>
          <Input
            id={`live-title-${breakId}`}
            name="title"
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Script" htmlFor={`live-script-${breakId}`}>
          <Textarea
            id={`live-script-${breakId}`}
            name="script"
            rows={3}
            value={script}
            onChange={(event) => setScript(event.target.value)}
          />
        </Field>
        <Field label="Duration (s)" htmlFor={`live-duration-${breakId}`}>
          <Input
            id={`live-duration-${breakId}`}
            name="duration_seconds"
            type="number"
            min={1}
            // Left blank, the read-time estimate is used (createLiveReadItem).
            placeholder={estimatedSeconds !== null ? `~${estimatedSeconds}` : undefined}
            required={estimatedSeconds === null}
            className="w-24"
          />
        </Field>
        {!isLookahead && (
          <div className="flex flex-col gap-2">
            <CheckboxField
              name="keep_in_library"
              checked={keepInLibrary}
              onChange={(event) => setKeepInLibrary(event.target.checked)}
              label="Keep in the library for future rundowns"
              className="items-center"
            />
            {keepInLibrary && (
              <Field label="File it as" htmlFor={`live-library-type-${breakId}`}>
                <Select
                  id={`live-library-type-${breakId}`}
                  name="library_content_type"
                  defaultValue="host_created"
                  className="w-full sm:w-64"
                >
                  {(Object.keys(CONTENT_TYPE_LABEL) as LogContentType[]).map((type) => (
                    <option key={type} value={type}>
                      {CONTENT_TYPE_LABEL[type]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}
        <div>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending} size="sm">
      {pending ? "Adding…" : "Add live read"}
    </Button>
  );
}
