"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRightPanel } from "@/components/right-panel";
import { helpContextForPath } from "@/lib/resources/screens";
import { formatReleaseDate } from "@/lib/resources/articles";
import type { HelpContent, HelpLink } from "@/lib/resources/help";
import { loadHelp } from "@/app/(portal)/resources/help-actions";

// The in-tool Help panel (docs/resources-design.md, "Help panel"): opened
// from the Help button in the portal header on any tool page, it lists the
// Resources guides for the screen you're on and the tool's latest release
// notes. It shares the assistant's right-hand slot — same classes, same
// push-aside layout at lg, same full-screen sheet below it — and only one of
// the two is open at a time (components/right-panel.tsx).

const SEARCH_DELAY_MS = 250;

type State =
  | { status: "idle" }
  | { status: "loading"; content: HelpContent | null }
  | { status: "ready"; content: HelpContent | null }
  | { status: "error"; message: string };

export function HelpPanel() {
  const { open, close, askAssistant } = useRightPanel();
  const isOpen = open === "help";
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const context = helpContextForPath(pathname, search);
  const contextKey = context ? `${context.toolKey}|${context.screenKey ?? ""}` : "";

  // The search belongs to the screen it was typed on: a new screen starts
  // empty, without an effect to clear it.
  const [queryState, setQueryState] = useState({ contextKey, value: "" });
  const query = queryState.contextKey === contextKey ? queryState.value : "";
  const setQuery = (value: string) => setQueryState({ contextKey, value });
  const [state, setState] = useState<State>({ status: "idle" });

  // Close when navigating somewhere Help doesn't apply (the dashboard,
  // Administration, Resources itself) — there'd be nothing to show.
  useEffect(() => {
    if (isOpen && !context) close();
  }, [isOpen, context, close]);

  useEffect(() => {
    if (!isOpen || !context) return;
    let cancelled = false;
    const handle = window.setTimeout(
      () => {
        setState((previous) => ({
          status: "loading",
          content:
            previous.status === "ready" || previous.status === "loading" ? previous.content : null,
        }));
        loadHelp({ pathname, search, query })
          .then((result) => {
            if (cancelled) return;
            setState(
              result.ok
                ? { status: "ready", content: result.content }
                : { status: "error", message: result.error },
            );
          })
          .catch(() => {
            if (!cancelled) setState({ status: "error", message: "Help couldn't load." });
          });
      },
      query ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // contextKey stands in for pathname/search: a different URL on the same
    // screen shows the same guides, so it isn't worth a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contextKey, query]);

  const content = state.status === "ready" || state.status === "loading" ? state.content : null;
  const toolName = content?.tool.name ?? "";
  const location = content
    ? [content.tool.name, content.screen?.name].filter(Boolean).join(" · ")
    : "";

  return (
    <aside
      className={cn(
        "fixed inset-0 z-40 flex flex-col border-line bg-white transition-transform duration-200",
        "lg:sticky lg:inset-auto lg:top-16 lg:right-0 lg:z-30 lg:h-[calc(100vh-4rem)] lg:w-0 lg:shrink-0 lg:translate-x-0 lg:overflow-hidden lg:border-l lg:transition-[width] lg:duration-200",
        isOpen ? "translate-x-0" : "translate-x-full",
        isOpen && "lg:w-96",
      )}
      aria-hidden={!isOpen}
      aria-label="Help"
    >
      <div className="flex h-full w-full flex-col lg:w-96">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink-900">Help</p>
            {location && <p className="truncate text-xs text-ink-400">{location}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close help"
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

        <div className="flex-1 overflow-y-auto p-4">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={toolName ? `Search ${toolName} guides…` : "Search guides…"}
            aria-label={toolName ? `Search ${toolName} guides` : "Search guides"}
            tabIndex={isOpen ? undefined : -1}
          />

          {state.status === "error" && <Alert className="mt-4">{state.message}</Alert>}
          {state.status === "loading" && !content && (
            <p className="mt-4 text-xs text-ink-400">Loading…</p>
          )}

          {content && content.results !== null && query.trim() !== "" ? (
            <section className="mt-5">
              <Eyebrow>Results</Eyebrow>
              {content.results.length === 0 ? (
                <p className="text-sm text-ink-500">No {content.tool.name} guide matches.</p>
              ) : (
                <GuideList links={content.results} />
              )}
            </section>
          ) : (
            content && (
              <>
                <section className="mt-5">
                  <Eyebrow>
                    {content.screen ? "For this screen" : `${content.tool.name} guides`}
                  </Eyebrow>
                  {content.guides.length === 0 ? (
                    <div className="rounded border border-dashed border-line p-4 text-sm text-ink-500">
                      No guide for this screen yet.{" "}
                      <Link href={content.allGuidesHref} className="font-semibold text-brand-link">
                        All {content.tool.name} guides
                      </Link>
                    </div>
                  ) : (
                    <GuideList links={content.guides} />
                  )}
                </section>
                {content.recent.length > 0 && (
                  <section className="mt-6">
                    <Eyebrow>Changed recently</Eyebrow>
                    <ul>
                      {content.recent.map((note) => (
                        <li
                          key={note.href}
                          className="flex gap-3 border-b border-line py-2.5 last:border-b-0"
                        >
                          <span className="w-12 shrink-0 text-xs text-ink-400">
                            {formatReleaseDate(note.releasedOn, true)}
                          </span>
                          <Link
                            href={note.href}
                            className="text-sm text-ink-700 hover:text-brand-link"
                          >
                            {note.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )
          )}
        </div>

        {content && (
          <div className="shrink-0 border-t border-line px-4 py-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => askAssistant(`About ${content.tool.name}: `)}
            >
              Ask the assistant about {content.tool.name}
            </Button>
            <p className="mt-2 text-center">
              <Link href={content.allGuidesHref} className="text-xs font-semibold text-brand-link">
                All {content.tool.name} guides
              </Link>
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-400">{children}</p>
  );
}

function GuideList({ links }: { links: HelpLink[] }) {
  return (
    <ul>
      {links.map((link) => (
        <li key={link.href} className="border-b border-line py-2.5 last:border-b-0">
          <Link href={link.href} className="block">
            <span className="block text-sm font-semibold text-brand-link">{link.title}</span>
            {link.summary && (
              <span className="mt-0.5 block text-xs text-ink-500">{link.summary}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
