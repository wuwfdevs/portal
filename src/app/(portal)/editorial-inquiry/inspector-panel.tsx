"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { MOBILE_SAFE_TEXT_SIZE, Textarea } from "@/components/ui/input";
import {
  EVIDENTIARY_STATUSES,
  labelForDepth,
  labelForDiagnosis,
  labelForEvidentiaryStatus,
  type ContextNoteKind,
  type EvidentiaryStatus,
  type QuestionRecord,
} from "@/lib/editorial-inquiry/tree";
import { DIRECTIVE_LABELS, directiveForBody } from "@/lib/editorial-inquiry/directives";
import type { ChatMessageRecord } from "@/lib/editorial-inquiry/queries";

export interface InheritedNoteView {
  id: string;
  kind: ContextNoteKind;
  body: string;
  evidentiaryStatus: EvidentiaryStatus;
  sourceTitle: string | null;
  sourceUrl: string | null;
  inherited: boolean;
  sourceLabel: string | null;
}

export type BusyKind = "branch" | "drilldown" | "evaluate" | "reject" | "promote" | null;

export type PanelView = "discussion" | "context";

export interface InspectorPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selected: QuestionRecord | null;

  /** Which of the two panel views shows — owned by the workspace so intent
   * (selecting a node vs. starting a turn) can drive it. */
  view: PanelView;
  onViewChange: (view: PanelView) => void;

  contextNotes: InheritedNoteView[];
  contextPanelOpen: boolean;
  onOpenContextPanel: () => void;
  onCloseContextPanel: () => void;
  contextType: ContextNoteKind;
  onContextTypeChange: (kind: ContextNoteKind) => void;
  contextEvidentiaryStatus: EvidentiaryStatus;
  onContextEvidentiaryStatusChange: (status: EvidentiaryStatus) => void;
  contextText: string;
  onContextTextChange: (value: string) => void;
  onSaveContext: () => void;
  savingContext: boolean;

  canBranch: boolean;
  canDrillDown: boolean;
  canReject: boolean;
  canPromote: boolean;
  busy: BusyKind;
  onBranch: () => void;
  onDrillDown: () => void;
  onEvaluate: () => void;
  onReject: () => void;
  onPromote: () => void;

  manualAddOpen: "sibling" | "child" | null;
  onOpenManualAdd: (kind: "sibling" | "child") => void;
  onCloseManualAdd: () => void;
  manualAddText: string;
  onManualAddTextChange: (value: string) => void;
  onSubmitManualAdd: () => void;
  savingManualAdd: boolean;

  chatLog: ChatMessageRecord[] | null;
  chatLoading: boolean;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendChat: (presetText?: string) => void;
  chatSending: boolean;
  /** The reporter's own message currently in flight, shown optimistically. */
  inFlightChatText: string | null;
  /** The model's reply streaming in for the selected question ("" until the first token). */
  streamingReply: string | null;
  onApplyReframe: (message: ChatMessageRecord) => void;
  applyingReframeId: string | null;

  canDevelopIntoPitch: boolean;
  onDevelopIntoPitch: () => void;
  developingIntoPitch: boolean;

  error: string | null;
}

const CONTEXT_TYPE_OPTIONS: { value: ContextNoteKind; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "link", label: "Link" },
  { value: "excerpt", label: "Excerpt" },
];

const SUGGESTION_CHIPS = [
  "What's developing right now that bears on this?",
  "What would make this a stronger story question?",
];

export function InspectorPanel(props: InspectorPanelProps) {
  const { collapsed, onToggleCollapsed } = props;

  return (
    <div
      className="relative flex-shrink-0 border-l border-line bg-white transition-[width]"
      style={{ width: collapsed ? 0 : 380 }}
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
        {/* SelectedPanel scrolls its own content and pins the composer to the
            bottom, so the input inviting the next move is always visible. */}
        <div className="h-full w-[380px]">
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-bold tracking-wider text-ink-400 uppercase">
      {children}
    </div>
  );
}

const COMPACT_BUTTON = "px-3 py-1.5 text-xs";

function PanelViewToggle({
  view,
  onChange,
  contextCount,
}: {
  view: PanelView;
  onChange: (view: PanelView) => void;
  contextCount: number;
}) {
  const options: { value: PanelView; label: string }[] = [
    { value: "discussion", label: "Discussion" },
    { value: "context", label: contextCount > 0 ? `Context (${contextCount})` : "Context" },
  ];
  return (
    <div className="flex gap-0.5 rounded border border-line bg-panel-50 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded px-2 py-1 text-[11px] font-semibold",
            view === option.value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SelectedPanel(props: InspectorPanelProps & { selected: QuestionRecord }) {
  const { selected, view } = props;
  const isPromoted = selected.status === "promoted";
  const badgeLabel = isPromoted ? "Story question" : labelForDepth(selected.depth);
  const actionsDisabled = props.busy !== null || props.chatSending;

  // Keep the newest exchange in view while a reply streams in or a message
  // lands on the thread already on screen.
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<{ questionId: string; count: number }>({ questionId: "", count: 0 });
  const chatCount = props.chatLog?.length ?? 0;
  const streamActive = props.streamingReply !== null || props.inFlightChatText !== null;
  useEffect(() => {
    const sameThread = lastSeen.current.questionId === selected.id;
    const grown = chatCount > lastSeen.current.count;
    if (sameThread && (streamActive || grown)) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    lastSeen.current = { questionId: selected.id, count: chatCount };
  }, [selected.id, chatCount, streamActive, props.streamingReply]);

  return (
    <div className="flex h-full flex-col">
      {/* The toggle stays fixed above the scroll area — Discussion is the
          pure conversational surface (thread + composer, nothing else);
          Context is the node's profile: what it is, its diagnosis, the
          actions on it, and its evidence. Which view shows is intent-driven
          from the workspace: selecting a node lands on Context ("what is
          this?"), starting a turn or clicking the canvas Discuss icon lands
          on Discussion. */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <PanelViewToggle
          view={view}
          onChange={props.onViewChange}
          contextCount={props.contextNotes.length}
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-5 pb-5">
          {props.error && (
            <div className="rounded border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
              {props.error}
            </div>
          )}

          {view === "discussion" ? (
            <DiscussThread {...props} />
          ) : (
            <ContextView
              {...props}
              selected={selected}
              isPromoted={isPromoted}
              badgeLabel={badgeLabel}
              actionsDisabled={actionsDisabled}
            />
          )}
        </div>
      </div>

      {view === "discussion" && <DiscussComposer {...props} />}
    </div>
  );
}

/**
 * The Context view — the selected node's profile: the question itself and
 * its diagnosis, the actions that operate on it, the reporter-authored
 * alternatives, and every context note on its branch.
 */
function ContextView(
  props: InspectorPanelProps & {
    selected: QuestionRecord;
    isPromoted: boolean;
    badgeLabel: string;
    actionsDisabled: boolean;
  },
) {
  const { selected, isPromoted, badgeLabel, actionsDisabled } = props;
  return (
    <>
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
        {selected.diagnosisKind && (
          <div className="mt-2 rounded bg-success-bg px-2.5 py-2 text-xs leading-relaxed text-brand-link">
            <span className="font-bold">{labelForDiagnosis(selected.diagnosisKind)}.</span>{" "}
            {selected.diagnosisNote}
          </div>
        )}
      </div>

      {isPromoted && <DevelopIntoPitch {...props} />}

      <div>
        <SectionLabel>Ask the model</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {props.canBranch && (
            <Button
              variant="secondary"
              className={COMPACT_BUTTON}
              onClick={props.onBranch}
              disabled={actionsDisabled}
              title="A genuinely different angle at this level, grounded in context or a fresh search"
            >
              {props.busy === "branch" ? "Branching…" : "Branch"}
            </Button>
          )}
          {props.canDrillDown && (
            <Button
              variant="secondary"
              className={COMPACT_BUTTON}
              onClick={props.onDrillDown}
              disabled={actionsDisabled}
              title="A narrower, more reportable question beneath this one"
            >
              {props.busy === "drilldown" ? "Drilling down…" : "Drill down"}
            </Button>
          )}
          <Button
            variant="secondary"
            className={COMPACT_BUTTON}
            onClick={props.onEvaluate}
            disabled={actionsDisabled}
            title="Is this well-formed and reportable — and would it make a strong WUWF story?"
          >
            {props.busy === "evaluate" ? "Evaluating…" : "Evaluate"}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
          Each runs in the Discussion view. The model works from this branch&apos;s context,
          searches for current developments, and can decline if the material doesn&apos;t support
          one.
        </p>
      </div>

      {(props.canPromote || props.canReject) && (
        <div>
          <SectionLabel>Your call</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {props.canPromote && (
              <Button
                className={cn(
                  COMPACT_BUTTON,
                  "bg-success-border text-ink-900 hover:bg-success-border/90",
                )}
                onClick={props.onPromote}
                disabled={actionsDisabled}
                title="Mark this as a validated story question"
              >
                {props.busy === "promote" ? "Promoting…" : "Promote"}
              </Button>
            )}
            {props.canReject && (
              <Button
                variant="secondary"
                className={cn(COMPACT_BUTTON, "border-danger text-danger hover:bg-danger/[0.06]")}
                onClick={props.onReject}
                disabled={actionsDisabled}
                title="Hide this question and everything under it — nothing is deleted"
              >
                {props.busy === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            )}
          </div>
        </div>
      )}

      <AddYourOwn {...props} />
      <ContextSection {...props} />
    </>
  );
}

/**
 * The reporter-authored alternatives, gathered on one muted line so they
 * don't compete with the primary actions: write a question by hand (the
 * model-unavailable fallback, design doc §13) or attach context.
 */
function AddYourOwn(props: InspectorPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {props.canBranch && (
          <button
            type="button"
            onClick={() => props.onOpenManualAdd("sibling")}
            className="text-brand-link hover:underline"
          >
            Write a sibling question
          </button>
        )}
        {props.canDrillDown && (
          <button
            type="button"
            onClick={() => props.onOpenManualAdd("child")}
            className="text-brand-link hover:underline"
          >
            Write a child question
          </button>
        )}
      </div>

      {props.manualAddOpen && (
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
            <Button variant="secondary" className={COMPACT_BUTTON} onClick={props.onCloseManualAdd}>
              Cancel
            </Button>
            <Button
              className={COMPACT_BUTTON}
              onClick={props.onSubmitManualAdd}
              disabled={!props.manualAddText.trim() || props.savingManualAdd}
            >
              {props.savingManualAdd ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Context view: every note on this branch (own + inherited — the
 * grounding everything else reasons from), plus the add form. Rendered as
 * its own view behind the panel's Discussion/Context toggle.
 */
function ContextSection(props: InspectorPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-400">
          {props.selected?.depth === 0
            ? "Covers the whole inquiry"
            : "This question and its branch"}
        </span>
        {!props.contextPanelOpen && (
          <button
            type="button"
            onClick={props.onOpenContextPanel}
            className="text-xs font-semibold text-brand-link hover:underline"
          >
            + Add context
          </button>
        )}
      </div>
      {props.contextNotes.length === 0 && !props.contextPanelOpen && (
        <p className="text-xs leading-relaxed text-ink-400">
          Nothing attached on this branch yet. Context is what grounds the model&apos;s reasoning —
          an observation, a document, something sources keep saying, a finding from its own
          searches.
        </p>
      )}
      {props.contextNotes.map((entry) => (
        <div
          key={entry.id}
          className="rounded border border-line bg-panel-50 px-2 py-1.5 text-xs text-ink-700"
        >
          {entry.inherited && entry.sourceLabel && (
            <div className="mb-0.5 text-[10px] text-ink-400">
              From &quot;{entry.sourceLabel}&quot;
            </div>
          )}
          <span className="mr-1 text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            {entry.kind}
          </span>
          <span className="mr-1 rounded-full bg-panel-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 uppercase">
            {labelForEvidentiaryStatus(entry.evidentiaryStatus)}
          </span>
          <div className="mt-1">{entry.body}</div>
          {entry.sourceUrl && (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-brand-link hover:underline"
            >
              {entry.sourceTitle ?? entry.sourceUrl}
            </a>
          )}
        </div>
      ))}

      {props.contextPanelOpen && (
        <div className="flex flex-col gap-2 rounded border border-line bg-panel-50 p-3">
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
          <div>
            <div className="mb-1 text-[10px] font-semibold tracking-wide text-ink-500 uppercase">
              How solid is this?
            </div>
            <select
              value={props.contextEvidentiaryStatus}
              onChange={(e) =>
                props.onContextEvidentiaryStatusChange(e.target.value as EvidentiaryStatus)
              }
              className={cn(
                "w-full rounded border border-line bg-white px-2 py-1.5 text-ink-900",
                MOBILE_SAFE_TEXT_SIZE,
              )}
            >
              {EVIDENTIARY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelForEvidentiaryStatus(status)}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            rows={3}
            value={props.contextText}
            onChange={(e) => props.onContextTextChange(e.target.value)}
            placeholder="Paste a note, link, or excerpt…"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              className={COMPACT_BUTTON}
              onClick={props.onCloseContextPanel}
            >
              Cancel
            </Button>
            <Button
              className={COMPACT_BUTTON}
              onClick={props.onSaveContext}
              disabled={!props.contextText.trim() || props.savingContext}
            >
              {props.savingContext ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_KIND_LABELS: Record<NonNullable<ChatMessageRecord["actionKind"]>, string> = {
  branch: "→ branched into a new sibling question",
  drilldown: "→ drilled down into a new child question",
  context: "→ attached as context on this branch",
  reframe: "→ proposed a reframe",
  diagnosis: "→ diagnosed this question",
  assessment: "→ editorial assessment",
};

/** What the working indicator says before the first token arrives, per mode. */
const WORKING_LABELS: Record<"branch" | "drilldown" | "evaluate" | "discuss", string> = {
  branch:
    "Looking for a genuinely different angle — checking this branch's context and searching for current developments…",
  drilldown:
    "Looking for a narrower, more reportable question — checking context and searching for current developments…",
  evaluate: "Weighing this as a story question against WUWF's current criteria…",
  discuss: "Reading your message — may search for current developments…",
};

function activeTurnMode(
  props: InspectorPanelProps,
): "branch" | "drilldown" | "evaluate" | "discuss" | null {
  if (props.busy === "branch" || props.busy === "drilldown" || props.busy === "evaluate") {
    return props.busy;
  }
  if (props.chatSending) return "discuss";
  return null;
}

function DiscussThread(props: InspectorPanelProps) {
  const turnMode = activeTurnMode(props);
  const threadEmpty = (props.chatLog?.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-2.5">
      {props.chatLoading && <div className="text-xs text-ink-400">Loading discussion…</div>}

      {threadEmpty && !props.chatLoading && !turnMode && (
        <p className="text-xs leading-relaxed text-ink-400">
          Two ways in: tell the model something you&apos;ve encountered — an observation, a
          document, something sources keep saying — or ask it to look for what&apos;s currently
          developing. Anything worth keeping can be attached as context or grown into the tree.
        </p>
      )}

      {props.chatLog && (
        <div className="flex flex-col gap-2.5">
          {props.chatLog.map((message) => (
            <ChatEntry key={message.id} message={message} props={props} />
          ))}
        </div>
      )}

      {/* The in-flight turn, rendered optimistically: what was asked, then
          the reply streaming in (or a working line until the first token). */}
      {turnMode && (
        <div className="flex flex-col gap-2.5">
          {turnMode === "discuss" && props.inFlightChatText && (
            <div className="flex flex-col items-end">
              <div className="max-w-[92%] rounded bg-brand-surface px-2.5 py-2 text-[13px] leading-snug whitespace-pre-wrap text-brand-link">
                {props.inFlightChatText}
              </div>
            </div>
          )}
          {turnMode !== "discuss" && (
            <div className="text-right text-[11px] text-ink-400 italic">
              ↳ {DIRECTIVE_LABELS[turnMode]}
            </div>
          )}
          <div className="flex flex-col items-start">
            {props.streamingReply ? (
              <div className="max-w-[92%] rounded bg-panel-50 px-2.5 py-2 text-[13px] leading-snug text-ink-700">
                <Markdown text={props.streamingReply} />
              </div>
            ) : (
              <div className="max-w-[92%] animate-pulse rounded bg-panel-50 px-2.5 py-2 text-xs leading-relaxed text-ink-500">
                {WORKING_LABELS[turnMode]}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatEntry({ message, props }: { message: ChatMessageRecord; props: InspectorPanelProps }) {
  // A canned Branch/Drill down/Evaluate directive is the reporter's button
  // click, not something they typed — a full quoted-back bubble read as
  // clutter, so it renders as one muted line instead.
  const directive = message.role === "user" ? directiveForBody(message.body) : null;
  if (directive) {
    return (
      <div className="text-right text-[11px] text-ink-400 italic">
        ↳ {DIRECTIVE_LABELS[directive]}
      </div>
    );
  }

  const hasBody = message.body.trim().length > 0;

  return (
    <div className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}>
      {hasBody && (
        <div
          className={cn(
            "max-w-[92%] rounded px-2.5 py-2 text-[13px] leading-snug",
            message.role === "user"
              ? "bg-brand-surface whitespace-pre-wrap text-brand-link"
              : message.actionKind === "diagnosis" || message.actionKind === "assessment"
                ? "bg-panel-100 text-ink-700"
                : "bg-panel-50 text-ink-700",
          )}
        >
          {message.role === "assistant" ? <Markdown text={message.body} /> : message.body}
        </div>
      )}
      {message.citations && message.citations.length > 0 && (
        <div className="mt-1 flex max-w-[92%] flex-col gap-0.5">
          <div className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            Sources
          </div>
          {message.citations.map((citation, index) => (
            <a
              key={`${citation.url}-${index}`}
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-[11px] text-brand-link hover:underline"
            >
              {citation.title}
            </a>
          ))}
        </div>
      )}
      {message.actionKind === "reframe" && !message.appliedAt && (
        <button
          type="button"
          onClick={() => props.onApplyReframe(message)}
          disabled={props.applyingReframeId === message.id}
          className="mt-1 rounded bg-brand-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {props.applyingReframeId === message.id ? "Applying…" : "Apply reframe to this question"}
        </button>
      )}
      {message.actionKind === "reframe" && message.appliedAt && (
        <div className="mt-1 text-[11px] text-ink-400">→ applied to this question</div>
      )}
      {message.actionKind &&
        message.actionKind !== "reframe" &&
        ACTION_KIND_LABELS[message.actionKind] && (
          <div className="mt-1 text-[11px] text-ink-400">
            {ACTION_KIND_LABELS[message.actionKind]}
          </div>
        )}
    </div>
  );
}

/**
 * Pinned to the panel's bottom edge, outside the scroll area — the input
 * inviting the next move is always visible, whatever's above it.
 */
function DiscussComposer(props: InspectorPanelProps) {
  const turnMode = activeTurnMode(props);
  const threadEmpty = (props.chatLog?.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-1.5 border-t border-line bg-white p-3">
      {threadEmpty && !turnMode && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => props.onSendChat(chip)}
              disabled={turnMode !== null}
              className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-ink-700 disabled:opacity-60"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={props.chatInput}
          onChange={(e) => props.onChatInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (props.chatInput.trim() && !turnMode) props.onSendChat();
            }
          }}
          placeholder="Share what you've encountered, or ask what's developing…"
          className={cn(
            "min-w-0 flex-1 rounded border border-line px-2.5 py-2 focus:border-brand-primary focus:outline-none",
            MOBILE_SAFE_TEXT_SIZE,
          )}
        />
        <Button
          className={COMPACT_BUTTON}
          onClick={() => props.onSendChat()}
          disabled={!props.chatInput.trim() || turnMode !== null}
        >
          {props.chatSending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function DevelopIntoPitch(props: InspectorPanelProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="text-xs font-bold text-ink-700">Develop into pitch</div>
      {props.canDevelopIntoPitch ? (
        <>
          <p className="text-[11px] leading-relaxed text-ink-400">
            Opens Editorial Planning&apos;s pitch form, prefilled with this question and what the
            inquiry knows — review and submit it there.
          </p>
          <Button onClick={props.onDevelopIntoPitch} disabled={props.developingIntoPitch}>
            {props.developingIntoPitch ? "Preparing…" : "Develop into pitch"}
          </Button>
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-400">
          Ask an administrator for Editorial Planning access to develop this into a pitch.
        </p>
      )}
    </div>
  );
}
