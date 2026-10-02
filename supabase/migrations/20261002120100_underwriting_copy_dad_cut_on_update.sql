-- The DAD cut trigger (20261002120000) also runs on update, so switching a
-- message from "Existing DAD spot" back to "New recording" on the copy form
-- gets it a fresh Portal cut: the form clears dad_cut, and the trigger
-- assigns the next number. A cut is only ever cleared that way, so an
-- update that leaves dad_cut null when it was already null (copy that
-- plays an existing spot nobody has picked yet) changes nothing.

create or replace function public.uw_copy_assign_dad_cut()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.dad_cut is null
     and (tg_op = 'INSERT' or old.dad_cut is not null)
     and not private.uw_script_plays_recording(new.script) then
    new.dad_cut := private.uw_next_dad_cut();
  end if;
  return new;
end;
$$;

-- create or replace, not drop and recreate: a drop hangs through the
-- Supabase MCP (see 20261002120000's header).
create or replace trigger uw_copy_assign_dad_cut
  before insert or update of dad_cut on public.uw_copy
  for each row execute function public.uw_copy_assign_dad_cut();
