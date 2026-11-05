-- Clears WUWF's data out of a database built by replaying WUWF's migrations.
--
-- A NEW STATION DOES NOT RUN THIS. Since 2026-11-05 a station installs supabase/baseline/ (INSTALL.md), which is
-- this script's output: supabase/baseline/generate.sh runs it on a replay of WUWF's history and writes the
-- baseline from what is left, and CI runs it again to prove the baseline still equals that. The list of tables it
-- keeps is therefore what decides which data is the product's and which is a station's.
--
-- READ THIS FIRST. This script is destructive. It is never run against WUWF's databases, which hold WUWF's data
-- on purpose, and it refuses to run against any database that already holds a station:
--
--   * it stops if any user account exists (a database built from the migrations has none), and
--   * it stops if the station already has a name in public.station_settings (WUWF's does).
--
-- Both checks run before anything is deleted. The script is one transaction (run it with
-- `psql --single-transaction -v ON_ERROR_STOP=1 -f`), so a refusal or any error leaves the database exactly as
-- it was.
--
-- Why it exists: about 275 migrations replay in order, and roughly 170 of them insert WUWF's clocks,
-- schedule, rates, editorial pillars and criteria, or Resources content. Applied migrations cannot be
-- edited, so a replay of them holds WUWF's operational data. See docs/new-station-install-data.md.
--
-- What it does:
--   1. Keeps the tables that are the product, not a station's data (the list in `v_keep`).
--   2. Empties every other table in `public` (TRUNCATE without CASCADE: if a kept table pointed at one
--      of them the statement would fail loudly rather than reach into it).
--   3. Removes Resources release notes and procedures, and every article's superseded versions, which
--      carry the wording from before the guides were made station-neutral.
--   4. Gives Academic Partnerships and Bookings neutral starting copy, clears the one WUWF link in it, and
--      rewords the three pitch-form fields and two tool descriptions that name WUWF.
--
-- Safe to run twice on a database that has not been given a name or accounts since: the second run finds
-- nothing to do. It does not touch auth.*, storage objects, or the migrations' own bookkeeping.

create function pg_temp.clear_seed_data_for_new_station() returns void
language plpgsql
as $$
declare
  -- Platform tables and the product's own content: left exactly as the migrations made them.
  v_keep text[] := array[
    -- platform
    'profiles', 'tools', 'tool_access', 'access_requests', 'audit_events', 'station_settings',
    -- Resources guides and what hangs off them (release notes and procedures are removed below)
    'rc_articles', 'rc_article_versions', 'rc_article_embeddings', 'rc_media', 'rc_release_note_guides',
    -- Sourcework's prompts and piece formats
    'sw_prompt_versions', 'sw_prompt_live', 'sw_prompt_drafts',
    'sw_piece_formats', 'sw_piece_format_versions', 'sw_piece_format_drafts',
    -- generic lookup and the pitch form
    'uw_industry_categories', 'ep_form_fields',
    -- singletons the app expects to exist; their starting copy is rewritten below
    'ap_settings', 'ap_email_templates', 'bk_settings', 'ep_settings'
  ];
  v_clear text[];
  v_blocking text;
begin
  -- The guard. Nothing has been changed yet.
  if not exists (select 1 from public.station_settings where id) then
    raise exception 'Refusing to clear anything: public.station_settings has no row. Is this a Portal database with every migration applied?';
  end if;
  if exists (select 1 from public.profiles) then
    raise exception 'Refusing to clear anything: this database already has user accounts. This script is only for a brand-new database, before anyone has signed in.';
  end if;
  if exists (select 1 from public.station_settings where id and display_name is not null) then
    raise exception 'Refusing to clear anything: this database already has a named station. This script is only for a brand-new database.';
  end if;

  -- Every ordinary table in public that is not kept.
  select coalesce(array_agg(format('%I.%I', n.nspname, c.relname) order by c.relname), '{}')
    into v_clear
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname <> all (v_keep);

  -- A kept table that points at a table about to be emptied would have to be emptied too. Say so
  -- instead of discovering it half way through.
  select string_agg(format('%s -> %s', src.relname, dst.relname), ', ')
    into v_blocking
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_class dst on dst.oid = con.confrelid
  join pg_namespace n on n.oid = src.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
    and src.relname = any (v_keep)
    and format('%I.%I', 'public', dst.relname) = any (v_clear);
  if v_blocking is not null then
    raise exception 'A kept table references a table that would be emptied (%). Reclassify one of them in this script.', v_blocking;
  end if;

  if cardinality(v_clear) > 0 then
    execute 'truncate table ' || array_to_string(v_clear, ', ') || ' restart identity';
  end if;

  -- Resources: a new station keeps the guides, not WUWF's procedures or its history of changes. The
  -- foreign keys cascade, so a deleted note takes its versions, screenshots, embeddings and links with it.
  delete from public.rc_articles where kind in ('release_note', 'procedure');
  delete from public.rc_article_versions v
  where exists (
    select 1 from public.rc_article_versions w
    where w.article_id = v.article_id and w.version > v.version
  );

  -- Academic Partnerships: neutral copy, closed until the station opens it, and no one's calendar link.
  update public.ap_settings set
    is_open = false,
    intro_copy = 'Tell us about the partnership you have in mind. A staff member will review your inquiry and follow up by email — submitting this form does not guarantee a partnership, publication, distribution, or news coverage.',
    confirmation_copy = 'Thank you. We will review your inquiry and follow up by email. Submitting this form does not guarantee a partnership, publication, distribution, or news coverage.',
    google_appointments_url = null
  where id;

  update public.ap_email_templates set subject = 'Your partnership is approved',
    body = E'Hi {{faculty_name}},\n\nGood news — we''d like to move forward with this partnership.\n\n{{staff_context}}\n\nWe''ll be in touch about next steps,\nThe station team'
  where key = 'approve';
  update public.ap_email_templates set subject = 'Your partnership inquiry',
    body = E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with us. We are not able to move forward with this at this time.\n\n{{staff_context}}\n\nThank you for thinking of us,\nThe station team'
  where key = 'decline';
  update public.ap_email_templates set subject = 'Your partnership inquiry',
    body = E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with us. We are not able to take this on right now, but we would like to revisit it later.\n\n{{staff_context}}\n\nThanks for your patience,\nThe station team'
  where key = 'defer';
  update public.ap_email_templates set subject = 'Following up after our partnership',
    body = E'Hi {{faculty_name}},\n\nNow that our partnership has wrapped up, we''d love to hear how it went and whether you''d be interested in working together again.\n\n{{staff_context}}\n\nThanks again,\nThe station team'
  where key = 'follow_up';
  update public.ap_email_templates set subject = 'Following up on your partnership inquiry',
    body = E'Hi {{faculty_name}},\n\nThanks for reaching out about a partnership with us. We''d like to set up a short call to talk through what you have in mind.\n\nYou can pick a time here: {{appointments_url}}\n\n{{staff_context}}\n\nLooking forward to it,\nThe station team'
  where key = 'meeting_invite';
  update public.ap_email_templates set subject = 'A thought on your partnership inquiry',
    body = E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with us. We think this could work well in a narrower or somewhat different form than originally proposed.\n\n{{staff_context}}\n\nLet us know what you think,\nThe station team'
  where key = 'narrower_scope';
  update public.ap_email_templates set subject = 'A quick question about your partnership inquiry',
    body = E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with us. Before we go further, could you tell us more?\n\n{{staff_context}}\n\nThanks,\nThe station team'
  where key = 'request_info';

  -- Editorial Planning's pitch form: three fields say "WUWF" in their label or help text.
  update public.ep_form_fields set
    help_text = 'How would this reporting advance the station''s understanding or coverage of the selected priority? Required when a defined pillar is selected above — not when the pitch is outside current pillars, emerging, or an immediate need.'
  where key = 'pillar_contribution';
  update public.ep_form_fields set label = 'Related station coverage or existing reporting'
  where key = 'prior_coverage';
  update public.ep_form_fields set
    help_text = 'Briefly describe likely evidence, source categories, records or data, locations or scenes, and what the station could contribute beyond existing coverage.'
  where key = 'reporting_approach';

  -- The registry's own descriptions of the two tools that were built around WUWF's setup.
  update public.tools set description = 'Faculty inquiries for the station''s media partnership program, from submission through active partnership.'
  where key = 'academic-partnerships';
  update public.tools set description = 'Sign in to the station''s website content system to write, review and publish stories, manage sponsors and agreements, and review listening answers.'
  where key = 'website';

  -- Bookings: neutral copy, closed, and no packages offered until the station defines its own.
  update public.bk_settings set
    is_open = false,
    intro_copy = 'Tell us what you have in mind — a webcast, a studio or field production, editing, or airtime for a university message. Our production staff will review the request, estimate it, and follow up by email. Submitting this form does not book a date or commit the station to the work.',
    closed_copy = 'We are not taking new production requests right now. Please check back later, or contact the station directly.',
    confirmation_copy = 'Thank you. Our production staff will review your request and follow up by email with an estimate. Nothing is booked until you approve that estimate.',
    offered_packages = '{}'
  where id;
end;
$$;

select pg_temp.clear_seed_data_for_new_station();
