"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { QuestionChip } from "../../question-chip";
import {
  THEME_DEFINITION_MAX,
  THEME_MEMO_MAX,
  THEME_TITLE_MAX,
  type Stance,
  type ThemeStatus,
} from "@/lib/sourcework/themes";
import {
  addDataPointToTheme,
  editTheme,
  removeDataPointFromTheme,
  reviewTheme,
  saveThemeMemo,
  setDataPointStance,
} from "../../../theme-actions";

/** The ⋮ beside the theme's title. Rejecting asks first and says what it does. */
export function ThemeMenu({
  themeId,
  status,
  editHref,
  backHref,
}: {
  themeId: string;
  status: ThemeStatus;
  editHref: string;
  backHref: string;
}) {
  const router = useRouter();
  const items: ActionMenuItem[] = [{ label: "Edit wording", href: editHref }];
  if (status === "rejected") {
    items.push({
      label: "Put back for review",
      onClick: async () => {
        const result = await reviewTheme({ id: themeId, decision: "undo" });
        if (!result.ok) return { error: result.error };
        router.refresh();
      },
    });
  } else {
    items.push({
      label: status === "suggested" ? "Reject" : "Reject theme…",
      variant: "danger",
      dividerBefore: true,
      confirm: {
        message:
          "The theme is hidden and its data points go back to the unfiled pool. It isn’t proposed again, and you can put it back from the Rejected filter.",
        confirmLabel: "Reject theme",
      },
      onClick: async () => {
        const result = await reviewTheme({ id: themeId, decision: "reject" });
        if (!result.ok) return { error: result.error };
        router.push(backHref);
      },
    });
  }
  return <ActionMenu label="Theme actions" items={items} sheetHeading="This theme" />;
}

/** Rewords the theme. Saving a suggestion accepts it, the way editing a data point does. */
export function ThemeEditForm({
  themeId,
  status,
  title,
  definition,
  doneHref,
}: {
  themeId: string;
  status: ThemeStatus;
  title: string;
  definition: string;
  doneHref: string;
}) {
  const router = useRouter();
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDefinition, setDraftDefinition] = useState(definition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await editTheme({ id: themeId, title: draftTitle, definition: draftDefinition });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(doneHref);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex max-w-2xl flex-col gap-3 rounded border border-brand-primary bg-white p-4 ring-2 ring-brand-surface"
    >
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="theme-title">Theme</Label>
        <Input
          id="theme-title"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          maxLength={THEME_TITLE_MAX}
          required
          autoFocus
        />
        <p className="mt-1 text-xs text-ink-500">
          A statement the sources can bear out or push against, not a topic.
        </p>
      </div>
      <div>
        <Label htmlFor="theme-definition">What it claims</Label>
        <Textarea
          id="theme-definition"
          value={draftDefinition}
          onChange={(event) => setDraftDefinition(event.target.value)}
          rows={3}
          maxLength={THEME_DEFINITION_MAX}
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy} className="max-lg:min-h-11">
          {status === "suggested" ? "Save and accept" : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => router.replace(doneHref)}
          className="max-lg:min-h-11"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The reporter's own notes. Review themes never reads or writes them. */
export function ThemeMemo({ themeId, memo }: { themeId: string; memo: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await saveThemeMemo({ id: themeId, memo: draft });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="rounded border border-line bg-white">
      <div className="flex items-center border-b border-line px-5 py-3 text-sm font-bold text-ink-900">
        <span className="flex-1">Memo</span>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(memo);
              setEditing(true);
            }}
            className="px-1 font-bold text-brand-link hover:underline max-lg:min-h-11"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 px-5 py-4">
          <Textarea
            aria-label="Memo"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            maxLength={THEME_MEMO_MAX}
            autoFocus
          />
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={busy}
              className="max-lg:min-h-11"
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="max-lg:min-h-11"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : memo ? (
        <p className="whitespace-pre-line px-5 py-4 text-[13px] text-ink-700">{memo}</p>
      ) : (
        <p className="px-5 py-4 text-[13px] italic text-ink-400">
          No memo yet. Use it for what you want to ask next or why this theme matters.
        </p>
      )}
      <p className="border-t border-line px-5 py-2 text-xs text-ink-400">
        Only people edit this. Review themes never does.
      </p>
    </div>
  );
}

/** The ⋮ on one piece of evidence: flip its stance, or take it out of the theme. */
export function EvidenceMenu({
  themeId,
  dataPointId,
  stance,
}: {
  themeId: string;
  dataPointId: string;
  stance: Stance;
}) {
  const router = useRouter();
  const other: Stance = stance === "supports" ? "complicates" : "supports";
  return (
    <ActionMenu
      label="Data point actions"
      trigger="quiet"
      sheetHeading="This data point"
      items={[
        {
          label: other === "complicates" ? "Mark as complicating" : "Mark as supporting",
          onClick: async () => {
            const result = await setDataPointStance({ themeId, dataPointId, stance: other });
            if (!result.ok) return { error: result.error };
            router.refresh();
          },
        },
        {
          label: "Remove from theme",
          variant: "danger",
          dividerBefore: true,
          confirm: {
            message:
              "It goes back to the unfiled pool and isn’t put back in this theme by a later run. You can add it again from this page.",
            confirmLabel: "Remove from theme",
          },
          onClick: async () => {
            const result = await removeDataPointFromTheme({ themeId, dataPointId });
            if (!result.ok) return { error: result.error };
            router.refresh();
          },
        },
      ]}
    />
  );
}

export interface AddablePoint {
  id: string;
  claim: string;
  sourceTitle: string;
  questionLabel: string | null;
  questionHint?: string;
}

/** Puts accepted data points into the theme by hand (§2.8: do by hand first). */
export function AddPointsPanel({
  themeId,
  candidates,
}: {
  themeId: string;
  candidates: AddablePoint[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const matching = candidates.filter(
    (point) =>
      needle === "" || `${point.claim} ${point.sourceTitle}`.toLowerCase().includes(needle),
  );
  const shown = matching.slice(0, 8);

  async function add(id: string, stance: Stance) {
    setBusyId(id);
    setError(null);
    const result = await addDataPointToTheme({ themeId, dataPointId: id, stance });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <details className="group rounded border border-line bg-white">
      <summary className="cursor-pointer list-none px-5 py-3 text-sm font-bold text-brand-link max-lg:min-h-11 max-lg:py-3.5">
        Add data points
        <span className="ml-2 font-normal text-ink-500">
          {candidates.length} accepted {candidates.length === 1 ? "point" : "points"} not in this
          theme
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        <Input
          type="search"
          aria-label="Search data points"
          placeholder="Search accepted data points"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        {shown.length === 0 ? (
          <p className="text-sm text-ink-500">No data point matches.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {shown.map((point) => (
              <li
                key={point.id}
                className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-900">{point.claim}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                    <QuestionChip label={point.questionLabel} title={point.questionHint} />
                    {point.sourceTitle}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === point.id}
                    onClick={() => void add(point.id, "supports")}
                    className="max-lg:min-h-11"
                  >
                    Supports
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === point.id}
                    onClick={() => void add(point.id, "complicates")}
                    className="max-lg:min-h-11"
                  >
                    Complicates
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {matching.length > shown.length && (
          <p className="text-xs text-ink-500">
            Showing {shown.length} of {matching.length}. Search to narrow the list.
          </p>
        )}
      </div>
    </details>
  );
}
