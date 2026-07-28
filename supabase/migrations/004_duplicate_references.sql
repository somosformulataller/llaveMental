-- ============================================================
-- 004 — Referencias repetidas: a revisión manual, no bloqueadas
--
-- El número de referencia de un Pago Móvil puede coincidir entre
-- bancos distintos. Antes, la base de datos bloqueaba el registro
-- (índice único) y el admin nunca veía el caso. Ahora la compra
-- duplicada SÍ se registra: queda 'pendiente' con una nota de
-- anomalía ("⚠ Referencia repetida…") para que el admin la revise
-- y decida. La validación automática NUNCA toca estas compras
-- (así no puede reclamar el pago de otra compra por error).
-- ============================================================

DROP INDEX IF EXISTS public.ticket_purchases_ref_unique;

-- Índice normal para buscar duplicados rápido
CREATE INDEX IF NOT EXISTS ticket_purchases_ref_norm_idx
  ON public.ticket_purchases (reference_norm);
