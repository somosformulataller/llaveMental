-- ============================================================
-- 002 — Rol de administrador
-- Agrega la columna `role` a players y políticas RLS para que
-- un admin pueda leer todos los datos del juego (solo lectura).
-- El admin NO se registra desde la app: se promueve por SQL
-- (ver el UPDATE de ejemplo al final de este archivo).
-- ============================================================

-- 1. Columna de rol en players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'
  CHECK (role IN ('player', 'admin'));

-- 2. Función is_admin() — SECURITY DEFINER para evitar recursión
--    en las políticas RLS de la propia tabla players.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Políticas RLS de solo lectura para el admin
CREATE POLICY "players_admin_read" ON public.players
  FOR SELECT USING (public.is_admin());

CREATE POLICY "sessions_admin_read" ON public.game_sessions
  FOR SELECT USING (public.is_admin());

CREATE POLICY "history_admin_read" ON public.game_history
  FOR SELECT USING (public.is_admin());

-- 4. Impedir que un usuario se promueva a sí mismo a admin:
--    se quita el privilegio de UPDATE sobre la columna `role`.
--    (El rol solo se cambia desde el SQL Editor / service role.)
REVOKE UPDATE ON public.players FROM authenticated, anon;
GRANT UPDATE (username, balance, total_wagered, total_won)
  ON public.players TO authenticated;

-- ============================================================
-- CÓMO CREAR UN ADMINISTRADOR
-- 1) El admin se registra normalmente en la app (email/password).
-- 2) En el SQL Editor de Supabase, ejecuta (con su email real):
--
--   UPDATE public.players
--   SET role = 'admin'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@tudominio.com');
--
-- ============================================================
