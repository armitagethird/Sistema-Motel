-- ============================================================
-- Migration V6 — Paraíso Motel
-- Substitui dados de teste por dados reais + nova modalidade
-- de cobrança (estadia 2h / pernoite + adicional R$15 por bloco
-- de 2h após o período base).
--
-- IMPORTANTE: este script DELETA todos os dados existentes em
-- suites, stays, inventory e inventory_movements. Use uma vez,
-- em ambiente com dados de teste.
--
-- Idempotente nas alterações de schema (pode re-executar);
-- o INSERT das suítes usa ON CONFLICT pra não duplicar.
-- ============================================================

-- ────────────────────────────────────────────────
-- 0. Limpeza de dados de teste
-- ────────────────────────────────────────────────

DELETE FROM inventory_movements;
DELETE FROM stays;
DELETE FROM inventory;
DELETE FROM suites;

-- ────────────────────────────────────────────────
-- 1. SUITES — novos tipos + coluna equipment
-- ────────────────────────────────────────────────

ALTER TABLE suites
  DROP CONSTRAINT IF EXISTS suites_type_check;

ALTER TABLE suites
  ADD CONSTRAINT suites_type_check
  CHECK (type IN ('simples','luxo','super_luxo'));

ALTER TABLE suites
  ADD COLUMN IF NOT EXISTS equipment text[] NOT NULL DEFAULT '{}';

-- ────────────────────────────────────────────────
-- 2. STAYS — modalidade estadia_2h | pernoite
--    + campos pra cálculo de adicional
-- ────────────────────────────────────────────────

ALTER TABLE stays
  DROP CONSTRAINT IF EXISTS stays_type_check;

ALTER TABLE stays
  ADD CONSTRAINT stays_type_check
  CHECK (type IN ('estadia_2h','pernoite'));

ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS expected_checkout_at timestamptz;

ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS extra_blocks integer NOT NULL DEFAULT 0;

ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS extra_value numeric NOT NULL DEFAULT 0;

-- ────────────────────────────────────────────────
-- 3. INVENTORY — novas categorias
-- ────────────────────────────────────────────────

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_category_check;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_category_check
  CHECK (category IN ('alimentacao','bombons','bebidas','diversos','patrimonio'));

-- ────────────────────────────────────────────────
-- 4. View v_suites_live atualizada
--    (inclui modalidade, expected_checkout_at, equipment)
-- ────────────────────────────────────────────────

DROP VIEW IF EXISTS v_suites_live;
CREATE VIEW v_suites_live AS
SELECT
  s.id,
  s.number                                                     AS numero,
  s.type                                                       AS tipo,
  s.status,
  s.prices                                                     AS precos,
  s.equipment                                                  AS equipamentos,
  st.id                                                        AS stay_id,
  st.type                                                      AS modalidade,
  st.opened_at,
  st.expected_checkout_at,
  st.payment_method,
  p.name                                                       AS funcionario_nome,
  ROUND(EXTRACT(EPOCH FROM (NOW() - st.opened_at)) / 60)       AS minutos_ocupada,
  ROUND(EXTRACT(EPOCH FROM (NOW() - s.updated_at)) / 60)       AS minutos_no_status_atual
FROM suites s
LEFT JOIN stays st
  ON st.suite_id = s.id
  AND st.payment_status = 'pending'
LEFT JOIN profiles p
  ON p.id = st.opened_by;

-- ────────────────────────────────────────────────
-- 5. SEED — 16 suítes
--    Preços (jsonb): { "2h": <numeric>, "pernoite": 90 }
-- ────────────────────────────────────────────────

INSERT INTO suites (number, type, status, prices, equipment) VALUES
  ( 1, 'luxo',       'free', '{"2h":50,"pernoite":90}'::jsonb, ARRAY['Espelho no teto','Cadeira erótica']),
  ( 2, 'luxo',       'free', '{"2h":50,"pernoite":90}'::jsonb, ARRAY['Espelho no teto','Cadeira erótica']),
  ( 3, 'luxo',       'free', '{"2h":50,"pernoite":90}'::jsonb, ARRAY['Espelho no teto','Cadeira erótica']),
  ( 4, 'luxo',       'free', '{"2h":50,"pernoite":90}'::jsonb, ARRAY['Espelho no teto','Cadeira erótica']),
  ( 5, 'luxo',       'free', '{"2h":50,"pernoite":90}'::jsonb, ARRAY['Espelho no teto','Cadeira erótica']),
  ( 6, 'luxo',       'free', '{"2h":50,"pernoite":90}'::jsonb, ARRAY['Espelho no teto','Cadeira erótica']),
  ( 7, 'super_luxo', 'free', '{"2h":80,"pernoite":90}'::jsonb, ARRAY['Sofá erótico','Espelho','Polidance']),
  ( 8, 'super_luxo', 'free', '{"2h":80,"pernoite":90}'::jsonb, ARRAY['Sofá erótico','Espelho no teto','Banheira']),
  ( 9, 'super_luxo', 'free', '{"2h":80,"pernoite":90}'::jsonb, ARRAY['Sofá erótico','Espelho no teto','Banheira']),
  (10, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[]),
  (11, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[]),
  (12, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[]),
  (13, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[]),
  (14, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[]),
  (15, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[]),
  (16, 'simples',    'free', '{"2h":40,"pernoite":90}'::jsonb, ARRAY[]::text[])
ON CONFLICT (number) DO UPDATE SET
  type      = EXCLUDED.type,
  prices    = EXCLUDED.prices,
  equipment = EXCLUDED.equipment;

-- ────────────────────────────────────────────────
-- 6. SEED — itens de estoque/cardápio
--    quantity inicial 0; recepção fará reposição via tela.
--    Patrimônio: unit_price 0, min_quantity 0 (controle de integridade).
-- ────────────────────────────────────────────────

-- Alimentação
INSERT INTO inventory (name, category, quantity, min_quantity, unit_price) VALUES
  ('Carne de Sol',             'alimentacao', 0, 5, 40.00),
  ('Calabresa',                'alimentacao', 0, 5, 25.00),
  ('Caldo de Ovos',            'alimentacao', 0, 5, 10.00),
  ('Batata Ondulada',          'alimentacao', 0, 5,  7.00),
  ('Ovos Cozidos ou Fritos',   'alimentacao', 0, 5,  3.00),
  ('Batata Frita',             'alimentacao', 0, 5, 10.00),
  ('Suco da Fruta c/ Leite',   'alimentacao', 0, 5, 10.00),
  ('Suco de Polpa',            'alimentacao', 0, 5, 10.00),
  ('Suco Psiu',                'alimentacao', 0, 5,  6.00),
  ('Misto',                    'alimentacao', 0, 5, 10.00),
  ('Nescau em Caixa',          'alimentacao', 0, 5,  5.00),
  ('Café da Manhã',            'alimentacao', 0, 5, 25.00);

-- Bombons
INSERT INTO inventory (name, category, quantity, min_quantity, unit_price) VALUES
  ('Trident',         'bombons', 0, 5,  4.00),
  ('Halls',           'bombons', 0, 5,  4.00),
  ('Talentos Barra',  'bombons', 0, 5, 15.00),
  ('Kit Kat',         'bombons', 0, 5,  8.00);

-- Bebidas
INSERT INTO inventory (name, category, quantity, min_quantity, unit_price) VALUES
  ('Água Mineral',             'bebidas', 0, 5,  5.00),
  ('Refri Lata',               'bebidas', 0, 5,  5.00),
  ('Cerveja Lata',             'bebidas', 0, 5,  8.00),
  ('Cerveja 600ml',            'bebidas', 0, 5, 12.00),
  ('Longneck',                 'bebidas', 0, 5, 12.00),
  ('ICE (Caipirinha pronta)',  'bebidas', 0, 5,  6.00),
  ('Campari (dose)',           'bebidas', 0, 5, 10.00),
  ('Whisky (dose)',            'bebidas', 0, 5, 10.00),
  ('Red Bull',                 'bebidas', 0, 5, 15.00);

-- Diversos
INSERT INTO inventory (name, category, quantity, min_quantity, unit_price) VALUES
  ('Preservativo',         'diversos', 0, 5,  5.00),
  ('Creme Erótico',        'diversos', 0, 5,  5.00),
  ('Absorvente (unidade)', 'diversos', 0, 5,  3.00),
  ('Escova (kit)',         'diversos', 0, 5,  8.00),
  ('Prestobarba',          'diversos', 0, 5,  5.00),
  ('Cigarro Free',         'diversos', 0, 5, 20.00),
  ('Toalha (extra)',       'diversos', 0, 5,  3.00),
  ('Lençol (extra)',       'diversos', 0, 5,  3.00),
  ('Fronha (extra)',       'diversos', 0, 5,  3.00),
  ('Copo',                 'diversos', 0, 5, 10.00),
  ('Touca',                'diversos', 0, 5,  5.00),
  ('Fósforo',              'diversos', 0, 5,  2.00);

-- Patrimônio (não vende — controle de integridade)
INSERT INTO inventory (name, category, quantity, min_quantity, unit_price) VALUES
  ('Cinzeiro',       'patrimonio', 0, 0, 0),
  ('Controle de TV', 'patrimonio', 0, 0, 0);

-- ============================================================
-- Fim. Após rodar:
--   - 16 suítes presentes (6 luxo, 3 super_luxo, 7 simples)
--   - 39 itens de inventário (12 alimentação, 4 bombons,
--     9 bebidas, 12 diversos, 2 patrimônio)
--   - constraints novas em suites/stays/inventory ativas
--   - colunas extras em stays prontas pra cobrança 2h
-- ============================================================
