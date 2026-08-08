-- ============================================================
-- 012 — Seguimiento de la validación bancaria en vivo
--
-- El panel de Transacciones muestra, por cada compra pendiente,
-- cuántas veces se consultó al banco y cuándo fue la última vez
-- (con eso estima cuánto falta para el próximo intento del cron).
-- ============================================================

ALTER TABLE public.ticket_purchases
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_count INT NOT NULL DEFAULT 0;
