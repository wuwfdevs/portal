-- An exception closes itself once its last open makegood airs
-- (docs/underwriting-traffic-redesign.md §17).
--
-- Until now nothing resolved an exception after its makegood aired:
-- uw_update_makegood_from_broadcast_event() flips the makegood to 'aired',
-- and the exception stayed 'open' until someone remembered to resolve it by
-- hand. This trigger follows that one: when a makegood becomes 'aired' and
-- no other makegood on the same exception is still 'scheduled' (a cancelled
-- one doesn't count), the exception is resolved. A decision staff already
-- recorded is kept; an exception with none is recorded as resolved by
-- makegood. resolved_by stays null — nobody clicked — and the notes say so.
--
-- Security definer for the same reason as the trigger that fires it: the
-- broadcast event is inserted by a Log host, who has no update grant on
-- uw_exceptions. uw_guard_exception_resolution() only polices a waive,
-- which this never sets.

create or replace function public.uw_resolve_exception_when_makegoods_aired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'aired' or old.status = 'aired' then
    return new;
  end if;

  if exists (
    select 1
    from public.uw_makegoods m
    where m.exception_id = new.exception_id
      and m.id <> new.id
      and m.status = 'scheduled'
  ) then
    return new;
  end if;

  update public.uw_exceptions
  set resolution_status = 'resolved',
      resolution_action = coalesce(resolution_action, 'schedule_makegood'),
      resolved_at = now(),
      resolved_by = null,
      resolution_notes = concat_ws(
        E'\n',
        nullif(resolution_notes, ''),
        'Resolved automatically when its makegood aired.'
      )
  where id = new.exception_id
    and resolution_status = 'open';

  return new;
end;
$$;

comment on function public.uw_resolve_exception_when_makegoods_aired() is
  'Resolves an open exception once its last scheduled makegood is marked aired.';

revoke execute on function public.uw_resolve_exception_when_makegoods_aired() from public, anon, authenticated;

create trigger uw_makegoods_resolve_exception
  after update of status on public.uw_makegoods
  for each row execute function public.uw_resolve_exception_when_makegoods_aired();

-- Exceptions whose makegoods already aired before this trigger existed.
update public.uw_exceptions e
set resolution_status = 'resolved',
    resolution_action = coalesce(e.resolution_action, 'schedule_makegood'),
    resolved_at = now(),
    resolved_by = null,
    resolution_notes = concat_ws(
      E'\n',
      nullif(e.resolution_notes, ''),
      'Resolved automatically when its makegood aired.'
    )
where e.resolution_status = 'open'
  and exists (
    select 1 from public.uw_makegoods m where m.exception_id = e.id and m.status = 'aired'
  )
  and not exists (
    select 1 from public.uw_makegoods m where m.exception_id = e.id and m.status = 'scheduled'
  );
