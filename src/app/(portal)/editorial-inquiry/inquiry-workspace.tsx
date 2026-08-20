"use client";

import { useMemo, useState } from "react";
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
import type { GuidingQuestionOption } from "@/lib/editorial-inquiry/editorial-planning";
import { Canvas } from "./canvas";
import { InspectorPanel, type BusyKind, type InheritedNoteView } from "./inspector-panel";
import { InquirySwitcher } from "./inquiry-switcher";
import {
  addContextNote,
  addQuestionManually,
  applyReframe,
  branchQuestion,
  drillDownQuestion,
  evaluateQuestion,
  getPitchHandoffUrl,
  loadDiscussThread,
  moveQuestion,
  promoteQuestion,
  rejectQuestion,
  sendDiscussMessage,
  type EditorialTurnOutcome,
} from "./actions";

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

  const [discussOpenId, setDiscussOpenId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessageRecord[]>>({});
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
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
    setContextPanelOpen(false);
    setContextText("");
    setManualAddOpen(null);
    setManualAddText("");
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

  // Awaited, not fire-and-forget: applyTurnOutcome() below appends the new
  // turn onto whatever's already in chatThreads[id]. If the thread load were
  // still in flight when the (much slower, LLM-backed) action resolved and
  // called applyTurnOutcome first, the load's own resolution would land
  // afterward and silently overwrite the just-added turn. Awaiting it first
  // (only when the thread isn't already cached) makes that ordering
  // impossible rather than merely unlikely.
  async function ensureDiscussOpenAndLoaded(id: string) {
    setDiscussOpenId(id);
    if (!chatThreads[id]) await loadThread(id);
  }

  async function handleBranch(id: string) {
    setError(null);
    setPendingByQuestion((p) => ({ ...p, [id]: "branch" }));
    selectQuestion(id);
    await ensureDiscussOpenAndLoaded(id);
    const result = await branchQuestion(id);
    setPendingByQuestion((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    if (result.ok) {
      applyTurnOutcome(id, result.data);
      if (result.data.createdQuestion) selectQuestion(result.data.createdQuestion.id);
    } else {
      setError(result.error);
    }
  }

  async function handleDrillDown(id: string) {
    setError(null);
    setPendingByQuestion((p) => ({ ...p, [id]: "drilldown" }));
    selectQuestion(id);
    await ensureDiscussOpenAndLoaded(id);
    const result = await drillDownQuestion(id);
    setPendingByQuestion((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    if (result.ok) {
      applyTurnOutcome(id, result.data);
      if (result.data.createdQuestion) selectQuestion(result.data.createdQuestion.id);
    } else {
      setError(result.error);
    }
  }

  async function handleEvaluate(id: string) {
    setError(null);
    setPendingByQuestion((p) => ({ ...p, [id]: "evaluate" }));
    selectQuestion(id);
    await ensureDiscussOpenAndLoaded(id);
    const result = await evaluateQuestion(id);
    setPendingByQuestion((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    if (result.ok) {
      applyTurnOutcome(id, result.data);
    } else {
      setError(result.error);
    }
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

  function handleToggleDiscuss(id: string) {
    const opening = discussOpenId !== id;
    selectQuestion(id);
    setDiscussOpenId(opening ? id : null);
    if (opening && !chatThreads[id]) {
      void loadThread(id);
    }
  }

  async function handleSendChat(id: string, presetText?: string) {
    const text = (presetText ?? chatInput).trim();
    if (!text) return;
    setError(null);
    setChatSending(true);
    const result = await sendDiscussMessage(id, text);
    setChatSending(false);
    if (result.ok) {
      applyTurnOutcome(id, result.data);
      setChatInput("");
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

  const discussOpen = discussOpenId !== null && discussOpenId === selectedId;
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
          onDiscuss={handleToggleDiscuss}
          onMove={handleMove}
          canBranchFor={canBranchRule}
          canDrillDownFor={canDrillDownRule}
          canRejectFor={canRejectRule}
        />

        <InspectorPanel
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          selected={selectedQuestion}
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
          discussOpen={discussOpen}
          onToggleDiscuss={() => selectedId && handleToggleDiscuss(selectedId)}
          chatLog={selectedId ? (chatThreads[selectedId] ?? null) : null}
          chatLoading={chatLoadingId !== null && chatLoadingId === selectedId}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendChat={(presetText) => selectedId && handleSendChat(selectedId, presetText)}
          chatSending={chatSending}
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
