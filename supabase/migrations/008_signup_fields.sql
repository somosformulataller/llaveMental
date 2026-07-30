-- ============================================================
-- 008 — Datos del jugador en el registro
--
-- El formulario de registro ahora pide nombre, apellido,
-- WhatsApp, cédula y la aceptación de los términos. Van en la
-- metadata del signup y el trigger los copia al perfil.
-- ============================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS cedula TEXT,
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;

-- El trigger de alta copia los datos del registro al perfil.
-- username = "Nombre Apellido" (o la parte local del correo si
-- el registro vino sin datos, p. ej. cuentas viejas).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (
    id, username, first_name, last_name, whatsapp, cedula, accepted_terms_at
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(CONCAT(
        NEW.raw_user_meta_data->>'first_name', ' ',
        NEW.raw_user_meta_data->>'last_name'
      )), ''),
      SPLIT_PART(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'whatsapp',
    NEW.raw_user_meta_data->>'cedula',
    CASE
      WHEN (NEW.raw_user_meta_data->>'accepted_terms') = 'true' THEN NOW()
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
