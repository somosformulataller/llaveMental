import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Sesión de juego activa del jugador (si existe), con su estado
// COMPLETO: pozo real y llaves ya probadas. Permite salir de la app
// y volver a continuar la partida exactamente donde iba.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ session: null });

    const { data: session } = await supabase
      .from('game_sessions')
      .select('id, current_vault, keys_tried')
      .eq('player_id', user.id)
      .eq('game_status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) return NextResponse.json({ session: null });

    return NextResponse.json({
      session: {
        session_id: session.id,
        vault: Number(session.current_vault),
        keys_tried: session.keys_tried ?? [],
      },
    });
  } catch {
    return NextResponse.json({ session: null });
  }
}
