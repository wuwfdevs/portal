-- Resources: pinned procedures.
--
-- The Resources home page leads its procedures section with "When something
-- breaks on air" — the procedures someone needs mid-outage, one click away.
-- Which procedures appear there is an editor's choice, so it's stored here
-- rather than derived from an area.
--
-- A separate table, not a column on rc_articles: an update to rc_articles
-- goes through rc_articles_before_update()/rc_articles_snapshot_version(),
-- touches updated_at, and (when source = 'editor') can mark a guide as
-- edited since release. Pinning isn't an edit to the procedure, and it
-- shouldn't read as one on the page or in its history.

create table public.rc_pinned_procedures (
  article_id uuid primary key references public.rc_articles (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  pinned_by uuid references public.profiles (id) on delete set null default auth.uid()
);

comment on table public.rc_pinned_procedures is
  'Procedures an editor pinned to the Resources home page''s "When something breaks on air" block, in pinned_at order.';

-- Only procedures can be pinned. A trigger rather than a check constraint,
-- since the kind lives on the parent row.
create function public.rc_pinned_procedures_check_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.rc_articles where id = new.article_id and kind = 'procedure'
  ) then
    raise exception 'Only a procedure can be pinned';
  end if;
  return new;
end;
$$;

create trigger rc_pinned_procedures_check_kind
  before insert or update on public.rc_pinned_procedures
  for each row execute function public.rc_pinned_procedures_check_kind();

revoke execute on function public.rc_pinned_procedures_check_kind() from public, anon, authenticated;

alter table public.rc_pinned_procedures enable row level security;

grant select, insert, delete on public.rc_pinned_procedures to authenticated;

-- Follows the parent: the subquery runs under rc_articles' own RLS, so a pin
-- is visible exactly when its procedure is.
create policy rc_pinned_procedures_select on public.rc_pinned_procedures
  for select to authenticated
  using (exists (select 1 from public.rc_articles a where a.id = article_id));

create policy rc_pinned_procedures_insert on public.rc_pinned_procedures
  for insert to authenticated
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_pinned_procedures_delete on public.rc_pinned_procedures
  for delete to authenticated
  using ((select private.is_resources_editor((select auth.uid()))));

-- The four engineering recovery procedures the redesign started with, in
-- that order. Matched on slug, never id; a slug that doesn't exist on this
-- project (preview's sample content) is simply skipped.
insert into public.rc_pinned_procedures (article_id, pinned_at, pinned_by)
select a.id, now() + (pin.ord * interval '1 second'), null
from unnest(array[
  'restart-after-a-total-power-failure',
  'restart-a-web-stream',
  'switch-hd3-to-the-main-feed',
  'use-the-fpren-codec'
]) with ordinality as pin (slug, ord)
join public.rc_articles a on a.slug = pin.slug and a.kind = 'procedure'
on conflict (article_id) do nothing;

select private.rc_release_note(
  p_slug => 'release-2026-09-28-resources-home',
  p_tool_key => null,
  p_released_on => '2026-09-28',
  p_title => 'A clearer Resources home page',
  p_body => $body$
{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Resources now opens with a larger search that can be limited to procedures, tool guides, or release notes. Each tool guide card lists the guides inside it, procedures are grouped by area, and the latest release notes sit in a column on the right. A short list of pinned procedures, under \"When something breaks on air\", keeps the station's recovery steps one click away; editors pin or unpin a procedure from its own page."}]}]}
$body$
);
