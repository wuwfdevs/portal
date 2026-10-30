-- Widens log_list_placeable_rundown_breaks() to expose each candidate
-- break's current last item, so the auto-fill scheduler
-- (lib/underwriting/auto-fill.ts) can enforce "the same underwriter never
-- runs back to back, and neither does the same industry" within one break
-- — a real, contractual promise, not a nice-to-have: the reference Autumn
-- Beck Blackledge agreement's own terms say "WUWF will make appropriate
-- changes in scheduling to insure that your sponsorship message does not
-- run adjacent to a business with similar services or products," and its
-- own conflict category is "Lawyers."
--
-- A break can legitimately hold several different underwriters' credits at
-- once when its remaining capacity allows (log_rundown_breaks.allow_multiple)
-- — the manual "Place a credit" flow already permitted this, it just never
-- had a same-underwriter/same-category check attached, because the
-- competitive-adjacency check (lib/underwriting/adjacency.ts) is a
-- program-wide *advisory* a human sees and decides what to do with
-- (docs/underwriting-design.md §6: "purely informational... never a
-- block"). Auto-fill has no human in the loop at the moment it places a
-- credit, so the same real concern needs to be an enforced check there
-- instead, and unlike the advisory it can be exact: "back to back" only
-- ever means "immediately adjacent within the same break" (per product
-- direction — cross-break adjacency is out of scope), so all that check
-- needs to know is whichever item currently holds the highest position in
-- a candidate break.
--
-- log_place_underwriting_credit() always appends at the end
-- (v_next_position = max(position) + 1), so a break's *last* item is the
-- only one a newly-appended item could ever be adjacent to — nothing else
-- in the break needs to be inspected. This function is security definer
-- and already reads log_rundown_items past RLS for the occupancy count, so
-- exposing one more item id is no new access surface, just a new field on
-- an existing response.
--
-- Deliberately returns the item id, not its underwriting_copy_id or
-- underwriter directly: a copy row can be linked to more than one contract
-- (uw_contract_copy is many-to-many), so copy_id alone can't identify which
-- underwriter actually aired it. The caller (lib/underwriting/queries.ts's
-- resolveLastItemAdjacency()) resolves the id through uw_scheduled_placements
-- instead, which does record the exact schedule_line_id (and therefore
-- contract and underwriter) a specific placement belongs to — a plain read
-- against this tool's own table, not a new security-definer surface.

create or replace function public.log_list_placeable_rundown_breaks(p_schedule_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.uw_contract_schedule_lines;
  v_breaks jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'break_id', b.id,
    'rundown_id', lr.id,
    'air_date', lr.air_date,
    'scheduled_at', b.scheduled_at,
    'label', b.label,
    'program_name', lp.name,
    'remaining_seconds', b.available_duration_seconds - coalesce(occupied.total, 0),
    'last_item_id', last_item.id
  ) order by b.scheduled_at), '[]'::jsonb)
  into v_breaks
  from public.log_rundown_breaks b
  join public.log_rundowns lr on lr.id = b.rundown_id
  join public.log_programs lp on lp.id = lr.program_id
  left join lateral (
    select sum(i.planned_duration_seconds) as total
    from public.log_rundown_items i
    where i.break_id = b.id
  ) occupied on true
  left join lateral (
    select i.id
    from public.log_rundown_items i
    where i.break_id = b.id
    order by i.position desc
    limit 1
  ) last_item on true
  where 'underwriting_credit' = any(b.permitted_content_types)
    and (b.allow_multiple or coalesce((
      select count(*) from public.log_rundown_items i2 where i2.break_id = b.id
    ), 0) = 0)
    and lr.air_date >= v_line.start_date
    and (v_line.end_date is null or lr.air_date <= v_line.end_date)
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and extract(dow from lr.air_date)::integer = any(v_line.days_of_week);

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every currently-open Log rundown break eligible for this schedule line (permits underwriting_credit, has remaining capacity, within the line''s program/day-of-week/date eligibility), including last_item_id — the id of whichever item currently holds the break''s highest position, if any, so a caller can check same-underwriter/same-industry adjacency before appending another credit. Security definer: the caller may have no Log access at all.';

revoke execute on function public.log_list_placeable_rundown_breaks(uuid) from public, anon;
grant execute on function public.log_list_placeable_rundown_breaks(uuid) to authenticated;
