import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/admin/guard';
import { hasArea } from '@/lib/admin/areas';

// Dashboard del administrador. La identidad se verifica con la
// sesión (staff del panel); las LECTURAS van con la clave de
// servidor: así los totales suman TODOS los jugadores aunque alguna
// política RLS de lectura admin falte en la base (pasó en producción
// y el resumen quedaba en cero).
// El staff restringido recibe solo lo de sus áreas: sin 'resumen' no
// ve las estadísticas; sin 'partidas' no ve las últimas partidas.
export async function GET() {
  try {
    const { staff, error } = await requireStaff(['resumen', 'partidas']);
    if (error) return error;

    const canResumen = hasArea(staff!.role, staff!.panelAreas, 'resumen');
    const canPartidas = hasArea(staff!.role, staff!.panelAreas, 'partidas');

    const db = isAdminClientConfigured() ? createAdminClient() : await createClient();

    const [playersRes, ticketsRes, activeRes, recentRes, purchasesRes, withdrawalsRes] =
      await Promise.all([
        db
          .from('players')
          .select('id, username, balance, tickets, total_wagered, total_won, role, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
        db
          .from('game_history')
          .select('id', { count: 'exact', head: true }),
        db
          .from('game_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('game_status', 'ACTIVE'),
        canPartidas
          ? db
              .from('game_history')
              .select('id, player_id, payout, keys_tried_count, created_at, players(username)')
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
        db
          .from('ticket_purchases')
          .select('amount_usd, created_at, validated_at')
          .eq('status', 'aprobado'),
        db
          .from('withdrawals')
          .select('amount_usd, status, created_at, paid_at')
          .in('status', ['pendiente', 'pagado']),
      ]);

    const players = playersRes.data ?? [];
    const totalWagered = players.reduce((s, p) => s + Number(p.total_wagered ?? 0), 0);
    const totalPaid = players.reduce((s, p) => s + Number(p.total_won ?? 0), 0);
    const approvedPurchases = purchasesRes.data ?? [];
    const totalCollected = approvedPurchases.reduce((s, r) => s + Number(r.amount_usd ?? 0), 0);
    const withdrawalRows = withdrawalsRes.data ?? [];
    const paidWithdrawals = withdrawalRows.filter((w) => w.status === 'pagado');
    const totalWithdrawn = paidWithdrawals.reduce((s, w) => s + Number(w.amount_usd ?? 0), 0);
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
      stats: canResumen
        ? {
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
          }
        : null,
      players: canResumen ? players : [],
      recent_games: recentGames,
      // Movimientos aprobados/pagados para los filtros por período
      // del Resumen (el cliente calcula día / ayer / 7d / 30d)
      finance: canResumen
        ? {
            purchases: approvedPurchases.map((p) => ({
              amount_usd: Number(p.amount_usd ?? 0),
              created_at: p.created_at,
              validated_at: p.validated_at,
            })),
            withdrawals: paidWithdrawals.map((w) => ({
              amount_usd: Number(w.amount_usd ?? 0),
              created_at: w.created_at,
              paid_at: w.paid_at,
            })),
          }
        : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
