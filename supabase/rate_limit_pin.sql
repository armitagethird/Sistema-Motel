-- ============================================================
-- Paraíso Motel — Rate Limiting para validate_manager_pin
-- Colar no SQL Editor do Supabase e executar.
-- Máximo: 5 tentativas erradas por usuário em 15 minutos.
-- ============================================================

create or replace function validate_manager_pin(
  pin_input    text,
  requester_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id         uuid;
  v_name       text;
  v_fail_count int := 0;
begin
  -- Rate limit: bloqueia após 5 falhas em 15 min (por requisitante)
  if requester_id is not null then
    select count(*) into v_fail_count
    from audit_log
    where user_id = requester_id
      and operation = 'FAILED_PIN_ATTEMPT'
      and created_at > now() - interval '15 minutes';

    if v_fail_count >= 5 then
      return json_build_object('error', 'rate_limited');
    end if;
  end if;

  select id, name into v_id, v_name
  from profiles
  where role in ('manager', 'owner')
    and active = true
    and pin_hash is not null
    and pin_hash = crypt(pin_input, pin_hash)
  limit 1;

  if v_id is null then
    return null;
  end if;

  return json_build_object('user_id', v_id, 'name', v_name);
end;
$$;
