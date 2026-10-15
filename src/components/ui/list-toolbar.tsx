import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { FilterMenu } from "@/components/ui/filter-menu";
import { PlusIcon } from "@/components/ui/plus-icon";
import { PrimaryLink } from "@/components/ui/primary-link";
import { ListSearch } from "@/components/ui/list-search";
import { CONTROL_ROW } from "@/components/ui/control-row";
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
 * button (FilterMenu) that names what's applied. On a phone the first row is the
 * search with the Filter as an icon square beside it (a search with no filters
 * takes the row alone), and the actions are a control row beneath it
 * (`CONTROL_ROW`): they pair up at half width, the spacer is gone, and an odd
 * third control's primary takes a row of its own.
 */
export function ListToolbar({
  search,
  leading,
  filters,
  chips,
  chipsLabel = "Filter",
  primary,
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
  /**
   * The list's "+ New X" action, always last on the right. Give the label without the plus
   * ("New program"): it reads "+ New program" from `sm` up and is a "+" square beside the search
   * on a phone. Null (or omitted) for a list with no create action. An action that is not a
   * link (a form's submit button) goes in `children` with `phoneIcon` and `max-sm:order-first`.
   */
  primary?: { label: string; href: string } | null;
  /** Right-aligned actions: secondary links first (the primary follows them). */
  children?: ReactNode;
}) {
  const groups = (filters ?? (chips ? [{ label: chipsLabel, chips }] : [])).filter(
    (group) => group.chips.length > 0,
  );
  const inline = filtersFitInline(groups);

  return (
    <div className={cn(CONTROL_ROW, "relative sm:gap-3", className)}>
      {leading && <div data-row="fixed">{leading}</div>}
      {search && (
        <ListSearch
          {...search}
          row={groups.length > 0 ? "grow" : "full"}
          className="w-full max-sm:order-first sm:w-80"
        />
      )}
      {groups.length > 0 &&
        (inline ? (
          <>
            <FilterChips
              label={groups[0]!.label}
              chips={groups[0]!.chips}
              className="hidden sm:flex"
              data-row="skip"
            />
            <FilterMenu groups={groups} className="max-sm:order-first sm:hidden" />
          </>
        ) : (
          <FilterMenu groups={groups} className="max-sm:order-first" />
        ))}
      <span className="flex-1" data-row="skip" />
      {children}
      {primary && (
        <PrimaryLink
          href={primary.href}
          phoneIcon={<PlusIcon className="size-4" />}
          className="max-sm:order-first"
        >
          + {primary.label}
        </PrimaryLink>
      )}
    </div>
  );
}
