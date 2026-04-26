-- ============================================================
-- Paraíso Motel — Schema Supabase
-- ============================================================

-- Hashing de PIN (bcrypt via pgcrypto)
create extension if not exists pgcrypto;

-- Helper: retorna role do usuário sem subquery dentro de policy de profiles
-- (evita infinite recursion 42P17)
create or replace function get_auth_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ============================================================
-- Tabelas
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id),
  name text not null,
  role text not null check (role in ('receptionist','manager','owner')),
  pin_hash text,      -- bcrypt hash do PIN — apenas manager/owner
  active boolean default true
);

create table suites (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  type text not null check (type in ('standard','luxo','master')),
  status text not null default 'free'
    check (status in ('free','occupied','cleaning','maintenance')),
  prices jsonb not null
);

create table stays (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid references suites(id) not null,
  opened_by uuid references profiles(id) not null,
  closed_by uuid references profiles(id),
  type text not null check (type in ('3h','6h','12h','pernoite')),
  price numeric not null,
  payment_method text check (payment_method in ('card','cash','pix')),  -- nullable: definido no checkout
  payment_status text not null default 'pending'
    check (payment_status in ('pending','confirmed','void')),
  stone_order_id text,
  void_approved_by uuid references profiles(id),
  void_reason text,
  offline_created boolean default false,
  opened_at timestamptz default now(),
  closed_at timestamptz
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  table_name text not null,
  operation text not null,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('bebida','snack','higiene','outro')),
  quantity integer not null default 0,
  min_quantity integer not null default 5,
  unit_price numeric not null
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid references inventory(id) not null,
  stay_id uuid references stays(id),
  user_id uuid references profiles(id) not null,
  quantity integer not null,
  reason text,
  offline_created boolean default false,
  created_at timestamptz default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  expected_cash numeric,
  reported_cash numeric,
  difference numeric generated always as (reported_cash - expected_cash) stored,
  signature text
);

-- ============================================================
-- Indexes de performance
-- ============================================================

create index if not exists idx_stays_payment_status on stays(payment_status);
create index if not exists idx_stays_opened_by on stays(opened_by);
create index if not exists idx_stays_suite_id on stays(suite_id);
create index if not exists idx_stays_opened_at on stays(opened_at desc);
create index if not exists idx_audit_log_user on audit_log(user_id, created_at desc);
create index if not exists idx_audit_log_table on audit_log(table_name, created_at desc);
create index if not exists idx_inventory_movements_stay on inventory_movements(stay_id);
create index if not exists idx_inventory_movements_inventory on inventory_movements(inventory_id);
create index if not exists idx_shifts_user_id on shifts(user_id);

-- ============================================================
-- RLS Policies
-- ============================================================

-- audit_log: INSERT only — nenhum UPDATE ou DELETE
alter table audit_log enable row level security;
create policy "audit_insert_only" on audit_log
  for insert to authenticated with check (true);

-- stays
alter table stays enable row level security;
create policy "stays_insert" on stays
  for insert to authenticated
  with check (get_auth_role() in ('receptionist','manager','owner'));
create policy "stays_select" on stays
  for select to authenticated using (true);
create policy "stays_update" on stays
  for update to authenticated
  using (
    opened_by = auth.uid()
    or get_auth_role() in ('manager','owner')
  );

-- profiles: todos os funcionários podem ver todos os profiles
-- (não usar subquery de profiles dentro desta policy — causa 42P17)
alter table profiles enable row level security;
create policy "profiles_select" on profiles
  for select to authenticated using (true);

-- suites
alter table suites enable row level security;
create policy "suites_all" on suites
  for all to authenticated using (true) with check (true);

-- inventory
alter table inventory enable row level security;
create policy "inventory_all" on inventory
  for all to authenticated using (true) with check (true);

-- inventory_movements
alter table inventory_movements enable row level security;
create policy "inv_movements_insert" on inventory_movements
  for insert to authenticated with check (true);
create policy "inv_movements_select" on inventory_movements
  for select to authenticated using (true);

-- shifts
alter table shifts enable row level security;
create policy "shifts_all" on shifts
  for all to authenticated
  using (user_id = auth.uid() or get_auth_role() in ('manager','owner'));

-- ============================================================
-- Audit Trigger
-- ============================================================

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

-- stays: INSERT, UPDATE e DELETE auditados
create trigger audit_stays
  after insert or update or delete on stays
  for each row execute function audit_trigger_fn();

-- inventory_movements: INSERT auditado
create trigger audit_inventory_movements
  after insert on inventory_movements
  for each row execute function audit_trigger_fn();

-- ============================================================
-- validate_manager_pin
-- Verifica PIN de gerente/dono via bcrypt (pgcrypto).
-- Retorna { user_id, name } ou null se PIN inválido.
-- ============================================================

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

-- ============================================================
-- Como definir o PIN de um gerente:
--   update profiles
--   set pin_hash = crypt('123456', gen_salt('bf'))
--   where id = '<uuid-do-gerente>';
-- ============================================================
