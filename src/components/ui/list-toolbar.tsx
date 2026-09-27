import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export interface ListToolbarSearch {
  /** Placeholder text, e.g. "Search underwriter or contact". */
  placeholder: string;
  /** Accessible name for the search box, e.g. "Search underwriters". */
  label: string;
  /** The current `q` value, echoed back into the box. */
  defaultValue?: string;
  /** Query-string fields to carry through a search submit, such as the active filter. */
  hidden?: Record<string, string>;
}

/**
 * The toolbar every list page opens with (docs/ui-patterns.md): a search
 * form on the left, optional FilterChips beside it, a spacer, then the
 * secondary links and the primary "+ New X" action on the right. Search and
 * filters are plain query-string forms and links, so the toolbar needs no
 * client JavaScript; items wrap on narrow screens.
 */
export function ListToolbar({
  search,
  chips,
  chipsLabel = "Filter",
  className,
  children,
}: {
  search?: ListToolbarSearch;
  chips?: FilterChip[];
  chipsLabel?: string;
  className?: string;
  /** Right-aligned actions: secondary links first, then the PrimaryLink. */
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {search && (
        <form method="get" className="w-full sm:w-80">
          {Object.entries(search.hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Input
            type="search"
            name="q"
            defaultValue={search.defaultValue ?? ""}
            placeholder={search.placeholder}
            aria-label={search.label}
          />
        </form>
      )}
      {chips && chips.length > 0 && <FilterChips label={chipsLabel} chips={chips} />}
      <span className="flex-1" />
      {children}
    </div>
  );
}
