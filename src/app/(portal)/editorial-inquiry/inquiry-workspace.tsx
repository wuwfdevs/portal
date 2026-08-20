"use client";

import { useMemo, useState } from "react";
import {
  canDrillDown as canDrillDownRule,
  canExplore as canExploreRule,
  canPromote as canPromoteRule,
  canReject as canRejectRule,
  computeTreeLayout,
  contextNoteCount,
  inheritedContextNotes,
  type ContextNoteKind,
  type ContextNoteRecord,
  type QuestionRecord,
} from "@/lib/editorial-inquiry/tree";
import type {
  ChatMessageRecord,
  InquiryDetail,
  InquirySummary,
} from "@/lib/editorial-inquiry/queries";
import { Canvas } from "./canvas";
import { InspectorPanel, type InheritedNoteView } from "./inspector-panel";
import { InquirySwitcher } from "./inquiry-switcher";
import {
  addContextNote,
  addQuestionManually,
  applyReframe,
  drillDownQuestion,
  exploreQuestion,
  loadDiscussThread,
  moveQuestion,
  promoteQuestion,
  rejectQuestion,
  sendDiscussMessage,
} from "./actions";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function InquiryWorkspace({
  inquiries,
  detail,
}: {
  inquiries: InquirySummary[];
  detail: InquiryDetail;
}) {
  const [questions, setQuestions] = useState<QuestionRecord[]>(detail.questions);
  const [contextNotes, setContextNotes] = useState<ContextNoteRecord[]>(detail.contextNotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingByQuestion, setPendingByQuestion] = useState<Record<string, "explore" | "drill">>(
    {},
  );
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextType, setContextType] = useState<ContextNoteKind>("note");
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

  async function handleExplore(id: string) {
    setError(null);
    setPendingByQuestion((p) => ({ ...p, [id]: "explore" }));
    const result = await exploreQuestion(id);
    setPendingByQuestion((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    if (result.ok) {
      setQuestions((qs) => [...qs, result.data]);
      selectQuestion(result.data.id);
    } else {
      setError(result.error);
    }
  }

  async function handleDrillDown(id: string) {
    setError(null);
    setPendingByQuestion((p) => ({ ...p, [id]: "drill" }));
    const result = await drillDownQuestion(id);
    setPendingByQuestion((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    if (result.ok) {
      setQuestions((qs) => [...qs, result.data]);
      selectQuestion(result.data.id);
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
    const result = await addContextNote(selectedId, contextType, contextText);
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
      setChatThreads((t) => ({
        ...t,
        [id]: [...(t[id] ?? []), result.data.userMessage, result.data.assistantMessage],
      }));
      setChatInput("");
      if (result.data.createdQuestion) {
        const created = result.data.createdQuestion;
        setQuestions((qs) => [...qs, created]);
      }
      if (result.data.createdContextNote) {
        const created = result.data.createdContextNote;
        setContextNotes((n) => [...n, created]);
      }
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

  const discussOpen = discussOpenId !== null && discussOpenId === selectedId;
  const busy: "explore" | "drill" | "reject" | "promote" | null = selectedId
    ? (pendingByQuestion[selectedId] ??
      (rejectingId === selectedId ? "reject" : promotingId === selectedId ? "promote" : null))
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line px-5">
        <span className="font-serif text-base font-bold text-ink-900">Inquiry</span>
        <span className="h-5 w-px bg-line" />
        <InquirySwitcher inquiries={inquiries} activeId={detail.inquiry.id} />
      </div>

      <div className="flex min-h-0 flex-1">
        <Canvas
          layout={layout}
          selectedId={selectedId}
          contextCounts={contextCounts}
          pendingByQuestion={pendingMap}
          onSelect={selectQuestion}
          onExplore={handleExplore}
          onDrillDown={handleDrillDown}
          onReject={handleReject}
          onDiscuss={handleToggleDiscuss}
          onMove={handleMove}
          canExploreFor={canExploreRule}
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
          contextText={contextText}
          onContextTextChange={setContextText}
          onSaveContext={handleSaveContext}
          savingContext={savingContext}
          canExplore={selectedQuestion ? canExploreRule(selectedQuestion) : false}
          canDrillDown={selectedQuestion ? canDrillDownRule(selectedQuestion) : false}
          canReject={selectedQuestion ? canRejectRule(selectedQuestion) : false}
          canPromote={selectedQuestion ? canPromoteRule(selectedQuestion) : false}
          busy={busy}
          onExplore={() => selectedId && handleExplore(selectedId)}
          onDrillDown={() => selectedId && handleDrillDown(selectedId)}
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
          error={error}
        />
      </div>
    </div>
  );
}
