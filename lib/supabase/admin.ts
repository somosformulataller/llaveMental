import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Las variables cargadas por algunos shells/paneles pueden traer un
// BOM (U+FEFF) o espacios invisibles: en un header HTTP eso revienta
// con "Cannot convert argument to a ByteString". Siempre se limpian.
export function cleanEnv(value: string | undefined): string {
  return (value ?? '').replace(/^\uFEFF/, '').trim();
}

// Cliente privilegiado (secret key) — SOLO para rutas del servidor.
// Salta RLS y puede ejecutar los RPCs de dinero (migración 003).
// Nunca importar desde componentes cliente.
export function createAdminClient() {
  const key = cleanEnv(process.env.SUPABASE_SECRET_KEY);
  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY no está configurada');
  }
  return createSupabaseClient(cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminClientConfigured(): boolean {
  return cleanEnv(process.env.SUPABASE_SECRET_KEY).length > 0;
}
