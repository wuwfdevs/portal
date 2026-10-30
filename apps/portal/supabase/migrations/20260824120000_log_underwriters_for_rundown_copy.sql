-- The rundown screen shows each underwriting credit's copy (label, script,
-- cart — via uw_copy_select_for_log) but not WHO the credit is for. The
-- underwriter's name lives on uw_underwriters, reached either by direct
-- attribution (uw_copy.underwriter_id — set by the program-log import) or
-- through uw_contract_copy → uw_contracts.underwriter_id (traffic-era
-- copy), and a Log-only session can read none of those tables. Requested
-- directly: "underwriting credit cards on the rundown should show the
-- underwriter."
--
-- A security-definer read, not an RLS policy, for the same reason
-- log_import_list_underwriting_copy() is one (see
-- 20260821180000_log_program_log_import.sql): contract attribution needs a
-- join through uw_contract_copy/uw_contracts, which a policy-based approach
-- would only reach by opening two more staff-only tables to Log members.
-- The scope mirrors uw_copy_select_for_log exactly — only copy rows
-- actually referenced by a log_rundown_items row are ever named.

create function public.log_underwriters_for_copy(p_copy_ids uuid[])
returns table (copy_id uuid, underwriter_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    return;
  end if;

  return query
  select
    c.id,
    coalesce(
      du.name,
      (
        select cu.name
        from public.uw_contract_copy cc
        join public.uw_contracts k on k.id = cc.contract_id
        join public.uw_underwriters cu on cu.id = k.underwriter_id
        where cc.copy_id = c.id
        order by k.created_at
        limit 1
      )
    )
  from public.uw_copy c
  left join public.uw_underwriters du on du.id = c.underwriter_id
  where c.id = any (p_copy_ids)
    and exists (
      select 1 from public.log_rundown_items lri
      where lri.underwriting_copy_id = c.id
    );
end;
$$;

comment on function public.log_underwriters_for_copy (uuid[]) is
  'Resolves each referenced uw_copy row''s underwriter name for the Log rundown screen — direct attribution (uw_copy.underwriter_id) first, contract attribution (uw_contract_copy -> uw_contracts) otherwise. Scoped to copy a log_rundown_items row references, has_log_access-gated.';

revoke execute on function public.log_underwriters_for_copy (uuid[]) from public, anon;
grant execute on function public.log_underwriters_for_copy (uuid[]) to authenticated;
