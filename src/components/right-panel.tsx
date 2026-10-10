"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// The portal has two right-hand panels, the assistant and Help, and only one
// is ever open: opening either closes the other. Their open state lives here
// rather than in each panel so the nav's Help button, the assistant's bubble,
// and Help's "Ask the assistant" button can all drive it.

export type RightPanel = "assistant" | "help";

/**
 * What the page has open, for the assistant (docs/sourcework-analysis-design.md §6.4): a
 * piece, so "tighten the setup" has an object. The page registers it while mounted.
 * `beforeSend` lets the page save unsaved edits first, so the assistant reads and edits the
 * same version the person sees.
 */
export interface AssistantPageContext {
  kind: "piece";
  pieceId: string;
  title: string;
  beforeSend?: () => Promise<void>;
}

interface RightPanelState {
  open: RightPanel | null;
  toggle: (panel: RightPanel) => void;
  close: () => void;
  /**
   * Opens the assistant with `draft` in its compose box, unsent — Help's
   * "Ask the assistant about {Tool}". Each request has its own id, so the
   * widget applies it once.
   */
  askAssistant: (draft: string) => void;
  assistantDraft: { id: number; text: string } | null;
  assistantContext: AssistantPageContext | null;
  setAssistantContext: (context: AssistantPageContext | null) => void;
}

const RightPanelContext = createContext<RightPanelState | null>(null);

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<RightPanel | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<{ id: number; text: string } | null>(null);
  const [assistantContext, setAssistantContext] = useState<AssistantPageContext | null>(null);

  const toggle = useCallback(
    (panel: RightPanel) => setOpen((current) => (current === panel ? null : panel)),
    [],
  );
  const close = useCallback(() => setOpen(null), []);
  const askAssistant = useCallback((draft: string) => {
    setAssistantDraft((previous) => ({ id: (previous?.id ?? 0) + 1, text: draft }));
    setOpen("assistant");
  }, []);

  const value = useMemo(
    () => ({
      open,
      toggle,
      close,
      askAssistant,
      assistantDraft,
      assistantContext,
      setAssistantContext,
    }),
    [open, toggle, close, askAssistant, assistantDraft, assistantContext],
  );
  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

export function useRightPanel(): RightPanelState {
  const state = useContext(RightPanelContext);
  if (!state) throw new Error("useRightPanel must be used inside RightPanelProvider");
  return state;
}
