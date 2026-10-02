"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { controlClasses, FieldHint, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { isPortalAssignedCut } from "@/lib/underwriting/dad-cut";
import { searchDadCuts, type DadLibraryCut } from "./dad-cut-actions";

type Source = "new" | "existing";

/**
 * The copy form's "In DAD" fieldset: the DAD cut this message plays from.
 * "New recording" shows the cut the Portal assigned (or that one will be
 * assigned on save), with a way to type a different one; "Existing DAD
 * spot" searches DAD's library for a spot that's already recorded — the
 * Learning Minutes the script tells the host to play. Posts `dad_cut_source`
 * and `dad_cut`; copy-actions.ts decides what to store.
 */
export function DadCutField({
  idPrefix,
  currentCut,
  suggestedSpot,
}: {
  idPrefix: string;
  currentCut: string | null;
  /** The spot number the script names ("# 2 spot"), searched first in the existing-spot picker. */
  suggestedSpot: number | null;
}) {
  const startsExisting =
    currentCut !== null ? !isPortalAssignedCut(currentCut) : suggestedSpot !== null;
  const [source, setSource] = useState<Source>(startsExisting ? "existing" : "new");
  const [typing, setTyping] = useState(false);
  const portalCut = currentCut !== null && isPortalAssignedCut(currentCut) ? currentCut : null;
  const spotCut = currentCut !== null && !isPortalAssignedCut(currentCut) ? currentCut : null;

  return (
    <fieldset className="flex flex-col gap-3.5 rounded border border-line p-5">
      <legend className="px-1.5 text-sm font-bold text-ink-900">In DAD</legend>
      <p className="text-[13px] leading-relaxed text-ink-500">
        The recording DAD plays: the spot itself, or a live read&apos;s recorded version for hours
        with no host.
      </p>
      <input type="hidden" name="dad_cut_source" value={source} />
      <Segmented<Source>
        name={`${idPrefix}_dad_source`}
        value={source}
        onChange={setSource}
        options={[
          { value: "new", label: "New recording" },
          { value: "existing", label: "Existing DAD spot" },
        ]}
      />
      {source === "new" ? (
        <div className="flex flex-col gap-3 rounded bg-panel-50 p-4 sm:flex-row sm:items-center sm:gap-5">
          {typing ? (
            <div className="w-full max-w-[220px]">
              <Label htmlFor={`${idPrefix}_dad_cut`}>DAD cut</Label>
              <input
                id={`${idPrefix}_dad_cut`}
                name="dad_cut"
                defaultValue={portalCut ?? ""}
                placeholder="00013A"
                maxLength={6}
                className={cn(controlClasses, "font-mono")}
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink-500">DAD cut</span>
              <span className="font-mono text-2xl font-bold text-ink-900">
                {portalCut ?? "Assigned when you save"}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1 text-[13px] leading-snug text-ink-700">
            <span>
              {portalCut
                ? "Record the message into DAD under this number."
                : "The next free cut. Record the message into DAD under it."}
            </span>
            {!typing && (
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="w-fit text-left font-bold text-brand-link hover:underline"
              >
                Use a different cut
              </button>
            )}
          </div>
        </div>
      ) : (
        <ExistingSpotPicker
          id={`${idPrefix}_dad_spot`}
          defaultCut={spotCut}
          suggestedSpot={suggestedSpot}
        />
      )}
    </fieldset>
  );
}

function ExistingSpotPicker({
  id,
  defaultCut,
  suggestedSpot,
}: {
  id: string;
  defaultCut: string | null;
  suggestedSpot: number | null;
}) {
  const listId = useId();
  const [query, setQuery] = useState(defaultCut ?? "");
  const [chosen, setChosen] = useState<string | null>(defaultCut);
  const [results, setResults] = useState<DadLibraryCut[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const request = ++requestRef.current;
    const handle = setTimeout(async () => {
      const result = await searchDadCuts(query);
      if (request !== requestRef.current) return;
      if (!result.ok) {
        setError(result.error);
        setResults([]);
        return;
      }
      setError(null);
      setResults(rankBySpotNumber(result.cuts, suggestedSpot));
      setHighlight(-1);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, suggestedSpot]);

  function pick(cut: DadLibraryCut) {
    setChosen(cut.cut);
    setQuery(`${cut.cut} · ${cut.title}`);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => (results.length === 0 ? -1 : (index + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) =>
        results.length === 0 ? -1 : (index - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const target = results[highlight] ?? results[0];
      if (target) pick(target);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label htmlFor={id}>Search the DAD library</Label>
      <input type="hidden" name="dad_cut" value={chosen ?? ""} />
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        value={query}
        placeholder="Cut number or title, e.g. Dauphin"
        className={controlClasses}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setChosen(null);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="max-h-60 overflow-y-auto rounded border border-line bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3.5 py-2.5 text-sm text-ink-500">{error ?? "No matching cuts."}</li>
          ) : (
            results.map((cut, index) => (
              <li
                key={cut.cut}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(cut);
                }}
                className={cn(
                  "flex cursor-pointer items-baseline gap-3.5 px-3.5 py-2.5 text-sm",
                  index === highlight && "bg-brand-surface",
                )}
              >
                <span className="font-mono font-bold text-ink-900">{cut.cut}</span>
                <span className="flex-1 text-ink-900">{cut.title}</span>
                {cut.group && <span className="text-xs text-ink-500">{cut.group}</span>}
              </li>
            ))
          )}
        </ul>
      )}
      <FieldHint>
        {chosen
          ? `DAD plays cut ${chosen}.`
          : "For a spot that's already in DAD, like a Learning Minute in the PPA group."}
      </FieldHint>
    </div>
  );
}

/** The spot the script names first: a cut whose title carries that number ("Dauphin 2 …"). */
function rankBySpotNumber(cuts: DadLibraryCut[], spot: number | null): DadLibraryCut[] {
  if (spot === null) return cuts;
  const named = new RegExp(`\\b${spot}\\b`);
  return [...cuts].sort((a, b) => Number(named.test(b.title)) - Number(named.test(a.title)));
}
