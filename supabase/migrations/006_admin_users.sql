-- ============================================================
-- 006 — Gestión de usuarios desde el panel de administración
--
--  · Columna `blocked` en players: un jugador bloqueado no puede
--    jugar, comprar tickets, canjear ni retirar (lo valida el
--    servidor en cada ruta). El chat sí le queda abierto para
--    poder hablar con soporte.
--  · Eliminar un usuario se hace borrando su cuenta de auth
--    (players referencia auth.users ON DELETE CASCADE, y todas
--    las tablas del juego cuelgan de players igual): no necesita
--    SQL adicional.
-- ============================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;
