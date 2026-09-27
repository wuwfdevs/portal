"use client";

import { useState } from "react";
import { FieldHint, Label, Textarea } from "@/components/ui/input";
import { countWords, estimateReadSeconds, READ_WORDS_PER_MINUTE } from "@/lib/log/read-time";

/**
 * The script textarea with its read-time estimate updating as the words
 * are typed — the same arithmetic (lib/log/read-time.ts) the action stores
 * as the copy's duration when the timed length is left blank, so what the
 * staffer sees is what will be planned. Client-side only for the live
 * number; the field itself is an ordinary Textarea in an ordinary form.
 */
export function ScriptField({
  id,
  name = "script",
  defaultValue,
  rows = 5,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  rows?: number;
}) {
  const [script, setScript] = useState(defaultValue ?? "");
  const words = countWords(script);
  const seconds = estimateReadSeconds(script);
  return (
    <div>
      <Label htmlFor={id}>Script</Label>
      <Textarea
        id={id}
        name={name}
        rows={rows}
        value={script}
        onChange={(event) => setScript(event.target.value)}
        placeholder="Support for WUWF comes from…"
      />
      <FieldHint>
        {seconds === null ? (
          <>A live read is planned at its estimated read time when the timed length is left blank.</>
        ) : (
          <>
            <span className="font-bold text-ink-700">~{seconds}s</span> at {READ_WORDS_PER_MINUTE}{" "}
            words per minute · {words} word{words === 1 ? "" : "s"} · parenthesized host directions
            aren&apos;t counted
          </>
        )}
      </FieldHint>
    </div>
  );
}
