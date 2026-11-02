-- Copy knows whether its DAD cut has been recorded (docs/broadcast-roles.md,
-- "Production").
--
-- A Portal-assigned cut (NNNNNA) is only a number until someone records the
-- message into DAD under it; until then DAD has nothing to play, and an
-- automated break that names it is dead air. So:
--
--   * uw_copy.dad_recorded_at / dad_recorded_by say production marked it
--     recorded. An existing DAD spot (a plain five-digit cut) is recorded by
--     definition and never needs the mark.
--   * Changing the cut, or a Portal-cut message's script, clears the mark:
--     the recording under that cut no longer matches. Only an explicit
--     change to dad_recorded_at in the same write keeps it.
--   * Setting or clearing the mark is production's (or an administrator's):
--     private.is_underwriting_production(). RLS admits every member's
--     update to uw_copy, so the trigger is the boundary, the same shape as
--     uw_guard_exception_resolution(). A write with no session (a
--     migration) passes.
--
-- Nothing is backfilled as recorded. The cuts adopted from RadioTraffic's
-- cart numbers were never confirmed against DAD (20261002120000 found no
-- lettered cuts in WUWF's library), so every Portal cut starts on the
-- To record list.

alter table public.uw_copy
  add column dad_recorded_at timestamptz,
  add column dad_recorded_by uuid references public.profiles (id);

create function public.uw_copy_dad_recording()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_explicit boolean;
begin
  if tg_op = 'INSERT' then
    v_explicit := new.dad_recorded_at is not null;
  else
    v_explicit := new.dad_recorded_at is distinct from old.dad_recorded_at;
  end if;

  if v_explicit and auth.uid() is not null
     and not private.is_underwriting_production(auth.uid()) then
    raise exception 'Only production can mark copy recorded in DAD.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and not v_explicit and (
       new.dad_cut is distinct from old.dad_cut
       or (new.dad_cut like '%A' and new.script is distinct from old.script)
     ) then
    new.dad_recorded_at := null;
  end if;

  if new.dad_recorded_at is null then
    new.dad_recorded_by := null;
  elsif v_explicit then
    new.dad_recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger uw_copy_dad_recording
  before insert or update on public.uw_copy
  for each row execute function public.uw_copy_dad_recording();
