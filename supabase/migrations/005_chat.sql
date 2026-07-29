-- ============================================================
-- 005 — Chat de atención al cliente (jugador ↔ administrador)
--
--  · Un chat UNO A UNO: cada jugador tiene una sola conversación
--    con soporte. Solo hay dos remitentes: 'player' y 'support'.
--  · Sin mensajes automáticos: todo mensaje lo escribe una persona.
--  · Etiquetas de estado por conversación (pendiente/prioridad/
--    resuelto) y marcas de lectura POR LADO (jugador y admin),
--    de ahí salen los contadores de no leídos.
--  · Adjuntos (imagen/PDF/nota de voz) en un bucket PRIVADO:
--    solo el servidor (secret key) sube y firma enlaces.
--  · El cliente NUNCA escribe estas tablas: todos los mensajes
--    pasan por las rutas del servidor (así el remitente no se
--    puede falsificar). El cliente solo conserva la lectura RLS.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Conversaciones (una por jugador)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL UNIQUE REFERENCES public.players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'prioridad', 'resuelto')),
  last_message_at TIMESTAMPTZ,
  player_read_at TIMESTAMPTZ,   -- hasta cuándo leyó el jugador
  admin_read_at TIMESTAMPTZ,    -- hasta cuándo leyó el admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_conversations_last_idx
  ON public.chat_conversations (last_message_at DESC NULLS LAST);

-- ------------------------------------------------------------
-- 2. Mensajes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('player', 'support')),
  body TEXT CHECK (char_length(body) <= 2000),
  attachment_path TEXT,   -- ruta dentro del bucket chat-attachments
  attachment_name TEXT,
  attachment_type TEXT,   -- MIME (image/…, application/pdf, audio/…)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (body IS NOT NULL OR attachment_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS chat_messages_conv_idx
  ON public.chat_messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- 3. Preguntas rápidas (botones sugeridos, editables por el admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_quick_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 200),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preguntas por defecto (solo si la tabla está vacía)
INSERT INTO public.chat_quick_questions (question, position)
SELECT q, p FROM (VALUES
  ('¿Cómo compro tickets?', 1),
  ('¿Cómo retiro mis premios?', 2),
  ('No me llegaron mis tickets', 3),
  ('Tengo un problema con un pago', 4),
  ('¿Cómo se juega?', 5)
) AS defaults(q, p)
WHERE NOT EXISTS (SELECT 1 FROM public.chat_quick_questions);

-- ------------------------------------------------------------
-- 4. RLS: el jugador lee SU conversación; el admin lee todas.
--    Nadie escribe desde el cliente (todo va por el servidor).
-- ------------------------------------------------------------
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_quick_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_conv_own_read" ON public.chat_conversations
  FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "chat_conv_admin_read" ON public.chat_conversations
  FOR SELECT USING (public.is_admin());

CREATE POLICY "chat_msg_own_read" ON public.chat_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = conversation_id AND c.player_id = auth.uid()
  ));
CREATE POLICY "chat_msg_admin_read" ON public.chat_messages
  FOR SELECT USING (public.is_admin());

-- Las preguntas activas las ve cualquier jugador; el admin, todas
CREATE POLICY "chat_qq_read" ON public.chat_quick_questions
  FOR SELECT USING (active OR public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.chat_conversations   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_messages        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_quick_questions FROM anon, authenticated;

-- ------------------------------------------------------------
-- 5. Bucket PRIVADO para adjuntos (imagen, PDF, notas de voz).
--    Sin políticas de storage: solo el servidor (secret key)
--    sube archivos y genera enlaces firmados (1 hora).
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', FALSE, 5242880)
ON CONFLICT (id) DO NOTHING;
