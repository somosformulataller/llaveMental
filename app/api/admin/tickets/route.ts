import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: me } = await supabase.from('players').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return null;
}

interface Body {
  player_id: string;
  /** Positivo suma tickets, negativo resta (sin bajar de cero) */
  delta: number;
}

// Recarga manual de tickets del ADMIN a cualquier jugador (cortesías,
// correcciones, promociones). No toca el saldo ni la lógica RTP/RNG:
// solo el contador de tickets.
export async function POST(req: NextRequest) {
  try {
    const error = await requireAdmin();
    if (error) return error;
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'Falta SUPABASE_SECRET_KEY en el servidor' }, { status: 503 });
    }

    const body: Body = await req.json();
    const delta = Math.trunc(Number(body.delta));
    if (!body.player_id || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 500) {
      return NextResponse.json({ error: 'Cantidad inválida (entre -500 y 500)' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: player } = await admin
      .from('players')
      .select('id, username, tickets, role')
      .eq('id', body.player_id)
      .maybeSingle();
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    if (player.role === 'admin') {
      return NextResponse.json({ error: 'El administrador no juega ni recibe tickets' }, { status: 400 });
    }

    const tickets = Math.max(0, (player.tickets ?? 0) + delta);
    const { error: upError } = await admin
      .from('players')
      .update({ tickets })
      .eq('id', body.player_id);
    if (upError) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });

    return NextResponse.json({ ok: true, tickets, username: player.username });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
