import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/admin/guard';

interface InteractionPlayer {
  id: string;
  username: string | null;
  balance: number;
  games: number;
}

// Interacción de los jugadores (staff con área 'interacciones'):
// sesiones, partidas, última actividad + un resumen con tops
// (saldo, jugadas, recargas, retiros) y contadores globales
// (partidas totales, jugadores que jugaron, recargas manuales vs
// automáticas). Con ?player=<id> devuelve además los últimos
// eventos de ese jugador (su flujo en la app).
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireStaff('interacciones');
    if (error) return error;

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc('get_interaction_stats');
    if (rpcError) {
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

    // ── Resumen: tops y contadores ──
    const players = (data ?? []) as InteractionPlayer[];
    const nameOf = new Map(players.map((p) => [p.id, p.username]));
    let summary = null;

    if (isAdminClientConfigured()) {
      const db = createAdminClient();
      const [purchasesRes, withdrawalsRes] = await Promise.all([
        db.from('ticket_purchases').select('player_id, origin').eq('status', 'aprobado'),
        db.from('withdrawals').select('player_id').eq('status', 'pagado'),
      ]);

      const purchaseRows = purchasesRes.data ?? [];
      const withdrawalRows = withdrawalsRes.data ?? [];

      const countBy = (rows: { player_id: string }[]) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(r.player_id, (m.get(r.player_id) ?? 0) + 1);
        return m;
      };
      const top = (m: Map<string, number>) =>
        [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, value]) => ({
            id,
            username: nameOf.get(id) ?? id.slice(0, 8),
            value,
          }));

      summary = {
        top_balance: [...players]
          .filter((p) => Number(p.balance) > 0)
          .sort((a, b) => Number(b.balance) - Number(a.balance))
          .slice(0, 5)
          .map((p) => ({ id: p.id, username: p.username, value: Number(p.balance) })),
        top_games: [...players]
          .filter((p) => p.games > 0)
          .sort((a, b) => b.games - a.games)
          .slice(0, 5)
          .map((p) => ({ id: p.id, username: p.username, value: p.games })),
        top_purchases: top(countBy(purchaseRows)),
        top_withdrawals: top(countBy(withdrawalRows)),
        total_games: players.reduce((s, p) => s + p.games, 0),
        players_played: players.filter((p) => p.games > 0).length,
        manual_recharges: purchaseRows.filter((r) => r.origin === 'manual').length,
        auto_recharges: purchaseRows.filter((r) => r.origin === 'auto').length,
      };
    }

    return NextResponse.json({ players, events, summary });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
