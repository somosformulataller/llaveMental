-- ============================================================
-- 010 — Equipo del panel (roles y áreas) + historial de canjes
--
--  · Nuevo rol `support` (atención al cliente): entra al panel de
--    administración pero SOLO a las áreas que el admin le asigne
--    (columna panel_areas; NULL = todas para un admin).
--  · is_admin() pasa a reconocer a todo el STAFF (admin + support):
--    así las políticas RLS de lectura del panel y el chat funcionan
--    para atención al cliente sin tocar cada política. Qué área ve
--    cada quien lo decide el servidor (API) con panel_areas.
--  · Tabla ticket_redemptions: registro de cada canje de saldo por
--    tickets, para el historial detallado del jugador en el panel.
-- ============================================================

-- 1. Rol support + áreas del panel
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_role_check;
ALTER TABLE public.players
  ADD CONSTRAINT players_role_check CHECK (role IN ('player', 'admin', 'support'));

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS panel_areas TEXT[];

-- 2. is_admin() ahora significa "es staff del panel" (admin o support).
--    Las restricciones POR ÁREA las aplica la API con panel_areas.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = auth.uid() AND role IN ('admin', 'support')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. La analítica de interacción lista solo JUGADORES (ni admin ni support)
CREATE OR REPLACE FUNCTION public.get_interaction_stats()
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.last_seen DESC NULLS LAST), '[]'::json)
    FROM (
      SELECT
        p.id, p.username, p.tickets, p.balance, p.total_wagered, p.total_won,
        COALESCE(e.logins, 0)      AS logins,
        COALESCE(e.app_opens, 0)   AS app_opens,
        COALESCE(e.page_views, 0)  AS page_views,
        COALESCE(g.games, 0)       AS games,
        COALESCE(g.wins, 0)        AS wins,
        COALESCE(g.losses, 0)      AS losses,
        GREATEST(e.last_event, g.last_game) AS last_seen,
        p.created_at
      FROM public.players p
      LEFT JOIN (
        SELECT player_id,
          COUNT(*) FILTER (WHERE event_type = 'login')     AS logins,
          COUNT(*) FILTER (WHERE event_type = 'app_open')  AS app_opens,
          COUNT(*) FILTER (WHERE event_type = 'page_view') AS page_views,
          MAX(created_at) AS last_event
        FROM public.app_events GROUP BY player_id
      ) e ON e.player_id = p.id
      LEFT JOIN (
        SELECT player_id,
          COUNT(*)                          AS games,
          COUNT(*) FILTER (WHERE payout > 0) AS wins,
          COUNT(*) FILTER (WHERE payout = 0) AS losses,
          MAX(created_at) AS last_game
        FROM public.game_history GROUP BY player_id
      ) g ON g.player_id = p.id
      WHERE p.role = 'player'
    ) s
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Historial de canjes (saldo → tickets)
CREATE TABLE IF NOT EXISTS public.ticket_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity > 0),
  amount_usd DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_redemptions_player_idx
  ON public.ticket_redemptions (player_id, created_at DESC);

ALTER TABLE public.ticket_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "redemptions_own_read" ON public.ticket_redemptions
  FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "redemptions_admin_read" ON public.ticket_redemptions
  FOR SELECT USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.ticket_redemptions FROM anon, authenticated;

-- 5. redeem_tickets ahora deja constancia del canje
CREATE OR REPLACE FUNCTION public.redeem_tickets(p_qty INT)
RETURNS JSON AS $$
DECLARE
  v_player public.players%ROWTYPE;
  v_cost DECIMAL(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 500 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  v_cost := p_qty * 2.00;
  SELECT * INTO v_player FROM public.players WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;
  IF v_player.balance < v_cost THEN
    RAISE EXCEPTION 'Saldo insuficiente para canjear % ticket(s)', p_qty;
  END IF;
  UPDATE public.players
  SET balance = balance - v_cost, tickets = tickets + p_qty
  WHERE id = auth.uid();
  INSERT INTO public.ticket_redemptions (player_id, quantity, amount_usd)
  VALUES (auth.uid(), p_qty, v_cost);
  RETURN json_build_object(
    'balance', v_player.balance - v_cost,
    'tickets', v_player.tickets + p_qty
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
