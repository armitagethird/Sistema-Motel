-- migration_v4.sql
-- RPC segura para leitura de auth.audit_log_entries (owner only)
-- Usar security definer para acessar schema auth sem expor service role key

create or replace function get_auth_audit_logs(lim int default 100)
returns table (
  entry_id    uuid,
  created_at  timestamptz,
  ip_address  text,
  action      text,
  actor_id    text,
  actor_email text
)
security definer
set search_path = public, auth
language plpgsql
as $$
begin
  if not exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'owner'
  ) then
    raise exception 'unauthorized';
  end if;

  return query
  select
    ale.id        as entry_id,
    ale.created_at,
    coalesce(
      ale.ip_address::text,
      (ale.payload -> 'traits' ->> 'ip_address')
    )             as ip_address,
    coalesce(
      ale.payload ->> 'action',
      ale.payload ->> 'event'
    )             as action,
    coalesce(
      ale.payload ->> 'actor_id',
      ale.payload ->> 'user_id'
    )             as actor_id,
    coalesce(
      ale.payload ->> 'actor_username',
      ale.payload ->> 'email'
    )             as actor_email
  from auth.audit_log_entries ale
  order by ale.created_at desc
  limit lim;
end;
$$;

grant execute on function get_auth_audit_logs(int) to authenticated;

-- ============================================================
-- SELECT policy para audit_log (owner e manager)
-- Usa security definer para não chamar profiles dentro de policy RLS
-- (evita risco de recursão conforme arquitetura do projeto)
-- ============================================================

create or replace function is_owner_or_manager()
returns boolean
security definer
set search_path = public
language sql
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('owner', 'manager')
  );
$$;

grant execute on function is_owner_or_manager() to authenticated;

create policy "audit_select_owner_manager" on audit_log
  for select to authenticated
  using (is_owner_or_manager());
