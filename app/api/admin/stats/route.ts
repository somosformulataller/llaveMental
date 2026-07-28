import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Dashboard del administrador. Doble protección:
// 1) Verificación explícita de role='admin' en este endpoint.
// 2) Las políticas RLS "…_admin_read" (migración 002) — sin rol admin,
//    la base de datos no devuelve filas de otros jugadores.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: me } = await supabase
      .from('players')
      .select('role')
      .eq('id', user.id)
      .single();

    if (me?.role !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const [playersRes, ticketsRes, activeRes, recentRes, purchasesRes, withdrawalsRes] =
      await Promise.all([
        supabase
          .from('players')
          .select('id, username, balance, tickets, total_wagered, total_won, role, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('game_history')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('game_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('game_status', 'ACTIVE'),
        supabase
          .from('game_history')
          .select('id, player_id, payout, keys_tried_count, created_at, players(username)')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('ticket_purchases')
          .select('amount_usd')
          .eq('status', 'aprobado'),
        supabase
          .from('withdrawals')
          .select('amount_usd, status')
          .in('status', ['pendiente', 'pagado']),
      ]);

    const players = playersRes.data ?? [];
    const totalWagered = players.reduce((s, p) => s + Number(p.total_wagered ?? 0), 0);
    const totalPaid = players.reduce((s, p) => s + Number(p.total_won ?? 0), 0);
    const totalCollected = (purchasesRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount_usd ?? 0),
      0
    );
    const withdrawalRows = withdrawalsRes.data ?? [];
    const totalWithdrawn = withdrawalRows
      .filter((w) => w.status === 'pagado')
      .reduce((s, w) => s + Number(w.amount_usd ?? 0), 0);
    const pendingWithdrawals = withdrawalRows
      .filter((w) => w.status === 'pendiente')
      .reduce((s, w) => s + Number(w.amount_usd ?? 0), 0);
    const balanceOwed = players.reduce((s, p) => s + Number(p.balance ?? 0), 0);
    const ticketsCirculating = players.reduce((s, p) => s + Number(p.tickets ?? 0), 0);

    const recentGames = (recentRes.data ?? []).map((g) => {
      const { players: playerRel, ...rest } = g as typeof g & {
        players: { username: string | null } | null;
      };
      return { ...rest, username: playerRel?.username ?? null };
    });

    return NextResponse.json({
      stats: {
        total_players: players.length,
        total_tickets: ticketsRes.count ?? 0,
        total_wagered: totalWagered,
        total_paid: totalPaid,
        rtp_real: totalWagered > 0 ? totalPaid / totalWagered : null,
        active_sessions: activeRes.count ?? 0,
        // Finanzas reales (dinero, no créditos)
        total_collected: totalCollected,      // compras aprobadas ($)
        total_withdrawn: totalWithdrawn,      // retiros ya pagados ($)
        pending_withdrawals: pendingWithdrawals, // retiros por pagar ($)
        balance_owed: balanceOwed,            // saldo en billeteras ($)
        tickets_circulating: ticketsCirculating, // tickets sin jugar
        house_profit: totalWagered - totalPaid,  // ganancia del juego ($)
      },
      players,
      recent_games: recentGames,
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
