import type { SupabaseClient } from '@supabase/supabase-js';

export const BLOCKED_MESSAGE =
  'Tu cuenta está bloqueada. Escríbenos por el chat de atención al cliente.';

// ¿Está bloqueado el jugador? Tolerante a que la migración 006 no
// haya corrido aún (si la columna no existe, nadie está bloqueado).
export async function isBlocked(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('blocked')
      .eq('id', userId)
      .single();
    if (error) return false;
    return (data as { blocked?: boolean } | null)?.blocked === true;
  } catch {
    return false;
  }
}
