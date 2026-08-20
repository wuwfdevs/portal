"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  canBranch as canBranchRule,
  canDrillDown as canDrillDownRule,
  canPromote as canPromoteRule,
  canReject as canRejectRule,
  computeTreeLayout,
  contextNoteCount,
  inheritedContextNotes,
  type ContextNoteKind,
  type ContextNoteRecord,
  type EvidentiaryStatus,
  type QuestionRecord,
} from "@/lib/editorial-inquiry/tree";
import type {
  ChatMessageRecord,
  InquiryDetail,
  InquirySummary,
} from "@/lib/editorial-inquiry/queries";
import type { EditorialTurnOutcome, EditorialTurnStreamEvent } from "@/lib/editorial-inquiry/turn";
import type { GuidingQuestionOption } from "@/lib/editorial-inquiry/editorial-planning";
import { Canvas } from "./canvas";
import {
  InspectorPanel,
  type BusyKind,
  type InheritedNoteView,
  type PanelView,
} from "./inspector-panel";
import { InquirySwitcher } from "./inquiry-switcher";
import {
  addContextNote,
  addQuestionManually,
  applyReframe,
  loadDiscussThread,
  moveQuestion,
  getPitchHandoffUrl,
  promoteQuestion,
  rejectQuestion,
} from "./actions";

type StreamTurnMode = "branch" | "drilldown" | "evaluate" | "discuss";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function InquiryWorkspace({
  inquiries,
  detail,
  guidingQuestionOptions,
  canDevelopIntoPitch,
}: {
  inquiries: InquirySummary[];
  detail: InquiryDetail;
  guidingQuestionOptions: GuidingQuestionOption[];
  canDevelopIntoPitch: boolean;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionRecord[]>(detail.questions);
  const [contextNotes, setContextNotes] = useState<ContextNoteRecord[]>(detail.contextNotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Intent-driven, not a free-floating preference: selecting a node lands on
  // Context (its profile — question, diagnosis, actions, evidence), while
  // starting a turn or clicking the canvas Discuss icon lands on Discussion.
  const [panelView, setPanelView] = useState<PanelView>("context");
  const [error, setError] = useState<string | null>(null);

  const [pendingByQuestion, setPendingByQuestion] = useState<
    Record<string, "branch" | "drilldown" | "evaluate">
  >({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextType, setContextType] = useState<ContextNoteKind>("note");
  const [contextEvidentiaryStatus, setContextEvidentiaryStatus] =
    useState<EvidentiaryStatus>("hunch");
  const [contextText, setContextText] = useState("");
  const [savingContext, setSavingContext] = useState(false);

  const [manualAddOpen, setManualAddOpen] = useState<"sibling" | "child" | null>(null);
  const [manualAddText, setManualAddText] = useState("");
  const [savingManualAdd, setSavingManualAdd] = useState(false);

  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessageRecord[]>>({});
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  // The reporter's own message currently in flight — rendered as an
  // optimistic bubble until the turn's terminal event replaces it with the
  // persisted record.
  const [inFlightChat, setInFlightChat] = useState<{ questionId: string; text: string } | null>(
    null,
  );
  // The model's reply as it streams in, keyed to the question the turn runs
  // on (selection can move mid-stream without mixing threads up).
  const [streaming, setStreaming] = useState<{ questionId: string; text: string } | null>(null);
  const [applyingReframeId, setApplyingReframeId] = useState<string | null>(null);
  const [developingIntoPitch, setDevelopingIntoPitch] = useState(false);

  const layout = useMemo(() => computeTreeLayout(questions), [questions]);
  const pendingMap = useMemo(() => new Map(Object.entries(pendingByQuestion)), [pendingByQuestion]);
  const contextCounts = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, contextNoteCount(questions, contextNotes, n.id)])),
    [layout.nodes, questions, contextNotes],
  );
  const selectedQuestion = questions.find((q) => q.id === selectedId) ?? null;
  const selectedContextNotes: InheritedNoteView[] = useMemo(() => {
    if (!selectedId) return [];
    return inheritedContextNotes(questions, contextNotes, selectedId).map((entry) => ({
      id: entry.note.id,
      kind: entry.note.kind,
      body: entry.note.body,
      evidentiaryStatus: entry.note.evidentiaryStatus,
      sourceTitle: entry.note.sourceTitle,
      sourceUrl: entry.note.sourceUrl,
      inherited: entry.inherited,
      sourceLabel: entry.inherited
        ? truncate(questions.find((q) => q.id === entry.sourceQuestionId)?.text ?? "", 40)
        : null,
    }));
  }, [selectedId, questions, contextNotes]);

  function selectQuestion(id: string | null) {
    setSelectedId(id);
    setPanelView("context");
    setContextPanelOpen(false);
    setContextText("");
    setManualAddOpen(null);
    setManualAddText("");
    // The thread still loads eagerly on selection so switching to the
    // Discussion view (or starting a turn) never waits on it.
    if (id) void loadThreadOnce(id);
  }

  /** The canvas's Discuss icon: select the node AND land on its conversation. */
  function discussQuestion(id: string) {
    selectQuestion(id);
    setPanelView("discussion");
  }

  function applyTurnOutcome(id: string, outcome: EditorialTurnOutcome) {
    setChatThreads((t) => ({
      ...t,
      [id]: [...(t[id] ?? []), outcome.userMessage, outcome.assistantMessage],
    }));
    if (outcome.createdQuestion) {
      const created = outcome.createdQuestion;
      setQuestions((qs) => [...qs, created]);
    }
    if (outcome.createdContextNote) {
      const created = outcome.createdContextNote;
      setContextNotes((n) => [...n, created]);
    }
    if (outcome.updatedQuestion) {
      const updated = outcome.updatedQuestion;
      setQuestions((qs) => qs.map((q) => (q.id === updated.id ? updated : q)));
    }
  }

  async function loadThread(id: string) {
    setChatLoadingId(id);
    const result = await loadDiscussThread(id);
    setChatLoadingId((cur) => (cur === id ? null : cur));
    if (result.ok) {
      setChatThreads((t) => ({ ...t, [id]: result.data }));
    } else {
      setError(result.error);
    }
  }

  // Deduplicates concurrent loads of the same thread: selection triggers a
  // load, and a turn started right afterward awaits the same promise instead
  // of racing it. The await-before-turn ordering matters — applyTurnOutcome()
  // appends onto whatever's in chatThreads[id], so a load resolving after the
  // turn would silently overwrite the just-added messages.
  const threadLoads = useRef<Map<string, Promise<void>>>(new Map());
  function loadThreadOnce(id: string): Promise<void> {
    if (chatThreads[id]) return Promise.resolve();
    let inFlight = threadLoads.current.get(id);
    if (!inFlight) {
      inFlight = loadThread(id).finally(() => threadLoads.current.delete(id));
      threadLoads.current.set(id, inFlight);
    }
    return inFlight;
  }

  /**
   * One streaming editorial turn — Branch, Drill down, Evaluate, or a
   * Discuss message. Mirrors agent-chat-widget's SSE parsing; deltas land in
   * `streaming` so the reply renders as the model produces it, and nothing
   * is added to the thread until the terminal `done` event carries the
   * persisted records.
   */
  async function runTurn(id: string, mode: StreamTurnMode, message?: string): Promise<boolean> {
    setError(null);
    setPanelView("discussion");
    let succeeded = false;
    if (mode === "discuss") {
      setChatSending(true);
      setInFlightChat({ questionId: id, text: message ?? "" });
    } else {
      setPendingByQuestion((p) => ({ ...p, [id]: mode }));
    }
    setStreaming({ questionId: id, text: "" });
    try {
      await loadThreadOnce(id);
      const response = await fetch("/api/editorial-inquiry/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: id, mode, message }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        setError((data as { error?: string } | null)?.error ?? "Something went wrong.");
        return false;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          let event: EditorialTurnStreamEvent;
          try {
            event = JSON.parse(line.slice("data:".length).trim()) as EditorialTurnStreamEvent;
          } catch {
            continue;
          }
          if (event.type === "delta") {
            setStreaming((s) =>
              s && s.questionId === id ? { ...s, text: s.text + (event.text ?? "") } : s,
            );
          } else if (event.type === "done") {
            sawTerminalEvent = true;
            succeeded = true;
            applyTurnOutcome(id, event.outcome);
          } else if (event.type === "error") {
            sawTerminalEvent = true;
            setError(event.message ?? "Something went wrong.");
          }
        }
      }

      if (!sawTerminalEvent) {
        setError("The assistant stopped responding unexpectedly.");
      }
      return succeeded;
    } catch {
      setError("Couldn't reach the assistant. Try again.");
      return false;
    } finally {
      setStreaming((s) => (s && s.questionId === id ? null : s));
      if (mode === "discuss") {
        setChatSending(false);
        setInFlightChat(null);
      } else {
        setPendingByQuestion((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      }
    }
  }

  // Selection deliberately stays on the acted-on question after a turn, even
  // when it created a new node — the reply explaining what happened is on
  // THIS question's thread, and yanking selection away hid it (a reported
  // confusion). The new node appears on the canvas; clicking it is the
  // reporter's own move.
  function handleBranch(id: string) {
    selectQuestion(id);
    void runTurn(id, "branch");
  }

  function handleDrillDown(id: string) {
    selectQuestion(id);
    void runTurn(id, "drilldown");
  }

  function handleEvaluate(id: string) {
    selectQuestion(id);
    void runTurn(id, "evaluate");
  }

  function handleSendChat(id: string, presetText?: string) {
    const text = (presetText ?? chatInput).trim();
    if (!text || chatSending) return;
    setChatInput("");
    void runTurn(id, "discuss", text).then((succeeded) => {
      // A failed send restores what the reporter typed (unless they've
      // already started typing something else) so nothing needs retyping.
      if (!succeeded && !presetText) setChatInput((cur) => cur || text);
    });
  }

  async function handleReject(id: string) {
    setError(null);
    setRejectingId(id);
    const result = await rejectQuestion(id);
    setRejectingId(null);
    if (result.ok) {
      setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, status: "rejected" } : q)));
      if (selectedId === id) selectQuestion(null);
    } else {
      setError(result.error);
    }
  }

  async function handlePromote(id: string) {
    setError(null);
    setPromotingId(id);
    const result = await promoteQuestion(id);
    setPromotingId(null);
    if (result.ok) {
      setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, status: "promoted" } : q)));
    } else {
      setError(result.error);
    }
  }

  async function handleMove(id: string, manualDx: number, manualDy: number) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, manualDx, manualDy } : q)));
    const result = await moveQuestion(id, manualDx, manualDy);
    if (!result.ok) setError(result.error);
  }

  async function handleSubmitManualAdd() {
    if (!selectedId || !manualAddOpen || !manualAddText.trim()) return;
    setSavingManualAdd(true);
    const result = await addQuestionManually(selectedId, manualAddOpen, manualAddText);
    setSavingManualAdd(false);
    if (result.ok) {
      setQuestions((qs) => [...qs, result.data]);
      setManualAddOpen(null);
      setManualAddText("");
      selectQuestion(result.data.id);
    } else {
      setError(result.error);
    }
  }

  async function handleSaveContext() {
    if (!selectedId || !contextText.trim()) return;
    setError(null);
    setSavingContext(true);
    const result = await addContextNote(
      selectedId,
      contextType,
      contextText,
      contextEvidentiaryStatus,
    );
    setSavingContext(false);
    if (result.ok) {
      setContextNotes((n) => [...n, result.data]);
      setContextPanelOpen(false);
      setContextText("");
    } else {
      setError(result.error);
    }
  }

  async function handleApplyReframe(message: ChatMessageRecord) {
    if (!selectedId || message.actionKind !== "reframe" || !message.actionPayload) return;
    const text = (message.actionPayload as { text?: string }).text;
    if (!text) return;
    setError(null);
    setApplyingReframeId(message.id);
    const result = await applyReframe(message.id, selectedId, text);
    setApplyingReframeId(null);
    if (result.ok) {
      const updated = result.data;
      setQuestions((qs) => qs.map((q) => (q.id === updated.id ? updated : q)));
      setChatThreads((t) => ({
        ...t,
        [selectedId]: (t[selectedId] ?? []).map((m) =>
          m.id === message.id ? { ...m, appliedAt: new Date().toISOString() } : m,
        ),
      }));
    } else {
      setError(result.error);
    }
  }

  async function handleDevelopIntoPitch(id: string) {
    setError(null);
    setDevelopingIntoPitch(true);
    const result = await getPitchHandoffUrl(id);
    setDevelopingIntoPitch(false);
    if (result.ok) {
      router.push(result.data);
    } else {
      setError(result.error);
    }
  }

  const busy: BusyKind = selectedId
    ? (pendingByQuestion[selectedId] ??
      (rejectingId === selectedId ? "reject" : promotingId === selectedId ? "promote" : null))
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line px-5">
        <span className="font-serif text-base font-bold text-ink-900">Inquiry</span>
        <span className="h-5 w-px bg-line" />
        <InquirySwitcher
          inquiries={inquiries}
          activeId={detail.inquiry.id}
          guidingQuestionOptions={guidingQuestionOptions}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <Canvas
          layout={layout}
          selectedId={selectedId}
          contextCounts={contextCounts}
          pendingByQuestion={pendingMap}
          onSelect={selectQuestion}
          onBranch={handleBranch}
          onDrillDown={handleDrillDown}
          onReject={handleReject}
          onDiscuss={discussQuestion}
          onMove={handleMove}
          canBranchFor={canBranchRule}
          canDrillDownFor={canDrillDownRule}
          canRejectFor={canRejectRule}
        />

        <InspectorPanel
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          selected={selectedQuestion}
          view={panelView}
          onViewChange={setPanelView}
          contextNotes={selectedContextNotes}
          contextPanelOpen={contextPanelOpen}
          onOpenContextPanel={() => setContextPanelOpen(true)}
          onCloseContextPanel={() => setContextPanelOpen(false)}
          contextType={contextType}
          onContextTypeChange={setContextType}
          contextEvidentiaryStatus={contextEvidentiaryStatus}
          onContextEvidentiaryStatusChange={setContextEvidentiaryStatus}
          contextText={contextText}
          onContextTextChange={setContextText}
          onSaveContext={handleSaveContext}
          savingContext={savingContext}
          canBranch={selectedQuestion ? canBranchRule(selectedQuestion) : false}
          canDrillDown={selectedQuestion ? canDrillDownRule(selectedQuestion) : false}
          canReject={selectedQuestion ? canRejectRule(selectedQuestion) : false}
          canPromote={selectedQuestion ? canPromoteRule(selectedQuestion) : false}
          busy={busy}
          onBranch={() => selectedId && handleBranch(selectedId)}
          onDrillDown={() => selectedId && handleDrillDown(selectedId)}
          onEvaluate={() => selectedId && handleEvaluate(selectedId)}
          onReject={() => selectedId && handleReject(selectedId)}
          onPromote={() => selectedId && handlePromote(selectedId)}
          manualAddOpen={manualAddOpen}
          onOpenManualAdd={setManualAddOpen}
          onCloseManualAdd={() => {
            setManualAddOpen(null);
            setManualAddText("");
          }}
          manualAddText={manualAddText}
          onManualAddTextChange={setManualAddText}
          onSubmitManualAdd={handleSubmitManualAdd}
          savingManualAdd={savingManualAdd}
          chatLog={selectedId ? (chatThreads[selectedId] ?? null) : null}
          chatLoading={chatLoadingId !== null && chatLoadingId === selectedId}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendChat={(presetText) => selectedId && handleSendChat(selectedId, presetText)}
          chatSending={chatSending}
          inFlightChatText={
            inFlightChat && inFlightChat.questionId === selectedId ? inFlightChat.text : null
          }
          streamingReply={streaming && streaming.questionId === selectedId ? streaming.text : null}
          onApplyReframe={handleApplyReframe}
          applyingReframeId={applyingReframeId}
          canDevelopIntoPitch={canDevelopIntoPitch}
          onDevelopIntoPitch={() => selectedId && handleDevelopIntoPitch(selectedId)}
          developingIntoPitch={developingIntoPitch}
          error={error}
        />
      </div>
    </div>
  );
}
