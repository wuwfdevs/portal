-- Phase 3 (transcript correction): splitting a segment needs to shift every
-- later segment's position by +1 to make room, atomically. supabase-js's
-- .update() only accepts literal values, not expressions like
-- "position = position + 1", so that bulk shift needs a Postgres function
-- callable via RPC. Not security definer: it should run as the calling
-- user, so the existing tw_segments_member_all RLS policy still applies to
-- the update inside it — no privilege bypass needed since any transcription
-- tool member already has full update rights on segments.

create function public.tw_shift_segment_positions(p_project_id uuid, after_position integer, delta integer)
returns void
language sql
set search_path = public
as $$
  update public.tw_segments
  set position = position + delta
  where project_id = p_project_id
    and position > after_position;
$$;

grant execute on function public.tw_shift_segment_positions(uuid, integer, integer) to authenticated;
