-- ============================================================
-- Paraíso Motel — Fixup pgcrypto + Manager
-- Colar inteiro no SQL Editor do Supabase e executar.
-- ============================================================

-- 1. Habilitar pgcrypto (instala no schema extensions)
create extension if not exists pgcrypto schema extensions;

-- 2. Corrigir validate_manager_pin para usar extensions.crypt()
create or replace function validate_manager_pin(pin_input text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_name text;
begin
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

-- 3. Promover romerosaraiva4 a owner
update profiles
set role = 'owner'
where id = '2d2573d9-2418-4094-ab43-87f439b85b8c';

-- 4. Definir PIN do owner (troque '123456' pelo PIN real desejado)
update profiles
set pin_hash = crypt('123456', gen_salt('bf'))
where id = '2d2573d9-2418-4094-ab43-87f439b85b8c';

-- 5. Verificar resultado
select id, name, role, active,
       case when pin_hash is not null then 'PIN definido' else 'sem PIN' end as pin_status
from profiles;
