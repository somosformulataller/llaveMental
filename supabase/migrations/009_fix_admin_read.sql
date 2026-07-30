-- ============================================================
-- 009 — Reinstalar las políticas de lectura del ADMIN
--
-- Diagnóstico (30 jul 2026): en producción, el admin autenticado
-- solo veía SU fila de players (el Resumen del panel sumaba puros
-- ceros), aunque is_admin() devolvía true. Las políticas de la
-- migración 002 no quedaron activas. Aquí se reinstalan de forma
-- idempotente. (El panel además ya lee con la clave de servidor,
-- así que esto es defensa en profundidad.)
-- ============================================================

DROP POLICY IF EXISTS "players_admin_read" ON public.players;
CREATE POLICY "players_admin_read" ON public.players
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "sessions_admin_read" ON public.game_sessions;
CREATE POLICY "sessions_admin_read" ON public.game_sessions
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "history_admin_read" ON public.game_history;
CREATE POLICY "history_admin_read" ON public.game_history
  FOR SELECT USING (public.is_admin());
