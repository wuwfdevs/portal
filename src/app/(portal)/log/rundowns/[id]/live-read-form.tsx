"use client";

// The "create a one-off live read" form, plus NPR "look-ahead" picking —
// one form, not two, since a look-ahead is still an ordinary live_read item
// (see rundown-actions.ts's createLiveReadItem). Needs "use client" only for
// the picker: clicking an NPR story pre-fills the title/script fields and
// stamps which story it came from, all still submitted through the same
// plain <form action={createLiveReadItem}>.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createLiveReadItem } from "../../rundown-actions";

export interface NprLookaheadItem {
  npr_item_id: string;
  title: string;
  teaser: string | null;
}

export function LiveReadForm({
  rundownId,
  breakId,
  nprItems,
}: {
  rundownId: string;
  breakId: string;
  nprItems: NprLookaheadItem[];
}) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [sourceNprItemId, setSourceNprItemId] = useState("");
  const [sourceNprItemTitle, setSourceNprItemTitle] = useState("");

  const applyLookahead = (item: NprLookaheadItem) => {
    setTitle(`Look ahead: ${item.title}`);
    setScript(item.teaser ?? "");
    setSourceNprItemId(item.npr_item_id);
    setSourceNprItemTitle(item.title);
  };

  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-brand-link">
        Create a one-off live read
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {nprItems.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-500">Use as look-ahead:</span>
            <div className="flex flex-wrap gap-1.5">
              {nprItems.map((item) => (
                <button
                  key={item.npr_item_id}
                  type="button"
                  onClick={() => applyLookahead(item)}
                  className="rounded border border-line px-2 py-1 text-xs font-semibold text-brand-link hover:bg-panel-50"
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <form action={createLiveReadItem} className="flex flex-col gap-2">
          <input type="hidden" name="rundown_id" value={rundownId} />
          <input type="hidden" name="break_id" value={breakId} />
          <input type="hidden" name="source_npr_item_id" value={sourceNprItemId} />
          <input type="hidden" name="source_npr_item_title" value={sourceNprItemTitle} />
          <div>
            <Label htmlFor={`live-title-${breakId}`}>Title</Label>
            <Input
              id={`live-title-${breakId}`}
              name="title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`live-script-${breakId}`}>Script</Label>
            <Input
              id={`live-script-${breakId}`}
              name="script"
              value={script}
              onChange={(event) => setScript(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`live-duration-${breakId}`}>Duration (s)</Label>
            <Input
              id={`live-duration-${breakId}`}
              name="duration_seconds"
              type="number"
              required
              min={1}
              className="w-24"
            />
          </div>
          <div>
            <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
              Add live read
            </Button>
          </div>
        </form>
      </div>
    </details>
  );
}
