-- ============================================================
-- 003 — Pagos reales, billetera y fin del modo demo
--
-- A partir de aquí el juego deja de ser demo:
--  · Los tickets se compran con dinero real (Pago Móvil) y se
--    validan contra la API del banco.
--  · Jugar consume 1 ticket (1 ticket = $2.00, el TICKET_COST
--    de la lógica RTP/RNG, que NO cambia).
--  · Los premios se acreditan al saldo ($), que es retirable o
--    canjeable por tickets. Solo quien gana acumula saldo.
--  · Se cierran las escrituras directas del cliente sobre las
--    tablas de dinero: todo pasa por RPCs atómicos o por el
--    servidor (secret key).
-- ============================================================

-- ------------------------------------------------------------
-- 1. players: tickets, datos de Pago Móvil y fin del demo
-- ------------------------------------------------------------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS tickets INT NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  ADD COLUMN IF NOT EXISTS payout_name TEXT,
  ADD COLUMN IF NOT EXISTS payout_bank TEXT,
  ADD COLUMN IF NOT EXISTS payout_cedula TEXT,
  ADD COLUMN IF NOT EXISTS payout_phone TEXT;

-- Los nuevos registros ya no reciben $100 de regalo
ALTER TABLE public.players ALTER COLUMN balance SET DEFAULT 0.00;

-- Fin del modo demo: se limpian créditos de regalo y contadores
UPDATE public.players SET balance = 0.00, total_wagered = 0.00, total_won = 0.00;

-- ------------------------------------------------------------
-- 2. Compras de tickets (Pago Móvil + validación automática)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  amount_usd DECIMAL(10,2) NOT NULL,
  amount_ves DECIMAL(14,2),            -- monto esperado en Bs (NULL si no había tasa)
  exchange_rate_used DECIMAL(14,4),    -- tasa BCV usada, para auditoría
  reference TEXT NOT NULL,
  reference_norm TEXT GENERATED ALWAYS AS (lower(regexp_replace(reference, '\s', '', 'g'))) STORED,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'validando', 'aprobado', 'rechazado')),
  origin TEXT CHECK (origin IN ('auto', 'manual')),
  status_note TEXT,                    -- por qué quedó pendiente / motivo de rechazo
  bank_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

-- La misma referencia no se puede reutilizar (salvo que la anterior
-- haya sido rechazada). Normalizada: sin espacios, sin mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_purchases_ref_unique
  ON public.ticket_purchases (reference_norm) WHERE status <> 'rechazado';

CREATE INDEX IF NOT EXISTS ticket_purchases_player_idx
  ON public.ticket_purchases (player_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. Retiros (solo saldo de premios; uno a la vez)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  amount_usd DECIMAL(10,2) NOT NULL CHECK (amount_usd > 0),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'pagado', 'cancelado')),
  reference TEXT,                      -- referencia del Pago Móvil hecho por el admin
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS withdrawals_player_idx
  ON public.withdrawals (player_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. RLS: cada quien lee lo suyo; el admin lee todo
-- ------------------------------------------------------------
ALTER TABLE public.ticket_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_own_read" ON public.ticket_purchases
  FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "purchases_admin_read" ON public.ticket_purchases
  FOR SELECT USING (public.is_admin());

CREATE POLICY "withdrawals_own_read" ON public.withdrawals
  FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "withdrawals_admin_read" ON public.withdrawals
  FOR SELECT USING (public.is_admin());

-- ------------------------------------------------------------
-- 5. Con dinero real, el cliente NO escribe tablas de dinero.
--    Toda mutación pasa por RPCs (abajo) o por el servidor
--    (secret key). El cliente solo conserva la lectura.
-- ------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.game_sessions   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_history    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_purchases FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawals     FROM anon, authenticated;
REVOKE UPDATE ON public.players FROM anon, authenticated;
GRANT UPDATE (username) ON public.players TO authenticated;

-- ------------------------------------------------------------
-- 6. RPCs del JUGADOR (SECURITY DEFINER, validan auth.uid()).
--    Nota: el precio del ticket ($2.00) debe coincidir con
--    TICKET_COST en lib/game/constants.ts.
-- ------------------------------------------------------------

-- Canjear saldo de premios por tickets (1 ticket = $2.00)
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
  RETURN json_build_object(
    'balance', v_player.balance - v_cost,
    'tickets', v_player.tickets + p_qty
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Solicitar retiro del saldo de premios (uno a la vez)
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount DECIMAL)
RETURNS JSON AS $$
DECLARE
  v_player public.players%ROWTYPE;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount IS NULL OR p_amount < 1.00 THEN
    RAISE EXCEPTION 'El monto mínimo de retiro es $1.00';
  END IF;
  SELECT * INTO v_player FROM public.players WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;
  IF v_player.balance < p_amount THEN
    RAISE EXCEPTION 'El monto sobrepasa el saldo de tu billetera.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.withdrawals
    WHERE player_id = auth.uid() AND status = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Ya tienes un retiro en proceso. Podrás solicitar otro cuando sea pagado.';
  END IF;
  UPDATE public.players SET balance = balance - p_amount WHERE id = auth.uid();
  INSERT INTO public.withdrawals (player_id, amount_usd)
  VALUES (auth.uid(), p_amount) RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'balance', v_player.balance - p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Guardar los datos de Pago Móvil donde el jugador recibe premios
CREATE OR REPLACE FUNCTION public.save_payout_info(
  p_name TEXT, p_bank TEXT, p_cedula TEXT, p_phone TEXT
) RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.players
  SET payout_name = NULLIF(trim(p_name), ''),
      payout_bank = NULLIF(trim(p_bank), ''),
      payout_cedula = NULLIF(trim(p_cedula), ''),
      payout_phone = NULLIF(trim(p_phone), '')
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ranking de ganadores (top 50 por total ganado) + posición propia
CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS JSON AS $$
  SELECT json_build_object(
    'top', COALESCE((
      SELECT json_agg(t) FROM (
        SELECT username, total_won, (id = auth.uid()) AS is_me
        FROM public.players
        WHERE total_won > 0
        ORDER BY total_won DESC, created_at ASC
        LIMIT 50
      ) t), '[]'::json),
    'me', (
      SELECT json_build_object(
        'total_won', p.total_won,
        'rank', (SELECT COUNT(*) + 1 FROM public.players q WHERE q.total_won > p.total_won)
      )
      FROM public.players p
      WHERE p.id = auth.uid() AND p.total_won > 0
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.redeem_tickets(INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(DECIMAL) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_payout_info(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_tickets(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_payout_info(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;

-- ------------------------------------------------------------
-- 7. RPCs del SERVIDOR (solo secret key / service_role).
--    El cliente no puede ejecutarlas: son las operaciones de
--    dinero que dispara el backend (juego, validación, admin).
-- ------------------------------------------------------------

-- Consumir 1 ticket al iniciar una partida (buy-ticket)
CREATE OR REPLACE FUNCTION public.spend_ticket(p_player UUID)
RETURNS INT AS $$
DECLARE v_tickets INT;
BEGIN
  SELECT tickets INTO v_tickets FROM public.players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;
  IF v_tickets < 1 THEN RAISE EXCEPTION 'SIN_TICKETS'; END IF;
  UPDATE public.players
  SET tickets = tickets - 1, total_wagered = total_wagered + 2.00
  WHERE id = p_player;
  RETURN v_tickets - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Acreditar el premio de una partida ganada (try-key)
CREATE OR REPLACE FUNCTION public.credit_prize(p_player UUID, p_payout DECIMAL)
RETURNS VOID AS $$
BEGIN
  IF p_payout IS NULL OR p_payout < 0 THEN RAISE EXCEPTION 'Premio inválido'; END IF;
  UPDATE public.players
  SET balance = balance + p_payout, total_won = total_won + p_payout
  WHERE id = p_player;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Aprobar una compra (validación automática o decisión del admin)
CREATE OR REPLACE FUNCTION public.approve_purchase(
  p_purchase UUID, p_origin TEXT, p_bank JSONB DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_purchase public.ticket_purchases%ROWTYPE;
  v_tickets INT;
BEGIN
  SELECT * INTO v_purchase FROM public.ticket_purchases WHERE id = p_purchase FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF v_purchase.status = 'aprobado' THEN
    SELECT tickets INTO v_tickets FROM public.players WHERE id = v_purchase.player_id;
    RETURN json_build_object('status', 'aprobado', 'tickets', v_tickets);
  END IF;
  UPDATE public.ticket_purchases
  SET status = 'aprobado', origin = p_origin,
      bank_response = COALESCE(p_bank, bank_response),
      status_note = p_note, validated_at = NOW()
  WHERE id = p_purchase;
  UPDATE public.players
  SET tickets = tickets + v_purchase.quantity
  WHERE id = v_purchase.player_id
  RETURNING tickets INTO v_tickets;
  RETURN json_build_object('status', 'aprobado', 'tickets', v_tickets);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Rechazar una compra (SIEMPRE manual — la validación automática
-- nunca rechaza). Si ya estaba aprobada, descuenta los tickets
-- acreditados sin bajar de cero.
CREATE OR REPLACE FUNCTION public.reject_purchase(p_purchase UUID, p_note TEXT)
RETURNS VOID AS $$
DECLARE v_purchase public.ticket_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase FROM public.ticket_purchases WHERE id = p_purchase FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF v_purchase.status = 'rechazado' THEN RETURN; END IF;
  UPDATE public.ticket_purchases
  SET status = 'rechazado', status_note = p_note, validated_at = NOW()
  WHERE id = p_purchase;
  IF v_purchase.status = 'aprobado' THEN
    UPDATE public.players
    SET tickets = GREATEST(0, tickets - v_purchase.quantity)
    WHERE id = v_purchase.player_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Marcar un retiro como pagado (con la referencia del Pago Móvil)
CREATE OR REPLACE FUNCTION public.pay_withdrawal(
  p_withdrawal UUID, p_reference TEXT, p_note TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE v_w public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retiro no encontrado'; END IF;
  IF v_w.status <> 'pendiente' THEN RAISE EXCEPTION 'El retiro no está pendiente'; END IF;
  UPDATE public.withdrawals
  SET status = 'pagado', reference = p_reference, admin_note = p_note, paid_at = NOW()
  WHERE id = p_withdrawal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cancelar un retiro pendiente: el monto vuelve a la billetera
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(p_withdrawal UUID)
RETURNS VOID AS $$
DECLARE v_w public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retiro no encontrado'; END IF;
  IF v_w.status <> 'pendiente' THEN RAISE EXCEPTION 'El retiro no está pendiente'; END IF;
  UPDATE public.withdrawals SET status = 'cancelado' WHERE id = p_withdrawal;
  UPDATE public.players SET balance = balance + v_w.amount_usd WHERE id = v_w.player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Solo el servidor (secret key) puede ejecutar las funciones de dinero
REVOKE EXECUTE ON FUNCTION public.spend_ticket(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_prize(UUID, DECIMAL) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_purchase(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_purchase(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pay_withdrawal(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_withdrawal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_ticket(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_prize(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_purchase(UUID, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_purchase(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_withdrawal(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(UUID) TO service_role;

-- ------------------------------------------------------------
-- 8. Eventos de interacción (analítica del admin)
--    El cliente registra login / apertura / navegación; el
--    servidor registra partidas. Solo el admin los lee.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('login', 'app_open', 'page_view', 'game_start', 'game_win', 'game_lose')
  ),
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_events_player_idx ON public.app_events (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_events_created_idx ON public.app_events (created_at DESC);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_own_insert" ON public.app_events
  FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "events_admin_read" ON public.app_events
  FOR SELECT USING (public.is_admin());

REVOKE UPDATE, DELETE ON public.app_events FROM anon, authenticated;

-- Resumen de interacción por jugador (solo admin): inicios de
-- sesión, aperturas, navegación, partidas ganadas/perdidas y
-- última actividad (momento en que dejó de usar la app).
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
      WHERE p.role <> 'admin'
    ) s
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_interaction_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_interaction_stats() TO authenticated;

-- ------------------------------------------------------------
-- 9. Promover la cuenta del administrador
--    (la cuenta ya fue registrada en la app)
-- ------------------------------------------------------------
UPDATE public.players SET role = 'admin'
WHERE id IN (SELECT id FROM auth.users WHERE email = 'somosformulataller@gmail.com');
