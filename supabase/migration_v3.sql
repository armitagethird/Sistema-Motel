-- ============================================================
-- Migration V3 — Paraíso Motel
-- Idempotente: pode ser re-executada sem erro.
-- Problemas resolvidos:
--   1. updated_at em suites (para indicador de tempo em cleaning)
--   2. Soft delete em inventory_movements (status, cancelled_by, cancelled_at, cancel_reason)
--   3. Views para dashboard do dono
--   4. Realtime em tabelas adicionais
-- ============================================================

-- ────────────────────────────────────────────────
-- 1. updated_at em suites
-- ────────────────────────────────────────────────

ALTER TABLE suites
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS suites_updated_at ON suites;
CREATE TRIGGER suites_updated_at
  BEFORE UPDATE ON suites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

UPDATE suites SET updated_at = NOW() WHERE updated_at IS NULL;

-- ────────────────────────────────────────────────
-- 2. Soft delete em inventory_movements
--    Cada coluna em ALTER TABLE separado para evitar
--    abort por constraint já existente.
-- ────────────────────────────────────────────────

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled'));

ALTER TABLE inventory_movements
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE inventory_movements
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES profiles(id);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Policy para UPDATE — DO block garante idempotência
DO $$
BEGIN
  DROP POLICY IF EXISTS "inv_movements_update_manager" ON inventory_movements;
  DROP POLICY IF EXISTS "inv_movements_update" ON inventory_movements;
  CREATE POLICY "inv_movements_update" ON inventory_movements
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
END $$;

-- ────────────────────────────────────────────────
-- 3. Views para dashboard do dono
-- ────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_suites_live AS
SELECT
  s.id,
  s.number                                                     AS numero,
  s.type                                                       AS tipo,
  s.status,
  s.prices                                                     AS precos,
  st.id                                                        AS stay_id,
  st.opened_at,
  st.payment_method,
  p.name                                                       AS funcionario_nome,
  ROUND(EXTRACT(EPOCH FROM (NOW() - st.opened_at)) / 60)      AS minutos_ocupada,
  ROUND(EXTRACT(EPOCH FROM (NOW() - s.updated_at)) / 60)      AS minutos_no_status_atual
FROM suites s
LEFT JOIN stays st
  ON st.suite_id = s.id
  AND st.payment_status = 'pending'
LEFT JOIN profiles p
  ON p.id = st.opened_by;

CREATE OR REPLACE VIEW v_receita_hoje AS
SELECT
  payment_method,
  COUNT(*)            AS quantidade,
  SUM(price)          AS total
FROM stays
WHERE payment_status = 'confirmed'
  AND closed_at >= CURRENT_DATE
GROUP BY payment_method;

CREATE OR REPLACE VIEW v_turnos_ativos AS
SELECT
  sh.id,
  sh.started_at,
  p.name                                                                                    AS funcionario,
  p.role,
  COUNT(st.id)                                                                              AS stays_no_turno,
  COALESCE(SUM(st.price) FILTER (WHERE st.payment_status = 'confirmed'), 0)                AS caixa_parcial
FROM shifts sh
JOIN profiles p
  ON p.id = sh.user_id
LEFT JOIN stays st
  ON st.opened_by = sh.user_id
  AND st.opened_at >= sh.started_at
WHERE sh.ended_at IS NULL
GROUP BY sh.id, sh.started_at, p.name, p.role;

CREATE OR REPLACE VIEW v_alertas_pendentes AS
SELECT
  'divergencia_caixa'                                                               AS tipo,
  sh.id                                                                             AS referencia_id,
  ('Turno ' || p.name || ' — diferença R$' || ABS(sh.difference)::text)            AS descricao,
  sh.ended_at                                                                       AS gerado_em,
  'alta'                                                                            AS severidade
FROM shifts sh
JOIN profiles p ON p.id = sh.user_id
WHERE sh.ended_at IS NOT NULL
  AND sh.expected_cash IS NOT NULL
  AND sh.reported_cash IS NOT NULL
  AND ABS(sh.difference) > 0
  AND sh.ended_at >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'void_realizado',
  st.id,
  ('Void R$' || st.price::text || ' — stay ' || st.id),
  st.closed_at,
  'critica'
FROM stays st
WHERE st.payment_status = 'void'
  AND st.closed_at >= NOW() - INTERVAL '24 hours';

-- ────────────────────────────────────────────────
-- 4. Realtime — REPLICA IDENTITY e publicação
-- ────────────────────────────────────────────────

ALTER TABLE stays                REPLICA IDENTITY FULL;
ALTER TABLE shifts               REPLICA IDENTITY FULL;
ALTER TABLE inventory_movements  REPLICA IDENTITY FULL;

-- Executar no Supabase Dashboard > Database > Replication se necessário:
-- ALTER PUBLICATION supabase_realtime ADD TABLE stays, shifts, inventory_movements;
