"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/input";

// The in-portal agent's chat surface (Phase D, docs/agent-capabilities-design.md
// §7) — a persistent bubble that toggles a panel, available on every portal
// page (mounted once in src/app/(portal)/layout.tsx, as a flex sibling of the
// page content so opening it pushes that content over rather than covering it
// — on large screens; see the panel's own comment for why that's inert below
// the lg breakpoint). It talks only to src/app/api/agent/chat/route.ts; there
// is no separate client credential and no local persistence — the full
// OpenAI Responses-shaped item history round-trips through this component's
// state and the route on every call, matching the rest of this repo's "no
// job queue" posture. History items are typed loosely here on purpose:
// importing the OpenAI SDK's types (or the SDK itself, via lib/agent/chat.ts)
// into a Client Component would pull a Node-oriented package into the
// browser bundle for no benefit — this widget only needs to render
// message/function_call/function_call_output items, not construct API
// requests.

interface ChatItem {
  type?: string;
  role?: string;
  content?: unknown;
  name?: string;
  output?: unknown;
  [key: string]: unknown;
}

interface PendingConfirmation {
  toolUseId: string;
  capabilityId: string;
  description: string;
  input: Record<string, unknown>;
}

interface ChatResponse {
  history: ChatItem[];
  pendingConfirmation: PendingConfirmation | null;
  error?: string;
}

function prettifyCapabilityId(id: string): string {
  return id.split(".").join(" › ");
}

export function AgentChatWidget() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, pending, loading]);

  async function postChat(body: Record<string, unknown>): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ChatResponse;
      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setHistory(data.history);
      setPending(data.pendingConfirmation);
    } catch {
      setError("Couldn't reach the assistant. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading || pending) return;
    setDraft("");
    void postChat({ history, input: text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function resolveConfirmation(approved: boolean) {
    if (!pending || loading) return;
    const toolUseId = pending.toolUseId;
    setPending(null);
    void postChat({ history, confirmation: { toolUseId, approved } });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg transition-[right] duration-200 hover:scale-105 hover:bg-[#2278B8]",
          // Only shifts aside on large screens, to stay beside the push panel
          // (see the <aside> below) — below lg the panel is a full-screen
          // sheet with nothing to dodge, so the bubble stays put.
          open && "lg:right-[calc(24rem+1.5rem)]",
        )}
      >
        {open ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Below lg: a full-screen sheet (fixed inset-0, slides in via
          translate-x) — there's no room to push page content aside on a
          phone-width screen, and 24rem is wider than most phones anyway.
          Being `fixed` takes it out of the layout flow entirely, so <main>
          in layout.tsx doesn't need to shrink for it.

          At lg and up: a real (non-fixed) flex item, sized 0 when closed —
          opening it pushes the portal's main content left instead of
          overlaying it. The inner div stays a fixed w-96 (full width below
          lg, where the outer is already full-screen) so its content doesn't
          squash mid-transition; the outer's lg:overflow-hidden clips it down
          to width 0 at that breakpoint. */}
      <aside
        className={cn(
          "fixed inset-0 z-40 flex flex-col border-line bg-white transition-transform duration-200",
          "lg:sticky lg:inset-auto lg:top-16 lg:right-0 lg:z-30 lg:h-[calc(100vh-4rem)] lg:w-0 lg:shrink-0 lg:translate-x-0 lg:overflow-hidden lg:border-l lg:transition-[width] lg:duration-200",
          open ? "translate-x-0" : "translate-x-full",
          open && "lg:w-96",
        )}
        aria-hidden={!open}
      >
        <div className="flex h-full w-full flex-col lg:w-96">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
            <span className="text-sm font-bold text-ink-900">Assistant</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-400">Beta</span>
              {/* A conventional in-panel close control, not just the floating
                  bubble — the one a full-screen mobile sheet needs, and no
                  harm having it on desktop too. */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="text-ink-400 hover:text-ink-700"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {history.length === 0 && (
              <p className="text-sm leading-relaxed text-ink-400">
                Ask about pitches, sources, sessions, or queries across the tools you have access
                to.
              </p>
            )}
            {history.map((item, index) => (
              <ChatEntry key={index} item={item} />
            ))}
            {loading && <p className="text-xs text-ink-400">Thinking…</p>}
          </div>

          {pending && (
            <div className="border-t border-line bg-panel-50 px-4 py-3">
              <p className="text-xs font-semibold text-ink-700">
                {prettifyCapabilityId(pending.capabilityId)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{pending.description}</p>
              {Object.keys(pending.input).length > 0 && (
                <pre className="mt-2 max-h-24 overflow-y-auto rounded border border-line bg-white px-2 py-1.5 text-[11px] leading-relaxed text-ink-500">
                  {JSON.stringify(pending.input, null, 2)}
                </pre>
              )}
              <div className="mt-2.5 flex gap-2">
                <Button
                  type="button"
                  onClick={() => resolveConfirmation(true)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs"
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => resolveConfirmation(false)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs"
                >
                  Decline
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 pt-3">
              <Alert variant="danger">{error}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-line px-4 py-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                pending ? "Resolve the pending action above first…" : "Ask the assistant…"
              }
              disabled={loading || Boolean(pending)}
              rows={2}
              className="resize-none"
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                disabled={loading || Boolean(pending) || !draft.trim()}
                className="px-4 py-1.5 text-xs"
              >
                Send
              </Button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}

function ChatEntry({ item }: { item: ChatItem }) {
  // A plain user-authored turn: { role: "user", content: "..." }.
  if (item.role === "user" && typeof item.content === "string") {
    return <Bubble align="right">{item.content}</Bubble>;
  }

  // The model's own text/refusal turn: { type: "message", role: "assistant",
  // content: [{type: "output_text", text} | {type: "refusal", refusal}] }.
  if (item.type === "message" && Array.isArray(item.content)) {
    const text = item.content
      .filter(
        (block): block is { type: string; text?: string; refusal?: string } =>
          Boolean(block) && typeof block === "object",
      )
      .map((block) => block.text ?? block.refusal ?? "")
      .join("\n")
      .trim();
    return text ? <Bubble align="left">{text}</Bubble> : null;
  }

  // A tool call the model made: { type: "function_call", name, arguments, call_id }.
  if (item.type === "function_call" && typeof item.name === "string") {
    return (
      <p className="pl-1 text-[11px] text-ink-400">
        {/* Reverses lib/agent/tool-bridge.ts's sanitizeToolName — keep in sync. */}
        Called {prettifyCapabilityId(item.name.replace(/__/g, "."))}
      </p>
    );
  }

  // The result we (or a decline) fed back for that call: { type: "function_call_output", output }.
  if (item.type === "function_call_output" && typeof item.output === "string") {
    return <p className="pl-1 text-[11px] italic text-ink-400">{item.output}</p>;
  }

  return null;
}

function Bubble({ align, children }: { align: "left" | "right"; children: string }) {
  return (
    <div className={cn("flex", align === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded px-3 py-2 text-sm leading-relaxed",
          align === "right" ? "bg-brand-primary text-white" : "bg-panel-50 text-ink-900",
        )}
      >
        {children}
      </div>
    </div>
  );
}
