-- Stand-ins for the parts of Supabase the Portal's migrations need, for running the replay on plain Postgres
-- (CI's comparison job, or a laptop without Docker): the auth and storage schemas, their roles, and pgvector.
-- A real Supabase project already has all of this. Needs the pgvector extension installed in the server.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_admin nologin; create role authenticator nologin;
create schema extensions; create schema auth; create schema storage;
create extension pgcrypto with schema extensions; create extension pg_trgm with schema extensions;
create extension "uuid-ossp" with schema extensions; create extension unaccent with schema extensions;
create extension btree_gist with schema extensions; create extension citext with schema extensions;
create extension vector with schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, aud text, role text,
  raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', is_anonymous boolean default false,
  created_at timestamptz default now(), encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  invited_at timestamptz, confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), path_tokens text[]);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
