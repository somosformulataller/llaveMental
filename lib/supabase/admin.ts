import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente privilegiado (secret key) — SOLO para rutas del servidor.
// Salta RLS y puede ejecutar los RPCs de dinero (migración 003).
// Nunca importar desde componentes cliente.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY no está configurada');
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}
