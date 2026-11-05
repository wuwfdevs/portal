-- Fingerprint of the Portal's database objects: one "object|hash" line per column, constraint, index, policy,
-- function, grant, trigger, enum, view and storage bucket. Run with psql -At on two databases and diff the output
-- to see whether they hold the same schema (verify.sh does). The hash is of each object's definition as Postgres
-- prints it, so formatting in the source files does not matter but a changed definition does.
with rels as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity, c.reloptions, c.relpersistence, n.nspname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname in ('public','private') and c.relkind in ('r','p','v','m'))
     or (n.nspname = 'storage' and c.relname in ('objects','buckets') )
     or (n.nspname = 'auth' and c.relname = 'users')
), grantees as (
  select 0::oid as oid, 'public'::text as nm union all
  select oid, rolname from pg_roles where rolname in ('anon','authenticated','service_role')
), objs(k, d) as (
  select 'rel|'||nspname||'.'||relname, relkind::text||'|'||relrowsecurity||'|'||relforcerowsecurity||'|'||coalesce(reloptions::text,'')||'|'||relpersistence::text from rels where nspname in ('public','private')
  union all
  select 'col|'||r.nspname||'.'||r.relname||'.'||a.attname,
         format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||'|'||a.attgenerated::text||'|'||a.attidentity::text
  from rels r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where r.nspname in ('public','private') and r.relkind in ('r','p')
  union all
  select 'con|'||r.nspname||'.'||r.relname||'.'||co.conname, co.contype::text||'|'||pg_get_constraintdef(co.oid)
  from rels r join pg_constraint co on co.conrelid=r.oid where r.nspname in ('public','private')
  union all
  select 'idx|'||schemaname||'.'||tablename||'.'||indexname, indexdef from pg_indexes where schemaname in ('public','private')
  union all
  select 'pol|'||r.nspname||'.'||r.relname||'.'||p.polname,
         p.polcmd::text||'|'||p.polpermissive||'|'||coalesce((select string_agg(coalesce(ro.rolname,'public'), ',' order by coalesce(ro.rolname,'public')) from unnest(p.polroles) u(oid) left join pg_roles ro on ro.oid=u.oid),'')
         ||'|'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
  from rels r join pg_policy p on p.polrelid=r.oid
  union all
  select 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend dp where dp.objid=p.oid and dp.deptype='e')
  union all
  select 'facl|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         coalesce((select string_agg(g.nm||':'||x.privilege_type, ',' order by g.nm, x.privilege_type)
                   from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x join grantees g on g.oid = x.grantee),'')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend dp where dp.objid=p.oid and dp.deptype='e')
  union all
  select 'tacl|'||r.nspname||'.'||r.relname,
         coalesce((select string_agg(g.nm||':'||x.privilege_type, ',' order by g.nm, x.privilege_type)
                   from aclexplode(coalesce(r.relacl, acldefault('r', r.relowner))) x join grantees g on g.oid = x.grantee),'')
  from rels r where r.nspname in ('public','private')
  union all
  select 'cacl|'||r.nspname||'.'||r.relname||'.'||a.attname,
         (select string_agg(g.nm||':'||x.privilege_type, ',' order by g.nm, x.privilege_type) from aclexplode(a.attacl) x join grantees g on g.oid=x.grantee)
  from rels r join pg_attribute a on a.attrelid=r.oid and a.attacl is not null and not a.attisdropped where r.nspname in ('public','private')
  union all
  select 'trg|'||r.nspname||'.'||r.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)
  from rels r join pg_trigger t on t.tgrelid=r.oid and not t.tgisinternal
  union all
  select 'enum|'||n.nspname||'.'||t.typname, (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)
  from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private') and t.typtype='e'
  union all
  select 'dom|'||n.nspname||'.'||t.typname, format_type(t.typbasetype,t.typtypmod)||'|'||t.typnotnull||'|'||coalesce(t.typdefault,'')||'|'||coalesce((select string_agg(pg_get_constraintdef(c.oid), ';' order by c.conname) from pg_constraint c where c.contypid=t.oid),'')
  from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private') and t.typtype='d'
  union all
  select 'view|'||nspname||'.'||relname, pg_get_viewdef(oid,true) from rels where relkind in ('v','m') and nspname in ('public','private')
  union all
  select 'bucket|'||id, public||'|'||coalesce(file_size_limit::text,'')||'|'||coalesce(allowed_mime_types::text,'') from storage.buckets
), fp as (select k, md5(d) as h, split_part(k,'|',1) as kind from objs)
select k || '|' || h from fp order by k;
