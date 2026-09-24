"use client";

// Upload → preview → confirm for the DAD library import. The plan the
// preview renders is exactly the plan the confirm submits (serialized
// through state) — same discipline as the program-log importer's client.

import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import type { DadLibraryPlan } from "@/lib/log/dad-library-plan";
import {
  executeDadLibraryImport,
  parseDadLibraryUpload,
  type ExecuteDadLibraryImportResult,
} from "../import-actions";

const TREATMENT_LABEL: Record<string, string> = {
  direct: "imported",
  collapse: "collapsed into canonical promos",
  skip: "skipped",
  unknown: "skipped — unrecognized group",
};

export function ImportClient() {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const groupsInputRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<DadLibraryPlan | null>(null);
  const [result, setResult] = useState<ExecuteDadLibraryImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = () => {
    const libraryFile = libraryInputRef.current?.files?.[0];
    if (!libraryFile) {
      setError('Choose the DAD "Standard Library" export first.');
      return;
    }
    const formData = new FormData();
    formData.set("library_file", libraryFile);
    const groupsFile = groupsInputRef.current?.files?.[0];
    if (groupsFile) formData.set("groups_file", groupsFile);
    startTransition(async () => {
      setError(null);
      setResult(null);
      const response = await parseDadLibraryUpload(formData);
      if (response.ok) setPlan(response.plan);
      else setError(response.error);
    });
  };

  const confirm = () => {
    if (!plan) return;
    startTransition(async () => {
      setError(null);
      const response = await executeDadLibraryImport(JSON.stringify(plan));
      if (response.ok) {
        setResult(response);
        setPlan(null);
      } else {
        setError(response.error);
      }
    });
  };

  const newItems = plan?.directItems.filter((item) => item.existingItemId === null).length ?? 0;
  const updatedItems = plan?.directItems.filter((item) => item.existingItemId !== null).length ?? 0;
  const unmatchedPromoItems = plan?.directItems.filter((item) => item.unmatchedProgramPromo) ?? [];
  const newPromos = plan?.synthesizedPromos.filter((promo) => promo.existingItemId === null).length ?? 0;
  const updatedPromos = plan?.synthesizedPromos.filter((promo) => promo.existingItemId !== null).length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert variant="danger">{error}</Alert>}

      {result?.ok && (
        <div className="rounded border border-line bg-panel-50 p-4">
          <h2 className="text-sm font-bold text-ink-900">Import complete</h2>
          <p className="mt-1 text-sm text-ink-700">
            {result.itemsCreated} item{result.itemsCreated === 1 ? "" : "s"} created ·{" "}
            {result.itemsUpdated} updated · {result.promosCreated} canonical promo
            {result.promosCreated === 1 ? "" : "s"} created · {result.promosUpdated} updated.
          </p>
          {result.failures.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-xs text-danger-700">
              {result.failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!plan && (
        <div className="flex flex-col items-start gap-3 rounded border border-line p-4">
          <label className="flex flex-col gap-1 text-sm">
            Standard Library export (required)
            <input
              ref={libraryInputRef}
              type="file"
              accept=".txt,.rep,text/plain"
              className={cn(controlClasses, "max-w-md")}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Groups report (optional)
            <input
              ref={groupsInputRef}
              type="file"
              accept=".txt,.rep,text/plain"
              className={cn(controlClasses, "max-w-md")}
            />
          </label>
          <Button type="button" onClick={upload} disabled={pending}>
            {pending ? "Reading…" : "Preview import"}
          </Button>
        </div>
      )}

      {plan && (
        <>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending
                ? "Importing…"
                : `Import ${newItems + updatedItems + newPromos + updatedPromos} item(s)`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPlan(null);
                setError(null);
              }}
              disabled={pending}
            >
              Start over
            </Button>
          </div>

          {plan.warnings.length > 0 && (
            <Alert variant="note">
              <ul className="list-disc pl-4">
                {plan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          )}

          <section className="rounded border border-line">
            <h3 className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
              Groups
            </h3>
            <ul className="divide-y divide-line">
              {plan.groupSummaries.map((summary) => (
                <li
                  key={summary.group}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <span className="text-sm font-semibold text-ink-900">{summary.group}</span>
                  <span className="text-xs text-ink-500">
                    {summary.cutCount} cut{summary.cutCount === 1 ? "" : "s"} —{" "}
                    {TREATMENT_LABEL[summary.treatment]}
                    {summary.contentType && ` as ${CONTENT_TYPE_LABEL[summary.contentType]}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border border-line">
            <h3 className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
              Canonical program promos
            </h3>
            <ul className="divide-y divide-line">
              {plan.synthesizedPromos.map((promo) => (
                <li key={promo.programId} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-ink-900">{promo.programName}</span>
                    <span className="text-xs text-ink-500">
                      {promo.sourceCutCount} DAD cut{promo.sourceCutCount === 1 ? "" : "s"} · from{" "}
                      {promo.dadGroup}
                    </span>
                    <Badge variant={promo.existingItemId ? "neutral" : "success"}>
                      {promo.existingItemId ? "will update" : "new"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{promo.tagScript}</p>
                </li>
              ))}
              {plan.synthesizedPromos.length === 0 && (
                <li className="px-4 py-2.5 text-sm text-ink-500">No program promos matched a Log program.</li>
              )}
            </ul>
          </section>

          {unmatchedPromoItems.length > 0 && (
            <section className="rounded border border-line">
              <h3 className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
                Generic/daily/weekly cuts with no matching program ({unmatchedPromoItems.length})
              </h3>
              <p className="border-b border-line px-4 py-2 text-xs text-ink-500">
                Imported individually as station promos rather than collapsed into a canonical promo.
              </p>
              <ul className="divide-y divide-line">
                {unmatchedPromoItems.map((item) => (
                  <li key={item.cutNumber} className="px-4 py-2 text-xs text-ink-700">
                    <span className="font-mono">{item.cutNumber}</span>{" "}
                    <span className="font-semibold">{item.title}</span>{" "}
                    <span className="text-ink-500">— {item.group}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
