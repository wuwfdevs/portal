import { Badge, type BadgeVariant } from "@/components/ui/badge";

export interface StatusStyle {
  label: string;
  variant: BadgeVariant;
}

/**
 * Define a status → {label, variant} map once, next to the domain's types:
 *
 *   export const POST_STATUS = defineStatusMap<PostStatus>({
 *     open: { label: "Open", variant: "neutral" }, ...
 *   });
 *
 * and render it with `<StatusBadge map={POST_STATUS} value={post.status} />`.
 * A value the map doesn't know renders as itself, muted, rather than crashing.
 */
export function defineStatusMap<K extends string>(map: Record<K, StatusStyle>) {
  return map;
}

export function StatusBadge<K extends string>({
  map,
  value,
  className,
}: {
  map: Record<K, StatusStyle>;
  value: K;
  className?: string;
}) {
  const style = map[value];
  return (
    <Badge variant={style?.variant ?? "muted"} className={className}>
      {style?.label ?? value}
    </Badge>
  );
}
