-- migration_v5.sql
-- Trigger para criar profile automaticamente ao adicionar usuário no Auth
-- Role padrão: 'receptionist' — altere via SQL se precisar de manager/owner

create or replace function handle_new_auth_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  insert into profiles (id, name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.email, 'Sem nome'),
    'receptionist',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
