import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { BLOCKED_MESSAGE, isBlocked } from '@/lib/supabase/blocked';
import { drawPayoutTier, drawWinningTier } from '@/lib/game/rng';
import { INITIAL_VAULT, coinKeysRemaining } from '@/lib/game/constants';

// Inicia una partida consumiendo 1 ticket. La lógica RTP/RNG no
// cambia: el destino de la partida se sella aquí con drawPayoutTier
// (servidor). Lo único distinto al modo demo es el "ledger": ya no
// se descuenta saldo — se consume un ticket comprado.
export async function POST() {
  try {
    const supabase = await createClient();

    // 1. Verificar sesión
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!isAdminClientConfigured()) {
      return NextResponse.json(
        { error: 'El juego no está configurado todavía (falta SUPABASE_SECRET_KEY).' },
        { status: 503 }
      );
    }

    // 2. Tickets y rol del jugador
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, tickets, role')
      .eq('id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    }

    // El administrador NO juega: evita mezclar la banca con el juego
    if (player.role === 'admin') {
      return NextResponse.json(
        { error: 'La cuenta de administrador no puede jugar. Usa una cuenta de jugador.' },
        { status: 403 }
      );
    }

    // Jugador bloqueado por el admin: no puede jugar
    if (await isBlocked(supabase, user.id)) {
      return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 });
    }

    // 3. ¿Ya hay una partida activa? Se reanuda con su estado COMPLETO
    //    (pozo real y llaves probadas), no se cobra otro ticket.
    const { data: existingSession } = await supabase
      .from('game_sessions')
      .select('id, current_vault, keys_tried, target_payout')
      .eq('player_id', user.id)
      .eq('game_status', 'ACTIVE')
      .maybeSingle();

    if (existingSession) {
      const resumedKeys: number[] = existingSession.keys_tried ?? [];
      return NextResponse.json(
        {
          error: 'Ya tienes una partida activa',
          session_id: existingSession.id,
          vault: Number(existingSession.current_vault),
          keys_tried: resumedKeys,
          coin_keys: coinKeysRemaining(Number(existingSession.target_payout), resumedKeys.length),
        },
        { status: 409 }
      );
    }

    // 4. ¿Tiene tickets?
    if ((player.tickets ?? 0) < 1) {
      return NextResponse.json(
        { error: 'No tienes tickets. Compra tickets para jugar.', code: 'NO_TICKETS' },
        { status: 400 }
      );
    }

    // 5. RNG: seleccionar el destino de la partida (SOLO servidor)
    const admin = createAdminClient();
    let payoutTier = drawPayoutTier();

    // Corta-rachas: NUNCA 3 consolaciones seguidas. Si el sorteo dio
    // $0.50 y las 2 partidas anteriores del jugador también fueron
    // $0.50 (o menos), se resortea entre los premios de $2.50+. Los
    // pesos base de la tabla están calibrados por simulación para que
    // con esta regla el RTP global quede en 98.1%.
    if (payoutTier.payout === 0.5) {
      const { data: last2 } = await admin
        .from('game_history')
        .select('payout')
        .eq('player_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2);
      if (last2 && last2.length === 2 && last2.every((g) => Number(g.payout) <= 0.5)) {
        payoutTier = drawWinningTier();
      }
    }

    // 6. Crear la sesión (cliente privilegiado: el navegador ya no
    //    puede escribir game_sessions)
    const { data: session, error: sessionError } = await admin
      .from('game_sessions')
      .insert({
        player_id: user.id,
        target_payout: payoutTier.payout,
        required_errors: payoutTier.requiredErrors,
        errors_remaining: payoutTier.requiredErrors,
        current_vault: INITIAL_VAULT,
        keys_tried: [],
        game_status: 'ACTIVE',
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json({ error: 'Error al crear la partida' }, { status: 500 });
    }

    // 7. Consumir el ticket (RPC atómico; suma total_wagered)
    const { data: remainingTickets, error: spendError } = await admin.rpc('spend_ticket', {
      p_player: user.id,
    });

    if (spendError) {
      // Rollback: borrar la sesión creada
      await admin.from('game_sessions').delete().eq('id', session.id);
      if (spendError.message?.includes('SIN_TICKETS')) {
        return NextResponse.json(
          { error: 'No tienes tickets. Compra tickets para jugar.', code: 'NO_TICKETS' },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: 'Error al usar el ticket' }, { status: 500 });
    }

    // Analítica: partida iniciada
    await admin.from('app_events').insert({ player_id: user.id, event_type: 'game_start' });

    return NextResponse.json({
      session_id: session.id,
      vault: INITIAL_VAULT,
      tickets: Number(remainingTickets),
      // Llaves con monedas ocultas de esta partida (adelantos + puerta)
      coin_keys: coinKeysRemaining(payoutTier.payout, 0),
    });
  } catch (err) {
    console.error('buy-ticket error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
