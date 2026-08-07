-- ============================================================
-- 011 — Cédula ÚNICA por jugador
--
-- La cédula identifica a la persona: no puede haber dos cuentas
-- con el mismo número. Se compara por sus DÍGITOS, así
-- "V-12.345.678" y "12345678" cuentan como la misma cédula.
--
-- ⚠️ ANTES DE CORRERLA: no puede haber cédulas repetidas o el
--    índice falla al crearse. Revisa/elimina las cuentas
--    duplicadas desde el panel (Usuarios) y vuelve a ejecutar.
--
-- La API de registro ya rechaza cédulas repetidas con un mensaje
-- amable; este índice es el candado definitivo en la base (cubre
-- también dos registros simultáneos).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS players_cedula_unique
  ON public.players ((regexp_replace(cedula, '\D', '', 'g')))
  WHERE cedula IS NOT NULL AND regexp_replace(cedula, '\D', '', 'g') <> '';
