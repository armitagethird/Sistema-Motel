-- ════════════════════════════════════════════════════════════════════
-- migration_v7.sql — Cobrança por hora + pré-pernoite
-- ════════════════════════════════════════════════════════════════════
--
-- Mudanças:
--   1. Adicional de estadia passa a ser por HORA (R$15/h, ceil) em vez
--      de blocos de 2h. Renomeia coluna `extra_blocks` → `extra_hours`
--      em `stays` para refletir nova semântica.
--
--   2. Pernoite passa a cobrar adicional de pré-meia-noite quando
--      contratado entre 22:00 e 23:59. Nova coluna `pre_pernoite_value`
--      armazena esse valor separado, pra deixar o breakdown legível
--      em relatórios e na tela de saída.
--
-- Não destrutivo (apenas ALTER + recreate de view).
-- ════════════════════════════════════════════════════════════════════

-- 1. Renomeia extra_blocks → extra_hours (mantém os dados existentes)
ALTER TABLE stays
  RENAME COLUMN extra_blocks TO extra_hours;

-- 2. Nova coluna pre_pernoite_value (R$ cobrados entre check-in e 00:00)
ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS pre_pernoite_value numeric NOT NULL DEFAULT 0;

-- 3. Recriar a view v_suites_live (sem mudança estrutural — só reflete
--    o rename pra evitar surpresa em cliente que faça SELECT * na view).
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
