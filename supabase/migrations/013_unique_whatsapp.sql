-- ============================================================
-- 013 — Teléfono (WhatsApp) ÚNICO por cuenta
--
-- Igual que la cédula (migración 011): una persona, una cuenta.
-- Se comparan los ÚLTIMOS 10 DÍGITOS para que "04121234567" y
-- "+584121234567" cuenten como el mismo número.
--
-- ⚠️ ANTES de correrla hay que resolver los teléfonos duplicados
-- que ya existen (si los hay): el índice único no se puede crear
-- mientras dos cuentas compartan número.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS players_whatsapp_unique
  ON public.players ((right(regexp_replace(whatsapp, '\D', '', 'g'), 10)))
  WHERE whatsapp IS NOT NULL AND regexp_replace(whatsapp, '\D', '', 'g') <> '';
