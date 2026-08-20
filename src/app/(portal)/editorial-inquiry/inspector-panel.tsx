"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  labelForDepth,
  type ContextNoteKind,
  type QuestionRecord,
} from "@/lib/editorial-inquiry/tree";
import type { ChatMessageRecord } from "@/lib/editorial-inquiry/queries";

export interface InheritedNoteView {
  id: string;
  kind: ContextNoteKind;
  body: string;
  inherited: boolean;
  sourceLabel: string | null;
}

export interface InspectorPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selected: QuestionRecord | null;

  contextNotes: InheritedNoteView[];
  contextPanelOpen: boolean;
  onOpenContextPanel: () => void;
  onCloseContextPanel: () => void;
  contextType: ContextNoteKind;
  onContextTypeChange: (kind: ContextNoteKind) => void;
  contextText: string;
  onContextTextChange: (value: string) => void;
  onSaveContext: () => void;
  savingContext: boolean;

  canExplore: boolean;
  canDrillDown: boolean;
  canReject: boolean;
  canPromote: boolean;
  busy: "explore" | "drill" | "reject" | "promote" | null;
  onExplore: () => void;
  onDrillDown: () => void;
  onReject: () => void;
  onPromote: () => void;

  manualAddOpen: "sibling" | "child" | null;
  onOpenManualAdd: (kind: "sibling" | "child") => void;
  onCloseManualAdd: () => void;
  manualAddText: string;
  onManualAddTextChange: (value: string) => void;
  onSubmitManualAdd: () => void;
  savingManualAdd: boolean;

  discussOpen: boolean;
  onToggleDiscuss: () => void;
  chatLog: ChatMessageRecord[] | null;
  chatLoading: boolean;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendChat: (presetText?: string) => void;
  chatSending: boolean;
  onApplyReframe: (message: ChatMessageRecord) => void;
  applyingReframeId: string | null;

  error: string | null;
}

const CONTEXT_TYPE_OPTIONS: { value: ContextNoteKind; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "link", label: "Link" },
  { value: "excerpt", label: "Excerpt" },
];

const SUGGESTION_CHIPS = [
  "This assumes the answer",
  "We already know this",
  "Suggest another angle",
];

export function InspectorPanel(props: InspectorPanelProps) {
  const { collapsed, onToggleCollapsed } = props;

  return (
    <div
      className="relative flex-shrink-0 border-l border-line bg-white transition-[width]"
      style={{ width: collapsed ? 0 : 340 }}
    >
      <button
        type="button"
        title={collapsed ? "Show inspector panel" : "Hide inspector panel"}
        onClick={onToggleCollapsed}
        className="absolute top-1/2 left-[-13px] z-10 flex h-11 w-[26px] -translate-y-1/2 items-center justify-center rounded border border-line bg-white text-ink-500 shadow-sm hover:bg-panel-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-3.5 w-3.5"
        >
          <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
        </svg>
      </button>
      <div className="h-full overflow-hidden">
        <div className="h-full w-[340px] overflow-y-auto">
          {props.selected ? <SelectedPanel {...props} selected={props.selected} /> : <EmptyPanel />}
        </div>
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="px-5 py-8 text-sm leading-relaxed text-ink-400">
      Select a question on the canvas. This panel stays put — pan and zoom around freely while a
      discussion is open.
    </div>
  );
}

function SelectedPanel(props: InspectorPanelProps & { selected: QuestionRecord }) {
  const { selected } = props;
  const isPromoted = selected.status === "promoted";
  const badgeLabel = isPromoted ? "Story question" : labelForDepth(selected.depth);

  return (
    <div className="flex flex-col gap-3.5 p-5">
      {props.error && (
        <div className="rounded border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
          {props.error}
        </div>
      )}

      <div>
        <div
          className={cn(
            "mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
            isPromoted ? "bg-success-border text-ink-900" : "bg-brand-surface text-brand-link",
          )}
        >
          {badgeLabel}
        </div>
        <div className="font-serif text-base leading-snug text-ink-900">{selected.text}</div>
        {selected.hasAssumption && (
          <div className="mt-2 rounded bg-success-bg px-2.5 py-2 text-xs leading-relaxed text-brand-link">
            Assumption: {selected.assumptionText}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={props.onExplore}
          disabled={!props.canExplore || props.busy !== null}
        >
          {props.busy === "explore" ? "Exploring…" : "Explore"}
        </Button>
        <Button
          variant="secondary"
          onClick={props.onDrillDown}
          disabled={!props.canDrillDown || props.busy !== null}
        >
          {props.busy === "drill" ? "Drilling down…" : "Drill down"}
        </Button>
        <Button variant="secondary" onClick={props.onToggleDiscuss}>
          {props.discussOpen ? "Close discussion" : "Discuss"}
        </Button>
        <Button
          variant="secondary"
          onClick={props.onReject}
          disabled={!props.canReject || props.busy !== null}
          className="border-danger text-danger hover:bg-danger/[0.06]"
        >
          {props.busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        <Button
          onClick={props.onPromote}
          disabled={!props.canPromote || props.busy !== null}
          className="bg-success-border text-ink-900 hover:bg-success-border/90"
        >
          {props.busy === "promote" ? "Promoting…" : "Promote"}
        </Button>
      </div>

      <ManualAdd {...props} />
      <ContextSection {...props} />
      {props.discussOpen && <DiscussSection {...props} />}
    </div>
  );
}

function ManualAdd(props: InspectorPanelProps) {
  if (!props.manualAddOpen) {
    return (
      <div className="flex flex-wrap gap-3 text-xs">
        {props.canExplore && (
          <button
            type="button"
            onClick={() => props.onOpenManualAdd("sibling")}
            className="text-brand-link hover:underline"
          >
            Type your own sibling question
          </button>
        )}
        {props.canDrillDown && (
          <button
            type="button"
            onClick={() => props.onOpenManualAdd("child")}
            className="text-brand-link hover:underline"
          >
            Type your own child question
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-line bg-panel-50 p-3">
      <div className="text-xs font-semibold text-ink-700">
        {props.manualAddOpen === "sibling" ? "New sibling question" : "New child question"}
      </div>
      <Textarea
        rows={2}
        value={props.manualAddText}
        onChange={(e) => props.onManualAddTextChange(e.target.value)}
        placeholder="Type the question…"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={props.onCloseManualAdd}>
          Cancel
        </Button>
        <Button
          onClick={props.onSubmitManualAdd}
          disabled={!props.manualAddText.trim() || props.savingManualAdd}
        >
          {props.savingManualAdd ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function ContextSection(props: InspectorPanelProps) {
  if (!props.contextPanelOpen) {
    return (
      <button
        type="button"
        onClick={props.onOpenContextPanel}
        className="self-start text-xs font-semibold text-brand-link hover:underline"
      >
        + Add context
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-line bg-panel-50 p-3">
      <div className="text-xs font-bold text-ink-700">
        {props.selected?.depth === 0 ? "Context — whole inquiry" : "Context — this branch"}
      </div>
      {props.contextNotes.map((entry) => (
        <div
          key={entry.id}
          className="rounded border border-line bg-white px-2 py-1.5 text-xs text-ink-700"
        >
          {entry.inherited && entry.sourceLabel && (
            <div className="mb-0.5 text-[10px] text-ink-400">
              From &quot;{entry.sourceLabel}&quot;
            </div>
          )}
          <span className="mr-1 text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            {entry.kind}
          </span>
          {entry.body}
        </div>
      ))}
      <div className="flex gap-1.5">
        {CONTEXT_TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onContextTypeChange(option.value)}
            className={cn(
              "flex-1 rounded border border-line py-1 text-[11px]",
              props.contextType === option.value
                ? "bg-brand-primary text-white"
                : "bg-white text-ink-700",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Textarea
        rows={3}
        value={props.contextText}
        onChange={(e) => props.onContextTextChange(e.target.value)}
        placeholder="Paste a note, link, or excerpt…"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={props.onCloseContextPanel}>
          Cancel
        </Button>
        <Button
          onClick={props.onSaveContext}
          disabled={!props.contextText.trim() || props.savingContext}
        >
          {props.savingContext ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function DiscussSection(props: InspectorPanelProps) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3">
      <div className="text-xs font-bold text-ink-700">Discuss this question</div>

      {props.chatLoading && <div className="text-xs text-ink-400">Loading discussion…</div>}

      {props.chatLog && (
        <div className="flex flex-col gap-2.5">
          {props.chatLog.map((message) => (
            <div
              key={message.id}
              className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[88%] rounded px-2.5 py-2 text-[13px] leading-snug",
                  message.role === "user"
                    ? "bg-brand-surface text-brand-link"
                    : "bg-panel-50 text-ink-700",
                )}
              >
                {message.body}
              </div>
              {message.actionKind === "reframe" && !message.appliedAt && (
                <button
                  type="button"
                  onClick={() => props.onApplyReframe(message)}
                  disabled={props.applyingReframeId === message.id}
                  className="mt-1 rounded bg-brand-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {props.applyingReframeId === message.id
                    ? "Applying…"
                    : "Apply reframe to this question"}
                </button>
              )}
              {message.actionKind === "reframe" && message.appliedAt && (
                <div className="mt-1 text-[11px] text-ink-400">→ applied to this question</div>
              )}
              {message.actionKind === "sibling" && (
                <div className="mt-1 text-[11px] text-ink-400">
                  → added a sibling question to the tree
                </div>
              )}
              {message.actionKind === "context" && (
                <div className="mt-1 text-[11px] text-ink-400">
                  → attached as context on this branch
                </div>
              )}
            </div>
          ))}
          {props.chatLog.length === 0 && (
            <div className="text-xs text-ink-400">No discussion yet — say what you think.</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => props.onSendChat(chip)}
            disabled={props.chatSending}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-ink-700 disabled:opacity-60"
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={props.chatInput}
          onChange={(e) => props.onChatInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (props.chatInput.trim()) props.onSendChat();
            }
          }}
          placeholder="Tell the model what you think…"
          className="flex-1 rounded border border-line px-2.5 py-2 text-[13px] focus:border-brand-primary focus:outline-none"
        />
        <Button
          onClick={() => props.onSendChat()}
          disabled={!props.chatInput.trim() || props.chatSending}
        >
          {props.chatSending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
