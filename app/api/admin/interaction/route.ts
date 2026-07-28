import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Interacción de los jugadores (admin): inicios de sesión, partidas
// ganadas/perdidas, última actividad. Con ?player=<id> devuelve
// además los últimos eventos de ese jugador (su flujo en la app).
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data: me } = await supabase.from('players').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const { data, error } = await supabase.rpc('get_interaction_stats');
    if (error) {
      return NextResponse.json({ error: 'No se pudo cargar la interacción' }, { status: 500 });
    }

    const playerId = req.nextUrl.searchParams.get('player');
    let events = null;
    if (playerId) {
      const { data: rows } = await supabase
        .from('app_events')
        .select('id, player_id, event_type, path, created_at')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(50);
      events = rows ?? [];
    }

    return NextResponse.json({ players: data ?? [], events });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
