-- ============================================================
-- 007 — Chat en TIEMPO REAL (Supabase Realtime)
--
-- Publica los mensajes del chat por Realtime: cuando alguien
-- escribe, el otro lado se entera AL INSTANTE (la campana del
-- jugador y el panel del admin), sin esperar el sondeo.
-- Con RLS activo, cada quien recibe solo lo que puede leer:
-- el jugador su conversación, el admin todas.
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- ya estaba publicada
END $$;
