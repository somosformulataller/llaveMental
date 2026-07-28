import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { drawPayoutTier } from '@/lib/game/rng';
import { INITIAL_VAULT } from '@/lib/game/constants';

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

    // 2. Tickets del jugador
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, tickets')
      .eq('id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    }

    // 3. ¿Ya hay una partida activa? Se reanuda con su estado COMPLETO
    //    (pozo real y llaves probadas), no se cobra otro ticket.
    const { data: existingSession } = await supabase
      .from('game_sessions')
      .select('id, current_vault, keys_tried')
      .eq('player_id', user.id)
      .eq('game_status', 'ACTIVE')
      .maybeSingle();

    if (existingSession) {
      return NextResponse.json(
        {
          error: 'Ya tienes una partida activa',
          session_id: existingSession.id,
          vault: Number(existingSession.current_vault),
          keys_tried: existingSession.keys_tried ?? [],
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
    const payoutTier = drawPayoutTier();

    // 6. Crear la sesión (cliente privilegiado: el navegador ya no
    //    puede escribir game_sessions)
    const admin = createAdminClient();
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
    });
  } catch (err) {
    console.error('buy-ticket error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
