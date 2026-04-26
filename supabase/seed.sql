-- ============================================================
-- Seed inicial — Paraíso Motel
-- Rode APÓS criar o primeiro usuário no Supabase Dashboard
-- (Authentication > Users > Add user)
-- ============================================================

-- 1. Suítes (ajuste os preços conforme a tabela real do motel)
insert into suites (number, type, status, prices) values
  (1,  'standard', 'free', '{"3h": 80,  "6h": 120, "12h": 180, "pernoite": 250}'),
  (2,  'standard', 'free', '{"3h": 80,  "6h": 120, "12h": 180, "pernoite": 250}'),
  (3,  'standard', 'free', '{"3h": 80,  "6h": 120, "12h": 180, "pernoite": 250}'),
  (4,  'standard', 'free', '{"3h": 80,  "6h": 120, "12h": 180, "pernoite": 250}'),
  (5,  'standard', 'free', '{"3h": 80,  "6h": 120, "12h": 180, "pernoite": 250}'),
  (6,  'luxo',     'free', '{"3h": 120, "6h": 180, "12h": 260, "pernoite": 350}'),
  (7,  'luxo',     'free', '{"3h": 120, "6h": 180, "12h": 260, "pernoite": 350}'),
  (8,  'luxo',     'free', '{"3h": 120, "6h": 180, "12h": 260, "pernoite": 350}'),
  (9,  'luxo',     'free', '{"3h": 120, "6h": 180, "12h": 260, "pernoite": 350}'),
  (10, 'luxo',     'free', '{"3h": 120, "6h": 180, "12h": 260, "pernoite": 350}'),
  (11, 'master',   'free', '{"3h": 180, "6h": 260, "12h": 380, "pernoite": 500}'),
  (12, 'master',   'free', '{"3h": 180, "6h": 260, "12h": 380, "pernoite": 500}'),
  (13, 'master',   'free', '{"3h": 180, "6h": 260, "12h": 380, "pernoite": 500}'),
  (14, 'master',   'free', '{"3h": 180, "6h": 260, "12h": 380, "pernoite": 500}'),
  (15, 'master',   'free', '{"3h": 180, "6h": 260, "12h": 380, "pernoite": 500}');

-- 2. Estoque inicial
insert into inventory (name, category, quantity, min_quantity, unit_price) values
  ('Água 500ml',       'bebida',  50, 10, 5.00),
  ('Coca-Cola 350ml',  'bebida',  30, 10, 8.00),
  ('Cerveja 350ml',    'bebida',  48, 12, 9.00),
  ('Energético 250ml', 'bebida',  20, 5,  15.00),
  ('Amendoim',         'snack',   30, 8,  6.00),
  ('Chocolate',        'snack',   20, 5,  8.00),
  ('Preservativo',     'higiene', 60, 20, 5.00),
  ('Toalha extra',     'higiene', 15, 5,  0.00);

-- 3. Perfil do owner (substitua o UUID pelo ID real do usuário criado no dashboard)
-- Vá em Authentication > Users, copie o UUID e cole abaixo:
--
-- insert into profiles (id, name, role) values
--   ('COLE-O-UUID-AQUI', 'Gerente', 'owner');
