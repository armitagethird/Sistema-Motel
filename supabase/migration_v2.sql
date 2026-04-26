-- ============================================================
-- Paraíso Motel — Migration v2
-- Aplicar no SQL Editor do Supabase (projeto já existente).
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ============================================================

-- ── Extensão ────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── Helper de role (evita recursão 42P17 em policies) ───────
create or replace function get_auth_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ── Novas colunas ────────────────────────────────────────────

-- C1: payment_method agora é nullable (definido no checkout, não no check-in)
alter table stays
  alter column payment_method drop not null;

-- I3: PIN hash para gerente/dono
alter table profiles
  add column if not exists pin_hash text;

-- M2: ip_address e user_agent no audit_log
alter table audit_log
  add column if not exists ip_address text,
  add column if not exists user_agent text;

-- ── Indexes de performance (M1) ──────────────────────────────
create index if not exists idx_stays_payment_status on stays(payment_status);
create index if not exists idx_stays_opened_by on stays(opened_by);
create index if not exists idx_stays_suite_id on stays(suite_id);
create index if not exists idx_stays_opened_at on stays(opened_at desc);
create index if not exists idx_audit_log_user on audit_log(user_id, created_at desc);
create index if not exists idx_audit_log_table on audit_log(table_name, created_at desc);
create index if not exists idx_inventory_movements_stay on inventory_movements(stay_id);
create index if not exists idx_inventory_movements_inventory on inventory_movements(inventory_id);
create index if not exists idx_shifts_user_id on shifts(user_id);

-- ── RLS: substituir policies problemáticas ───────────────────

-- C3: stays UPDATE — era só manager/owner, receptionist não conseguia fazer checkout
drop policy if exists "manager update" on stays;
drop policy if exists "stays_update" on stays;
create policy "stays_update" on stays
  for update to authenticated
  using (
    opened_by = auth.uid()
    or get_auth_role() in ('manager','owner')
  );

-- Garantir que stays_insert existe (renomeia "receptionist insert" se necessário)
drop policy if exists "receptionist insert" on stays;
drop policy if exists "stays_insert" on stays;
create policy "stays_insert" on stays
  for insert to authenticated
  with check (get_auth_role() in ('receptionist','manager','owner'));

-- Garantir stays_select existe
drop policy if exists "own stays select" on stays;
drop policy if exists "stays_select" on stays;
create policy "stays_select" on stays
  for select to authenticated using (true);

-- I1: profiles — permitir todos verem todos (sem subquery que causa 42P17)
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select to authenticated using (true);

-- Renomear policies de nomes genéricos para evitar conflitos futuros
drop policy if exists "all authenticated" on suites;
drop policy if exists "suites_all" on suites;
create policy "suites_all" on suites
  for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated" on inventory;
drop policy if exists "inventory_all" on inventory;
create policy "inventory_all" on inventory
  for all to authenticated using (true) with check (true);

drop policy if exists "insert only" on inventory_movements;
drop policy if exists "select own" on inventory_movements;
drop policy if exists "inv_movements_insert" on inventory_movements;
drop policy if exists "inv_movements_select" on inventory_movements;
create policy "inv_movements_insert" on inventory_movements
  for insert to authenticated with check (true);
create policy "inv_movements_select" on inventory_movements
  for select to authenticated using (true);

drop policy if exists "own shifts" on shifts;
drop policy if exists "shifts_all" on shifts;
create policy "shifts_all" on shifts
  for all to authenticated
  using (user_id = auth.uid() or get_auth_role() in ('manager','owner'));

drop policy if exists "insert only" on audit_log;
drop policy if exists "audit_insert_only" on audit_log;
create policy "audit_insert_only" on audit_log
  for insert to authenticated with check (true);

-- ── Audit trigger: corrigir + adicionar DELETE (I2, M3, M4) ──

-- Função: to_jsonb em vez de row_to_json, DELETE retorna OLD
create or replace function audit_trigger_fn() returns trigger as $$
begin
  insert into audit_log (user_id, table_name, operation, old_data, new_data)
  values (
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end
  );
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- I2: trigger de stays agora inclui DELETE
drop trigger if exists audit_stays on stays;
create trigger audit_stays
  after insert or update or delete on stays
  for each row execute function audit_trigger_fn();

-- inventory_movements: sem mudança, mas recria para pegar a função corrigida
drop trigger if exists audit_inventory_movements on inventory_movements;
create trigger audit_inventory_movements
  after insert on inventory_movements
  for each row execute function audit_trigger_fn();

-- ── validate_manager_pin (I3) ────────────────────────────────
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

-- ── Como definir PIN de um gerente ───────────────────────────
-- Rode separadamente após identificar o UUID do gerente:
--
--   update profiles
--   set pin_hash = crypt('123456', gen_salt('bf'))
--   where id = '<uuid-do-gerente>';
--
-- ============================================================
