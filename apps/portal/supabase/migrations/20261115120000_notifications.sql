-- The notification layer (docs/notifications-design.md): a Notification Center per person, email queued for the scheduled run, and each
-- person's preferences. Portal-level, not a tool: no registry row. Both tables are per-person records and are emptied on a fresh install
-- (they are not on the clearing script's keep list).
--
--   1. notification_inbox rows are written only by the server's service client (notify()): the recipient is usually not the person
--      acting, so there is no insert policy. A recipient reads their own rows through a COLUMN grant that leaves out the email delivery
--      columns (a mail provider's error text is not for them), and may update `read_at` and nothing else (a column grant, not only a
--      policy), so a recipient cannot rewrite the words they were sent. `select *` is refused; queries name their columns.
--   2. notification_preferences holds only a choice that differs from the code catalog's default. A type the catalog no longer has is
--      ignored by the reader; no migration is needed to add or retire a type.
--   3. notification_claim_emails / notification_finish_email are the scheduled run's two steps. The claim takes due rows with
--      `for update skip locked` and pushes each one's next attempt five minutes out (a lease), so two overlapping runs cannot send one
--      row twice and a crash between claim and finish costs a retry, never a duplicate or a lost row. service_role only.

create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 80),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 2000),
  -- A local path ("/roadmap/<id>"), never an address; notify() refuses anything else.
  href text check (href is null or (href like '/%' and href not like '//%' and char_length(href) <= 300)),
  -- False when the person turned the Notification Center off for this type but still wants the email: the row is then only the
  -- email's outbox entry and the Center does not list it.
  in_app boolean not null default true,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_state text not null default 'none' check (email_state in ('none', 'pending', 'sent', 'failed')),
  email_attempts integer not null default 0,
  email_next_attempt_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_last_error text check (email_last_error is null or char_length(email_last_error) <= 900),
  -- Nulls are distinct, so an event with no key never collides; a repeated raise of one with a key does nothing.
  unique (recipient_id, dedupe_key)
);

comment on table public.notification_inbox is
  'One row per person per event. Written only by the server (service role). Readable by its recipient through a column grant that omits the email delivery columns.';

create index notification_inbox_recipient_idx
  on public.notification_inbox (recipient_id, created_at desc)
  where in_app;

create index notification_inbox_unread_idx
  on public.notification_inbox (recipient_id)
  where in_app and read_at is null;

create index notification_inbox_email_due_idx
  on public.notification_inbox (email_next_attempt_at)
  where email_state = 'pending';

create index notification_inbox_created_idx
  on public.notification_inbox (created_at);

alter table public.notification_inbox enable row level security;

create policy notification_inbox_select_own on public.notification_inbox
  for select to authenticated
  using (recipient_id = auth.uid());

create policy notification_inbox_update_own on public.notification_inbox
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

revoke all on public.notification_inbox from anon, authenticated;
grant select (id, recipient_id, type, title, body, href, in_app, created_at, read_at)
  on public.notification_inbox to authenticated;
grant update (read_at) on public.notification_inbox to authenticated;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 80),
  in_app boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

comment on table public.notification_preferences is
  'Only a choice that differs from the catalog default (lib/notifications/catalog.ts) is stored. A type the catalog no longer has is ignored.';

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notification_preferences_delete_own on public.notification_preferences
  for delete to authenticated
  using (user_id = auth.uid());

create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- The scheduled run's two steps --------------------------------------------------

create function public.notification_claim_emails(p_limit integer default 25)
returns table (
  notification_id uuid,
  to_email text,
  to_name text,
  notif_type text,
  notif_title text,
  notif_body text,
  notif_href text,
  attempt integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id
    from public.notification_inbox n
    join public.profiles p on p.id = n.recipient_id
    where n.email_state = 'pending'
      and n.email_next_attempt_at <= now()
      and p.account_status = 'active'
    order by n.created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update of n skip locked
  ),
  claimed as (
    update public.notification_inbox n
       set email_attempts = n.email_attempts + 1,
           email_next_attempt_at = now() + interval '5 minutes'
      from due
     where n.id = due.id
    returning n.id, n.recipient_id, n.type, n.title, n.body, n.href, n.email_attempts
  )
  select c.id, p.email, p.display_name, c.type, c.title, c.body, c.href, c.email_attempts
  from claimed c
  join public.profiles p on p.id = c.recipient_id;
end;
$$;

create function public.notification_finish_email(
  p_id uuid,
  p_ok boolean,
  p_error text,
  p_max_attempts integer default 5
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ok then
    update public.notification_inbox
       set email_state = 'sent', email_sent_at = now(), email_last_error = null
     where id = p_id;
  else
    update public.notification_inbox
       set email_last_error = left(coalesce(p_error, 'The email could not be sent.'), 900),
           email_state = case when email_attempts >= p_max_attempts then 'failed' else 'pending' end,
           -- A growing delay: 5, 10, 15 ... minutes after the attempt that just failed.
           email_next_attempt_at = now() + (least(email_attempts, 6) * interval '5 minutes')
     where id = p_id;
  end if;
end;
$$;

revoke execute on function public.notification_claim_emails(integer) from public, anon, authenticated;
grant execute on function public.notification_claim_emails(integer) to service_role;
revoke execute on function public.notification_finish_email(uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.notification_finish_email(uuid, boolean, text, integer) to service_role;
