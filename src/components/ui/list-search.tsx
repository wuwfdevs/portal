"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { LIST_SEARCH_DEBOUNCE_MS, listSearchHref } from "@/lib/list-search";

/**
 * A list page's search box (docs/ui-patterns.md, "Search"). Searches as you
 * type, after a short pause; clearing the box — by deleting the text or with
 * the browser's own clear button — resets the list at once; Enter searches
 * immediately. The URL (`?q=`) stays the source of truth, updated with
 * `router.replace` so typing doesn't fill the back button with one entry per
 * keystroke. It is still a plain GET form underneath, so it works before
 * hydration and without JavaScript.
 */
export function ListSearch({
  placeholder,
  label,
  defaultValue,
  hidden,
  className,
}: {
  placeholder: string;
  label: string;
  defaultValue?: string;
  hidden?: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastSearched = useRef((defaultValue ?? "").trim());

  // The URL can change without this box: Back/Forward, or a link that drops
  // `q`. Follow it, unless someone is typing here.
  useEffect(() => {
    const next = (defaultValue ?? "").trim();
    lastSearched.current = next;
    if (input.current && document.activeElement !== input.current) input.current.value = next;
  }, [defaultValue]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search(term: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const trimmed = term.trim();
    if (trimmed === lastSearched.current) return;
    lastSearched.current = trimmed;
    startTransition(() => {
      router.replace(listSearchHref(pathname, hidden, trimmed), { scroll: false });
    });
  }

  function onChange(value: string) {
    if (timer.current) clearTimeout(timer.current);
    if (value.trim() === "") {
      search("");
      return;
    }
    timer.current = setTimeout(() => search(value), LIST_SEARCH_DEBOUNCE_MS);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    search(typeof value === "string" ? value : "");
  }

  return (
    <form method="get" role="search" onSubmit={onSubmit} className={className}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Input
        ref={input}
        type="search"
        name="q"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-label={label}
        aria-busy={pending}
        onChange={(event) => onChange(event.target.value)}
      />
    </form>
  );
}
