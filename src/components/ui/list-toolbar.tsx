import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { FilterMenu } from "@/components/ui/filter-menu";
import { ListSearch } from "@/components/ui/list-search";
import { cn } from "@/lib/cn";
import { filtersFitInline, type FilterGroup } from "@/lib/filter-groups";
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
 * The toolbar every list page opens with (docs/ui-patterns.md): an optional
 * leading control (a view switch), a search box, the list's filters, a spacer,
 * then the secondary links and the primary "+ New X" action on the right.
 *
 * Filters are groups of query-string link chips (`filters`, or the older
 * single-group `chips`). One short group shows inline from `sm` up; more than
 * one group, a long group, or any filter on a phone sits behind one Filter
 * button (FilterMenu) that names what's applied. On a phone the search takes
 * the first row to itself and everything else wraps beneath it.
 */
export function ListToolbar({
  search,
  leading,
  filters,
  chips,
  chipsLabel = "Filter",
  className,
  children,
}: {
  search?: ListToolbarSearch;
  /** A control that belongs before the search, such as a Week | List switch. */
  leading?: ReactNode;
  /** Every filter dimension, each a group of chips whose first chip is its reset. */
  filters?: FilterGroup[];
  /** A single filter group — shorthand for `filters={[{ label: chipsLabel, chips }]}`. */
  chips?: FilterChip[];
  chipsLabel?: string;
  className?: string;
  /** Right-aligned actions: secondary links first, then the PrimaryLink. */
  children?: ReactNode;
}) {
  const groups = (filters ?? (chips ? [{ label: chipsLabel, chips }] : [])).filter(
    (group) => group.chips.length > 0,
  );
  const inline = filtersFitInline(groups);

  return (
    <div className={cn("relative flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {leading}
      {search && <ListSearch {...search} className="w-full max-sm:order-first sm:w-80" />}
      {groups.length > 0 &&
        (inline ? (
          <>
            <FilterChips
              label={groups[0]!.label}
              chips={groups[0]!.chips}
              className="hidden sm:flex"
            />
            <FilterMenu groups={groups} className="sm:hidden" />
          </>
        ) : (
          <FilterMenu groups={groups} />
        ))}
      <span className="flex-1" />
      {children}
    </div>
  );
}
